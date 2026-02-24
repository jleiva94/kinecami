import { useState, useEffect } from 'react'
import { format, addDays, startOfToday, isSunday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  supabase,
  verificarDisponibilidad,
  agendarCita,
  getKinesiologo,
} from '../lib/supabase'
import './AgendarCita.css'

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return <div className={`toast toast-${type}`}>{msg}</div>
}

const PASOS = ['Fecha & Hora', 'Kinesiólogo', 'Tus Datos', 'Confirmar']

// ── Genera slots cada 30 min según día ──────────────────────────────────────
const getHorarios = (fechaStr) => {
  const dia = new Date(fechaStr + 'T12:00:00').getDay() // 0=Dom,6=Sab
  if (dia === 0) return []

  const [inicioH, finH] = dia === 6 ? [9, 15] : [6, 22]
  const slots = []

  for (let h = inicioH; h < finH; h++) {
    slots.push(`${String(h).padStart(2, '0')}:00`)
    // slot :30 solo si la cita completa (1h) termina antes del cierre
    if (h + 1 < finH) {
      slots.push(`${String(h).padStart(2, '0')}:30`)
    }
  }
  return slots
}

// Dado un slot "HH:MM", devuelve todos los slots que colisionan con él
// (los que comparten al menos 1 minuto de la ventana de 1 hora)
const slotsSolapados = (slot) => {
  const [h, m] = slot.split(':').map(Number)
  const inicioMin = h * 60 + m
  const finMin = inicioMin + 60

  // Un slot existente "s" ocupa [s, s+60). Hay solapamiento si s < finMin && s+60 > inicioMin
  // Equivale a: s ∈ (inicioMin-60, finMin)  →  s ∈ [inicioMin-30, inicioMin+30] para slots de 30 en 30
  const solapados = []
  for (let delta = -30; delta <= 30; delta += 30) {
    const mins = inicioMin + delta
    if (mins < 0) continue
    const hh = Math.floor(mins / 60)
    const mm = mins % 60
    solapados.push(`${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`)
  }
  return solapados
}

// Convierte "HH:MM" a minutos desde medianoche
const toMins = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m }

export default function AgendarCita() {
  const [paso, setPaso] = useState(0)
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null)
  const [horaSeleccionada, setHoraSeleccionada] = useState(null)
  const [kineSeleccionado, setKineSeleccionado] = useState(null)
  const [kinesiólogos, setKinesiólogos] = useState([])
  const [ocupacion, setOcupacion] = useState({}) // { "HH:MM": count }
  const [bloqueosPorKine, setBloqueosPorKine] = useState([]) // bloqueos del día
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [formPaciente, setFormPaciente] = useState({
    nombre: '', telefono: '', email: '', rut: ''
  })
  const [enviando, setEnviando] = useState(false)
  const [citaCreada, setCitaCreada] = useState(null)
  const [toast, setToast] = useState(null)

  const ahora = new Date()
  const hoy = startOfToday()

  // Función que verifica si un día tiene al menos un slot disponible con 4h de anticipación
  const diaHorasDisponibles = (dia) => {
    const fechaStr = format(dia, 'yyyy-MM-dd')
    const slots = getHorarios(fechaStr)
    if (slots.length === 0) return false
    const esHoy = fechaStr === format(ahora, 'yyyy-MM-dd')
    if (!esHoy) return true // días futuros siempre tienen slots potencialmente disponibles
    const ahoraMins = ahora.getHours() * 60 + ahora.getMinutes()
    return slots.some(slot => toMins(slot) - ahoraMins >= 4 * 60)
  }

  // Próximos 14 días hábiles (sin domingos, sin días sin slots disponibles)
  const diasDisponibles = Array.from({ length: 30 }, (_, i) => addDays(hoy, i))
    .filter(d => !isSunday(d) && diaHorasDisponibles(d))
    .slice(0, 14)

  // Auto-seleccionar el primer día disponible al montar
  useEffect(() => {
    if (diasDisponibles.length > 0 && !fechaSeleccionada) {
      setFechaSeleccionada(diasDisponibles[0])
    }
  }, []) // eslint-disable-line

  useEffect(() => {
    getKinesiologo().then(setKinesiólogos).catch(console.error)
  }, [])

  // Cargar ocupación Y bloqueos al cambiar fecha
  useEffect(() => {
    if (!fechaSeleccionada) return
    setCargandoSlots(true)
    const fechaStr = format(fechaSeleccionada, 'yyyy-MM-dd')

    Promise.all([
      supabase
        .from('citas')
        .select('hora_inicio, estado')
        .eq('fecha', fechaStr)
        .not('estado', 'in', '("rechazada","cancelada")'),
      supabase
        .from('bloqueos')
        .select('kinesiologo_id, tipo, hora_inicio, hora_fin')
        .eq('fecha', fechaStr)
    ]).then(([citasRes, bloqueosRes]) => {
      // Ocupación por solapamiento de citas
      const occ = {}
      ;(citasRes.data || []).forEach(c => {
        slotsSolapados(c.hora_inicio).forEach(s => {
          occ[s] = (occ[s] || 0) + 1
        })
      })
      setOcupacion(occ)
      setBloqueosPorKine(bloqueosRes.data || [])
      setCargandoSlots(false)
    })
  }, [fechaSeleccionada])

  // Cuántos kinesiólogos están bloqueados en un slot dado
  const kinesBloqueadosEnSlot = (slot) => {
    const slotMins = toMins(slot)
    const slotFinMins = slotMins + 60
    const kinesBloqueados = new Set()

    bloqueosPorKine.forEach(b => {
      if (b.tipo === 'dia_completo') {
        kinesBloqueados.add(b.kinesiologo_id)
      } else if (b.tipo === 'rango_horas' && b.hora_inicio && b.hora_fin) {
        const bInicio = toMins(b.hora_inicio.substring(0, 5))
        const bFin = toMins(b.hora_fin.substring(0, 5))
        // El slot solapa con el bloqueo si hay intersección
        if (slotMins < bFin && slotFinMins > bInicio) {
          kinesBloqueados.add(b.kinesiologo_id)
        }
      }
    })
    return kinesBloqueados.size
  }

  // Determina si un slot está disponible considerando:
  // 1. Anticipación mínima de 4 horas
  // 2. Capacidad (max 2 citas solapadas)
  // 3. Bloqueos: si los N kinesiólogos están todos bloqueados, no hay cupos
  const slotDisponible = (slot) => {
    const fechaStr = format(fechaSeleccionada, 'yyyy-MM-dd')
    const esHoy = fechaStr === format(ahora, 'yyyy-MM-dd')

    if (esHoy) {
      const slotMins = toMins(slot)
      const ahoraMins = ahora.getHours() * 60 + ahora.getMinutes()
      if (slotMins - ahoraMins < 4 * 60) return false
    }

    const citasEnSlot = ocupacion[slot] || 0
    const totalKines = kinesiólogos.length || 2
    const bloqueados = kinesBloqueadosEnSlot(slot)
    const kinesDisponibles = totalKines - bloqueados

    // No hay cupo si: ya hay 2 citas O no quedan kinesiólogos libres
    if (citasEnSlot >= 2) return false
    if (kinesDisponibles <= 0) return false
    // Si solo queda 1 kine libre y ya hay 1 cita, no hay más cupos
    if (kinesDisponibles <= citasEnSlot) return false

    return true
  }

  const horariosDelDia = fechaSeleccionada
    ? getHorarios(format(fechaSeleccionada, 'yyyy-MM-dd'))
    : []

  // Validaciones del formulario
  const handleNombreChange = (e) => {
    // Solo letras, espacios, tildes y ñ
    const val = e.target.value.replace(/[^a-zA-ZáéíóúÁÉÍÓÚñÑüÜ\s]/g, '')
    setFormPaciente(p => ({ ...p, nombre: val }))
  }

  const handleTelefonoChange = (e) => {
    // Solo dígitos, máximo 9
    const val = e.target.value.replace(/\D/g, '').slice(0, 9)
    setFormPaciente(p => ({ ...p, telefono: val }))
  }

  const handleAgendar = async () => {
    setEnviando(true)
    try {
      const fechaStr = format(fechaSeleccionada, 'yyyy-MM-dd')

      // Verificar disponibilidad en tiempo real
      const { disponible } = await verificarDisponibilidad(fechaStr, horaSeleccionada)
      if (!disponible) {
        setToast({ msg: 'Lo sentimos, ese horario acaba de ser tomado. Por favor elige otro.', type: 'error' })
        setPaso(0)
        setHoraSeleccionada(null)
        setEnviando(false)
        return
      }

      const cita = await agendarCita({
        paciente_nombre: formPaciente.nombre.trim(),
        paciente_telefono: '56' + formPaciente.telefono.trim(),
        paciente_email: formPaciente.email.trim() || null,
        paciente_rut: formPaciente.rut.trim() || null,
        motivo_consulta: null,
        fecha: fechaStr,
        hora_inicio: horaSeleccionada,
        kinesiologo_id: kineSeleccionado?.id || null,
        estado: 'pendiente'
      })

      setCitaCreada(cita)
    } catch (err) {
      setToast({ msg: 'Error al agendar. Intenta nuevamente.', type: 'error' })
    } finally {
      setEnviando(false)
    }
  }

  // Calcular hora de término (slot + 1h)
  const horaTermino = (slot) => {
    if (!slot) return ''
    const [h, m] = slot.split(':').map(Number)
    const finMins = h * 60 + m + 60
    return `${String(Math.floor(finMins / 60)).padStart(2, '0')}:${String(finMins % 60).padStart(2, '0')}`
  }

  if (citaCreada) {
    return <Exito cita={citaCreada} kine={kineSeleccionado} />
  }

  return (
    <div className="agendar-wrapper">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="agendar-header">
        <div className="header-inner">
          <div className="logo-mark">KS</div>
          <div>
            <h1 className="clinic-name">KineStrong</h1>
            <p className="clinic-sub">Reserva tu hora en línea</p>
          </div>
        </div>
      </header>

      {/* Progress */}
      <div className="progress-bar">
        {PASOS.map((p, i) => (
          <div key={p} className={`progress-step ${i <= paso ? 'active' : ''} ${i < paso ? 'done' : ''}`}>
            <div className="step-num">{i < paso ? '✓' : i + 1}</div>
            <span>{p}</span>
          </div>
        ))}
      </div>

      <main className="agendar-main">

        {/* PASO 0: Fecha y Hora */}
        {paso === 0 && (
          <div className="paso-container">
            <h2 className="paso-title">¿Cuándo quieres venir?</h2>
            <p className="paso-subtitle">Lunes a viernes 6:00–22:00 · Sábados 9:00–15:00</p>

            <div className="calendar-grid">
              {diasDisponibles.map(dia => {
                const diaStr = format(dia, 'yyyy-MM-dd')
                const esSel = fechaSeleccionada && format(fechaSeleccionada, 'yyyy-MM-dd') === diaStr
                return (
                  <button
                    key={diaStr}
                    className={`cal-day ${esSel ? 'selected' : ''}`}
                    onClick={() => { setFechaSeleccionada(dia); setHoraSeleccionada(null) }}
                  >
                    <span className="cal-dow">{format(dia, 'EEE', { locale: es })}</span>
                    <span className="cal-num">{format(dia, 'd')}</span>
                    <span className="cal-mes">{format(dia, 'MMM', { locale: es })}</span>
                  </button>
                )
              })}
            </div>

            {fechaSeleccionada && (
              <div className="horas-section">
                <h3 className="horas-title">
                  Horarios para el {format(fechaSeleccionada, "EEEE d 'de' MMMM", { locale: es })}
                </h3>
                {cargandoSlots ? (
                  <div className="spinner" style={{ margin: '20px auto' }} />
                ) : (
                  <div className="horas-grid">
                    {horariosDelDia
                      .filter(slot => slotDisponible(slot))
                      .map(slot => {
                        const esSel = horaSeleccionada === slot
                        return (
                          <button
                            key={slot}
                            className={`hora-btn ${esSel ? 'selected' : ''}`}
                            onClick={() => setHoraSeleccionada(slot)}
                          >
                            {slot}
                          </button>
                        )
                      })
                    }
                    {horariosDelDia.filter(slot => slotDisponible(slot)).length === 0 && (
                      <p style={{ color: 'var(--mid-gray)', fontSize: '0.9rem', gridColumn: '1/-1' }}>
                        No hay horarios disponibles para este día.
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="paso-nav">
              <span />
              <button
                className="btn btn-primary"
                disabled={!fechaSeleccionada || !horaSeleccionada}
                onClick={() => setPaso(1)}
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* PASO 1: Kinesiólogo — sin opción "Sin preferencia", sin subtítulo */}
        {paso === 1 && (
          <div className="paso-container">
            <h2 className="paso-title">¿Con quién quieres atenderte?</h2>

            <div className="kine-grid">
              {kinesiólogos.map(k => (
                <button
                  key={k.id}
                  className={`kine-card ${kineSeleccionado?.id === k.id ? 'selected' : ''}`}
                  onClick={() => setKineSeleccionado(k)}
                >
                  <div className="kine-avatar">{k.nombre.charAt(0)}</div>
                  <div className="kine-info">
                    <strong>{k.nombre}</strong>
                    <span>Kinesióloga/o</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="paso-nav">
              <button className="btn btn-secondary" onClick={() => setPaso(0)}>← Atrás</button>
              <button
                className="btn btn-primary"
                disabled={!kineSeleccionado}
                onClick={() => setPaso(2)}
              >
                Continuar →
              </button>
            </div>
          </div>
        )}

        {/* PASO 2: Datos del paciente */}
        {paso === 2 && (
          <div className="paso-container">
            <h2 className="paso-title">Tus datos</h2>

            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Nombre completo *</label>
                <input
                  className="form-input"
                  placeholder="Ej: María González"
                  value={formPaciente.nombre}
                  onChange={handleNombreChange}
                />
              </div>

              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Teléfono *</label>
                <div className="telefono-wrapper">
                  <span className="telefono-prefix">+56</span>
                  <input
                    className="form-input telefono-input"
                    placeholder="912345678"
                    value={formPaciente.telefono}
                    onChange={handleTelefonoChange}
                    inputMode="numeric"
                    maxLength={9}
                  />
                </div>
                <span className="field-hint">9 dígitos, sin el 0 inicial. Ej: 912345678</span>
              </div>

              <div className="form-group">
                <label className="form-label">RUT <span className="hint">Opcional</span></label>
                <input
                  className="form-input"
                  placeholder="12.345.678-9"
                  value={formPaciente.rut}
                  onChange={e => setFormPaciente(p => ({ ...p, rut: e.target.value }))}
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email <span className="hint">Opcional</span></label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="tu@correo.cl"
                  value={formPaciente.email}
                  onChange={e => setFormPaciente(p => ({ ...p, email: e.target.value }))}
                />
              </div>
            </div>

            <div className="paso-nav">
              <button className="btn btn-secondary" onClick={() => setPaso(1)}>← Atrás</button>
              <button
                className="btn btn-primary"
                disabled={!formPaciente.nombre || formPaciente.telefono.length !== 9}
                onClick={() => setPaso(3)}
              >
                Revisar →
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Confirmación — sin "Tipo de atención" */}
        {paso === 3 && (
          <div className="paso-container">
            <h2 className="paso-title">Revisa tu reserva</h2>

            <div className="resumen-card">
              <div className="resumen-item">
                <span className="resumen-icon">📅</span>
                <div>
                  <strong>Fecha</strong>
                  <span>{format(fechaSeleccionada, "EEEE d 'de' MMMM, yyyy", { locale: es })}</span>
                </div>
              </div>
              <div className="resumen-item">
                <span className="resumen-icon">🕐</span>
                <div>
                  <strong>Hora</strong>
                  <span>{horaSeleccionada} – {horaTermino(horaSeleccionada)}</span>
                </div>
              </div>
              <div className="resumen-item">
                <span className="resumen-icon">👩‍⚕️</span>
                <div>
                  <strong>Profesional</strong>
                  <span>{kineSeleccionado?.nombre}</span>
                </div>
              </div>
              <hr className="resumen-hr" />
              <div className="resumen-item">
                <span className="resumen-icon">👤</span>
                <div>
                  <strong>Paciente</strong>
                  <span>{formPaciente.nombre}</span>
                </div>
              </div>
              <div className="resumen-item">
                <span className="resumen-icon">📱</span>
                <div>
                  <strong>Teléfono</strong>
                  <span>+56 {formPaciente.telefono}</span>
                </div>
              </div>
              {formPaciente.rut && (
                <div className="resumen-item">
                  <span className="resumen-icon">🪪</span>
                  <div>
                    <strong>RUT</strong>
                    <span>{formPaciente.rut}</span>
                  </div>
                </div>
              )}
              {formPaciente.email && (
                <div className="resumen-item">
                  <span className="resumen-icon">✉️</span>
                  <div>
                    <strong>Email</strong>
                    <span>{formPaciente.email}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="paso-nav">
              <button className="btn btn-secondary" onClick={() => setPaso(2)}>← Editar</button>
              <button
                className="btn btn-primary"
                onClick={handleAgendar}
                disabled={enviando}
              >
                {enviando ? 'Agendando...' : 'Confirmar Reserva ✓'}
              </button>
            </div>
          </div>
        )}

      </main>
    </div>
  )
}

function Exito({ cita, kine }) {
  const horaTermino = (slot) => {
    if (!slot) return ''
    const [h, m] = slot.split(':').map(Number)
    const finMins = h * 60 + m + 60
    return `${String(Math.floor(finMins / 60)).padStart(2, '0')}:${String(finMins % 60).padStart(2, '0')}`
  }

  return (
    <div className="exito-wrapper">
      <div className="exito-card">
        <div className="exito-icon">✓</div>
        <h2>¡Reserva enviada!</h2>
        <p>Tu solicitud fue recibida. El equipo se pondrá en contacto contigo para confirmar tu hora.</p>
        <div className="exito-detalle">
          <p><strong>Fecha:</strong> {cita.fecha}</p>
          <p><strong>Hora:</strong> {cita.hora_inicio} – {horaTermino(cita.hora_inicio)}</p>
          <p><strong>Profesional:</strong> {kine?.nombre}</p>
          <p><strong>Estado:</strong> <span className="badge badge-pendiente">Pendiente confirmación</span></p>
        </div>
        <button className="btn btn-outline" onClick={() => window.location.reload()}>
          Agendar otra hora
        </button>
      </div>
    </div>
  )
}
