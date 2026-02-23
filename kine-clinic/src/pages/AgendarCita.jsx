import { useState, useEffect } from 'react'
import { format, addDays, startOfToday, isSunday } from 'date-fns'
import { es } from 'date-fns/locale'
import {
  supabase,
  getHorariosDisponibles,
  verificarDisponibilidad,
  agendarCita,
  getKinesiólogos,
  getCitasRango
} from '../lib/supabase'
import './AgendarCita.css'

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return <div className={`toast toast-${type}`}>{msg}</div>
}

const PASOS = ['Fecha & Hora', 'Kinesiólogo', 'Tus Datos', 'Confirmar']

export default function AgendarCita() {
  const [paso, setPaso] = useState(0)
  const [fechaSeleccionada, setFechaSeleccionada] = useState(null)
  const [horaSeleccionada, setHoraSeleccionada] = useState(null)
  const [kineSeleccionado, setKineSeleccionado] = useState(null)
  const [kinesiólogos, setKinesiólogos] = useState([])
  const [slotsOcupados, setSlotsOcupados] = useState({})
  const [cargandoSlots, setCargandoSlots] = useState(false)
  const [formPaciente, setFormPaciente] = useState({
    nombre: '', telefono: '', email: '', rut: '', motivo: ''
  })
  const [enviando, setEnviando] = useState(false)
  const [citaCreada, setCitaCreada] = useState(null)
  const [toast, setToast] = useState(null)

  const hoy = startOfToday()
  // Generar próximos 30 días (sin domingos)
  const diasDisponibles = Array.from({ length: 35 }, (_, i) => addDays(hoy, i + 1))
    .filter(d => !isSunday(d))
    .slice(0, 30)

  useEffect(() => {
    getKinesiólogos().then(setKinesiólogos).catch(console.error)
  }, [])

  // Cuando cambia la fecha, cargar ocupación
  useEffect(() => {
    if (!fechaSeleccionada) return
    setCargandoSlots(true)
    const fechaStr = format(fechaSeleccionada, 'yyyy-MM-dd')
    supabase
      .from('citas')
      .select('hora_inicio, tipo_atencion, estado')
      .eq('fecha', fechaStr)
      .not('estado', 'in', '("rechazada","cancelada")')
      .then(({ data }) => {
        const ocupacion = {}
        ;(data || []).forEach(c => {
          if (!ocupacion[c.hora_inicio]) ocupacion[c.hora_inicio] = 0
          ocupacion[c.hora_inicio]++
        })
        setSlotsOcupados(ocupacion)
        setCargandoSlots(false)
      })
  }, [fechaSeleccionada])

  const horariosDelDia = fechaSeleccionada
    ? getHorariosDisponibles(format(fechaSeleccionada, 'yyyy-MM-dd'))
    : []

  const slotDisponible = (hora) => (slotsOcupados[hora] || 0) < 2

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
        paciente_telefono: formPaciente.telefono.trim(),
        paciente_email: formPaciente.email.trim() || null,
        paciente_rut: formPaciente.rut.trim() || null,
        motivo_consulta: formPaciente.motivo.trim() || null,
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

  if (citaCreada) {
    return <Exito cita={citaCreada} kine={kineSeleccionado} />
  }

  return (
    <div className="agendar-wrapper">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Header */}
      <header className="agendar-header">
        <div className="header-inner">
          <div className="logo-mark">K</div>
          <div>
            <h1 className="clinic-name">Clínica de Kinesiología</h1>
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
                    {horariosDelDia.map(hora => {
                      const disp = slotDisponible(hora)
                      const esSel = horaSeleccionada === hora
                      return (
                        <button
                          key={hora}
                          className={`hora-btn ${disp ? '' : 'ocupado'} ${esSel ? 'selected' : ''}`}
                          onClick={() => disp && setHoraSeleccionada(hora)}
                          disabled={!disp}
                        >
                          {hora}
                          {!disp && <span className="ocupado-tag">Ocupado</span>}
                        </button>
                      )
                    })}
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

        {/* PASO 1: Kinesiólogo */}
        {paso === 1 && (
          <div className="paso-container">
            <h2 className="paso-title">¿Con quién quieres atenderte?</h2>
            <p className="paso-subtitle">Puedes dejar sin preferencia si no importa</p>

            <div className="kine-grid">
              <button
                className={`kine-card ${kineSeleccionado === null ? 'selected' : ''}`}
                onClick={() => setKineSeleccionado(null)}
              >
                <div className="kine-avatar">?</div>
                <div className="kine-info">
                  <strong>Sin preferencia</strong>
                  <span>El equipo asignará al profesional disponible</span>
                </div>
              </button>
              {kinesiólogos.map(k => (
                <button
                  key={k.id}
                  className={`kine-card ${kineSeleccionado?.id === k.id ? 'selected' : ''}`}
                  onClick={() => setKineSeleccionado(k)}
                >
                  <div className="kine-avatar">{k.nombre.charAt(0)}</div>
                  <div className="kine-info">
                    <strong>{k.nombre}</strong>
                    <span>Kinesióloga</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="paso-nav">
              <button className="btn btn-secondary" onClick={() => setPaso(0)}>← Atrás</button>
              <button className="btn btn-primary" onClick={() => setPaso(2)}>Continuar →</button>
            </div>
          </div>
        )}

        {/* PASO 2: Datos del paciente */}
        {paso === 2 && (
          <div className="paso-container">
            <h2 className="paso-title">Tus datos</h2>
            <p className="paso-subtitle">Para confirmar y notificarte tu reserva</p>

            <div className="form-grid">
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Nombre completo *</label>
                <input
                  className="form-input"
                  placeholder="Ej: María González"
                  value={formPaciente.nombre}
                  onChange={e => setFormPaciente(p => ({ ...p, nombre: e.target.value }))}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Teléfono WhatsApp * <span className="hint">Con código país, ej: 56912345678</span></label>
                <input
                  className="form-input"
                  placeholder="56912345678"
                  value={formPaciente.telefono}
                  onChange={e => setFormPaciente(p => ({ ...p, telefono: e.target.value }))}
                />
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
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Email <span className="hint">Opcional</span></label>
                <input
                  className="form-input"
                  type="email"
                  placeholder="tu@correo.cl"
                  value={formPaciente.email}
                  onChange={e => setFormPaciente(p => ({ ...p, email: e.target.value }))}
                />
              </div>
              <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                <label className="form-label">Motivo de consulta <span className="hint">Opcional</span></label>
                <textarea
                  className="form-textarea"
                  placeholder="Describe brevemente tu lesión o motivo de consulta..."
                  value={formPaciente.motivo}
                  onChange={e => setFormPaciente(p => ({ ...p, motivo: e.target.value }))}
                />
              </div>
            </div>

            <div className="whatsapp-notice">
              <span>📱</span>
              <p>Recibirás una notificación por WhatsApp cuando tu cita sea confirmada. 
                Necesitas tener activado el bot de CallMeBot — 
                <a href="https://www.callmebot.com/blog/free-api-whatsapp-messages/" target="_blank" rel="noreferrer">
                  ver instrucciones
                </a>.
              </p>
            </div>

            <div className="paso-nav">
              <button className="btn btn-secondary" onClick={() => setPaso(1)}>← Atrás</button>
              <button
                className="btn btn-primary"
                disabled={!formPaciente.nombre || !formPaciente.telefono}
                onClick={() => setPaso(3)}
              >
                Revisar →
              </button>
            </div>
          </div>
        )}

        {/* PASO 3: Confirmación */}
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
                  <span>{horaSeleccionada} – {String(parseInt(horaSeleccionada) + 1).padStart(2, '0')}:00</span>
                </div>
              </div>
              <div className="resumen-item">
                <span className="resumen-icon">👩‍⚕️</span>
                <div>
                  <strong>Profesional</strong>
                  <span>{kineSeleccionado?.nombre || 'Sin preferencia'}</span>
                </div>
              </div>
              <div className="resumen-item">
                <span className="resumen-icon">🏥</span>
                <div>
                  <strong>Tipo de atención</strong>
                  <span>El kinesiólogo lo definirá al confirmar</span>
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
                  <strong>WhatsApp</strong>
                  <span>+{formPaciente.telefono}</span>
                </div>
              </div>
              {formPaciente.motivo && (
                <div className="resumen-item">
                  <span className="resumen-icon">📝</span>
                  <div>
                    <strong>Motivo</strong>
                    <span>{formPaciente.motivo}</span>
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
  return (
    <div className="exito-wrapper">
      <div className="exito-card">
        <div className="exito-icon">✓</div>
        <h2>¡Reserva enviada!</h2>
        <p>Tu solicitud fue recibida correctamente. El equipo la revisará y recibirás una notificación por WhatsApp cuando sea confirmada.</p>
        <div className="exito-detalle">
          <p><strong>Fecha:</strong> {cita.fecha}</p>
          <p><strong>Hora:</strong> {cita.hora_inicio}</p>
          <p><strong>Profesional:</strong> {kine?.nombre || 'Sin preferencia indicada'}</p>
          <p><strong>Estado:</strong> <span className="badge badge-pendiente">Pendiente confirmación</span></p>
        </div>
        <button className="btn btn-outline" onClick={() => window.location.reload()}>
          Agendar otra hora
        </button>
      </div>
    </div>
  )
}
