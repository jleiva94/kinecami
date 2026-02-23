import { useState, useEffect, useCallback } from 'react'
import { format, addDays, subDays, startOfWeek, endOfWeek, eachDayOfInterval, isToday, isSunday } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase, actualizarCita, ESTADOS, TIPOS_ATENCION } from '../lib/supabase'
import GestionBloqueos from './GestionBloqueos'
import HistorialPacientes from './HistorialPacientes'
import './PanelKine.css'

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return <div className={`toast toast-${type}`}>{msg}</div>
}

export default function PanelKine({ session }) {
  const [vista, setVista] = useState('semana')
  const [seccion, setSeccion] = useState('citas') // 'citas' | 'agenda' | 'bloqueos'
  const [fechaActual, setFechaActual] = useState(new Date())
  const [citas, setCitas] = useState([])
  const [todaLaAgenda, setTodaLaAgenda] = useState([])
  const [kinesiólogos, setKinesiólogos] = useState([])
  const [cargando, setCargando] = useState(false)
  const [citaDetalle, setCitaDetalle] = useState(null)
  const [toast, setToast] = useState(null)
  const [perfil, setPerfil] = useState(null)
  const [filtroEstado, setFiltroEstado] = useState('todos')

  // Paleta de colores por kinesiólogo (se asigna por índice)
  const KINE_COLORES = ['#4F7153', '#C0714F', '#5B6BBA', '#7A9E7E']

  useEffect(() => {
    supabase.from('kinesiologo').select('*').order('nombre')
      .then(({ data }) => setKinesiólogos(data || []))
    supabase
      .from('kinesiologo')
      .select('*')
      .eq('email', session.user.email)
      .single()
      .then(({ data }) => setPerfil(data))
  }, [session])

  const cargarCitas = useCallback(async () => {
    setCargando(true)
    try {
      const semanaInicio = startOfWeek(fechaActual, { weekStartsOn: 1 })
      const semanaFin = endOfWeek(fechaActual, { weekStartsOn: 1 })
      const inicio = format(semanaInicio, 'yyyy-MM-dd')
      const fin = format(semanaFin, 'yyyy-MM-dd')

      const [misCitas, agenda] = await Promise.all([
        supabase
          .from('citas')
          .select('*, kinesiologo(nombre)')
          .gte('fecha', inicio)
          .lte('fecha', fin)
          .order('fecha')
          .order('hora_inicio'),
        supabase
          .from('citas')
          .select('*, kinesiologo(id, nombre)')
          .gte('fecha', inicio)
          .lte('fecha', fin)
          .not('estado', 'in', '("rechazada","cancelada")')
          .order('fecha')
          .order('hora_inicio')
      ])

      if (misCitas.error) throw misCitas.error
      setCitas(misCitas.data || [])
      setTodaLaAgenda(agenda.data || [])
    } catch (err) {
      setToast({ msg: 'Error cargando citas', type: 'error' })
    } finally {
      setCargando(false)
    }
  }, [fechaActual])

  useEffect(() => { cargarCitas() }, [cargarCitas])

  useEffect(() => {
    const channel = supabase
      .channel('citas-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'citas' }, () => cargarCitas())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [cargarCitas])

  const handleLogout = () => supabase.auth.signOut()

  const actualizarEstado = async (cita, nuevoEstado, datos = {}) => {
    try {
      const updated = await actualizarCita(cita.id, {
        estado: nuevoEstado,
        kinesiologo_id: perfil?.id,
        ...datos
      })
      setCitas(prev => prev.map(c => c.id === cita.id ? { ...c, ...updated } : c))
      setCitaDetalle(null)
      setToast({ msg: `Cita ${ESTADOS[nuevoEstado].label.toLowerCase()} correctamente`, type: 'success' })
    } catch (err) {
      setToast({ msg: 'Error actualizando la cita', type: 'error' })
    }
  }

  const citasFiltradas = citas
    .filter(c => c.kinesiologo_id === perfil?.id)
    .filter(c => filtroEstado === 'todos' || c.estado === filtroEstado)

  const diasSemana = vista === 'semana'
    ? eachDayOfInterval({
        start: startOfWeek(fechaActual, { weekStartsOn: 1 }),
        end: endOfWeek(fechaActual, { weekStartsOn: 1 })
      }).filter(d => !isSunday(d))
    : []

  return (
    <div className="panel-wrapper">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <aside className="panel-sidebar">
        <div className="sidebar-logo">K</div>
        <div className="sidebar-perfil">
          <div className="sidebar-avatar">{perfil?.nombre?.charAt(0) || '?'}</div>
          <div>
            <strong>{perfil?.nombre || 'Cargando...'}</strong>
            <span>Kinesióloga/o</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <button className={`nav-item ${seccion === 'citas' ? 'active' : ''}`}
            onClick={() => setSeccion('citas')}>
            <span>📅</span> Agenda Personal
          </button>
          <button className={`nav-item ${seccion === 'agenda' ? 'active' : ''}`}
            onClick={() => setSeccion('agenda')}>
            <span>👥</span> Agenda Completa
          </button>
          <button className={`nav-item ${seccion === 'historial' ? 'active' : ''}`}
            onClick={() => setSeccion('historial')}>
            <span>🗂️</span> Historial Pacientes
          </button>
          <button className={`nav-item ${seccion === 'bloqueos' ? 'active' : ''}`}
            onClick={() => setSeccion('bloqueos')}>
            <span>🚫</span> Mis Bloqueos
          </button>
        </nav>

        <div className="sidebar-filtros">
          <p className="sidebar-section-title">Filtrar por estado</p>
          {['todos', ...Object.keys(ESTADOS)].map(e => (
            <button key={e}
              className={`filtro-btn ${filtroEstado === e ? 'active' : ''}`}
              onClick={() => setFiltroEstado(e)}>
              {e === 'todos' ? 'Todos' : ESTADOS[e].label}
            </button>
          ))}
        </div>

        <button className="sidebar-logout" onClick={handleLogout}>Cerrar sesión</button>
      </aside>

      <main className="panel-main">
        {seccion === 'bloqueos' && perfil && (
          <GestionBloqueos perfil={perfil} onBack={() => setSeccion('citas')} />
        )}

        {seccion === 'historial' && (
          <HistorialPacientes />
        )}

        {seccion === 'agenda' && (
          <AgendaCompleta
            citas={todaLaAgenda}
            kinesiólogos={kinesiólogos}
            colores={KINE_COLORES}
            fechaActual={fechaActual}
            diasSemana={diasSemana}
            cargando={cargando}
            onVerDetalle={setCitaDetalle}
            onFechaAnterior={() => setFechaActual(d => subDays(d, 7))}
            onFechaSiguiente={() => setFechaActual(d => addDays(d, 7))}
            onHoy={() => setFechaActual(new Date())}
          />
        )}

        {seccion === 'citas' && (
          <>
            <div className="panel-topbar">
              <div className="nav-fecha">
                <button className="nav-fecha-btn" onClick={() => setFechaActual(d => subDays(d, 7))}>‹</button>
                <h2 className="fecha-titulo">
                  Semana del {format(startOfWeek(fechaActual, { weekStartsOn: 1 }), "d 'de' MMMM", { locale: es })}
                </h2>
                <button className="nav-fecha-btn" onClick={() => setFechaActual(d => addDays(d, 7))}>›</button>
              </div>
              <button className="btn btn-secondary btn-sm" onClick={() => setFechaActual(new Date())}>Hoy</button>
            </div>

            <div className="stats-row">
              {[
                { label: 'Pendientes',  val: citasFiltradas.filter(c => c.estado === 'pendiente').length,  color: 'var(--amber)' },
                { label: 'Confirmadas', val: citasFiltradas.filter(c => c.estado === 'confirmada').length, color: 'var(--sage-dark)' },
                { label: 'Completadas', val: citasFiltradas.filter(c => c.estado === 'completada').length, color: 'var(--indigo)' },
                { label: 'Total',       val: citasFiltradas.length,                                         color: 'var(--charcoal)' },
              ].map(s => (
                <div key={s.label} className="stat-card">
                  <span className="stat-num" style={{ color: s.color }}>{s.val}</span>
                  <span className="stat-label">{s.label}</span>
                </div>
              ))}
            </div>

            {cargando
              ? <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}><div className="spinner" /></div>
              : <CitasSemana citas={citasFiltradas} dias={diasSemana} onVerDetalle={setCitaDetalle} />
            }
          </>
        )}
      </main>

      {citaDetalle && (
        <ModalDetalle cita={citaDetalle} onClose={() => setCitaDetalle(null)} onActualizar={actualizarEstado} />
      )}
    </div>
  )
}

// ── Subcomponentes ───────────────────────────────────────────────────────────

function CitasListaDia({ citas, onVerDetalle }) {
  const horasConCitas = {}
  citas.forEach(c => {
    if (!horasConCitas[c.hora_inicio]) horasConCitas[c.hora_inicio] = []
    horasConCitas[c.hora_inicio].push(c)
  })

  if (citas.length === 0) return (
    <div className="empty-state">
      <div className="empty-icon">📋</div>
      <p>No hay citas para este día</p>
    </div>
  )

  return (
    <div className="citas-dia">
      {Object.keys(horasConCitas).sort().map(hora => (
        <div key={hora} className="hora-bloque">
          <div className="hora-label">{hora.substring(0, 5)}</div>
          <div className="hora-citas">
            {horasConCitas[hora].map(cita => (
              <CitaCard key={cita.id} cita={cita} onClick={() => onVerDetalle(cita)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function CitasSemana({ citas, dias, onVerDetalle }) {
  return (
    <div className="semana-grid">
      {dias.map(dia => {
        const diaStr = format(dia, 'yyyy-MM-dd')
        const citasDia = citas.filter(c => c.fecha === diaStr)
        return (
          <div key={diaStr} className={`semana-dia ${isToday(dia) ? 'hoy' : ''}`}>
            <div className="semana-dia-header">
              <span className="semana-dow">{format(dia, 'EEE', { locale: es })}</span>
              <span className="semana-num">{format(dia, 'd')}</span>
              {citasDia.length > 0 && <span className="semana-count">{citasDia.length}</span>}
            </div>
            <div className="semana-citas">
              {citasDia.map(c => (
                <CitaCard key={c.id} cita={c} compact onClick={() => onVerDetalle(c)} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CitaCard({ cita, compact, onClick }) {
  const estado = ESTADOS[cita.estado] || ESTADOS.pendiente
  return (
    <div className={`cita-card ${cita.estado} ${compact ? 'compact' : ''}`} onClick={onClick}>
      <div className="cita-card-top">
        <span className="cita-hora">{cita.hora_inicio?.substring(0, 5)}</span>
        <span className={`badge badge-${cita.estado}`}>{estado.label}</span>
      </div>
      <div className="cita-nombre">{cita.paciente_nombre}</div>
      {!compact && (
        <div className="cita-meta">
          {cita.kinesiologo?.nombre && <span>👩‍⚕️ {cita.kinesiologo.nombre}</span>}
          {cita.tipo_atencion && <span>{TIPOS_ATENCION[cita.tipo_atencion]?.icon} {TIPOS_ATENCION[cita.tipo_atencion]?.label}</span>}
        </div>
      )}
    </div>
  )
}

function ModalDetalle({ cita, onClose, onActualizar }) {
  const [notas, setNotas] = useState(cita.notas_kinesiologo || '')
  const [tipoAtencion, setTipoAtencion] = useState(cita.tipo_atencion || '')
  const [procesando, setProcesando] = useState(false)

  const handleAccion = async (nuevoEstado) => {
    setProcesando(true)
    await onActualizar(cita, nuevoEstado, { notas_kinesiologo: notas || null, tipo_atencion: tipoAtencion || null })
    setProcesando(false)
  }

  const calcHoraFin = (horaInicio) => {
    if (!horaInicio) return ''
    const [h, m] = horaInicio.split(':').map(Number)
    const fin = h * 60 + m + 60
    return `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`
  }

  const whatsappLink = (tipo) => {
    const num = cita.paciente_telefono?.replace(/[^0-9]/g, '')
    if (!num) return '#'
    const fecha = format(new Date(cita.fecha + 'T12:00:00'), "EEEE d 'de' MMMM", { locale: es })
    const hora = cita.hora_inicio?.substring(0, 5)
    const horaFin = calcHoraFin(cita.hora_inicio)
    const tipoLabel = tipoAtencion ? TIPOS_ATENCION[tipoAtencion]?.label : ''
    let msg = ''
    if (tipo === 'confirmar')
      msg = `Hola ${cita.paciente_nombre} 👋, te confirmo tu cita de kinesiología para el ${fecha} entre las ${hora} y ${horaFin} hrs.${tipoLabel ? ` Tu atención será en: ${tipoLabel}.` : ''} ¡Te esperamos! 🌿`
    else if (tipo === 'rechazar')
      msg = `Hola ${cita.paciente_nombre}, lamentablemente no podemos confirmar tu solicitud para el ${fecha} a las ${hora} hrs. Puedes agendar en otro horario disponible.`
    else if (tipo === 'recordatorio')
      msg = `Hola ${cita.paciente_nombre} 👋, te recuerdo tu cita de kinesiología mañana ${fecha} a las ${hora} hrs. ¡Hasta entonces! 🌿`
    else if (tipo === 'completada')
      msg = `Hola ${cita.paciente_nombre}, fue un gusto atenderte hoy. Recuerda seguir las indicaciones. ¡Cualquier consulta me avisas! 💪`
    else
      msg = `Hola ${cita.paciente_nombre}, te contacto por tu cita del ${fecha} a las ${hora} hrs.`
    return `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h3>Detalle de Cita</h3>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          <div className="detalle-grid">
            <div className="detalle-item">
              <span className="detalle-label">Paciente</span>
              <strong>{cita.paciente_nombre}</strong>
            </div>
            <div className="detalle-item">
              <span className="detalle-label">Estado</span>
              <span className={`badge badge-${cita.estado}`}>{ESTADOS[cita.estado]?.label}</span>
            </div>
            <div className="detalle-item">
              <span className="detalle-label">Fecha y Hora</span>
              <strong>{cita.fecha} — {cita.hora_inicio?.substring(0,5)} a {calcHoraFin(cita.hora_inicio)}</strong>
            </div>
            <div className="detalle-item">
              <span className="detalle-label">Teléfono</span>
              <span>+{cita.paciente_telefono}</span>
            </div>
            {cita.paciente_email && <div className="detalle-item"><span className="detalle-label">Email</span><span>{cita.paciente_email}</span></div>}
            {cita.paciente_rut   && <div className="detalle-item"><span className="detalle-label">RUT</span><span>{cita.paciente_rut}</span></div>}
            {cita.motivo_consulta && <div className="detalle-item full"><span className="detalle-label">Motivo</span><p>{cita.motivo_consulta}</p></div>}
          </div>

          <div className="whatsapp-section">
            <p className="whatsapp-section-title">📱 Contactar por WhatsApp</p>
            <div className="whatsapp-btns">
              {cita.estado === 'pendiente' && (<>
                <a className="btn-wa btn-wa-confirm" href={whatsappLink('confirmar')} target="_blank" rel="noreferrer">✅ Enviar confirmación</a>
                <a className="btn-wa btn-wa-reject"  href={whatsappLink('rechazar')}  target="_blank" rel="noreferrer">❌ Enviar rechazo</a>
              </>)}
              {cita.estado === 'confirmada' && (() => {
                const ahora = new Date()
                const citaFechaHora = new Date(`${cita.fecha}T${cita.hora_inicio}`)
                const diffMins = (citaFechaHora - ahora) / 60000
                const mostrarRecordatorio = diffMins <= 120 && diffMins > 0
                return (<>
                  {mostrarRecordatorio && (
                    <a className="btn-wa btn-wa-reminder" href={whatsappLink('recordatorio')} target="_blank" rel="noreferrer">🔔 Enviar recordatorio</a>
                  )}
                  <a className="btn-wa btn-wa-complete" href={whatsappLink('completada')} target="_blank" rel="noreferrer">🎉 Mensaje post-sesión</a>
                </>)
              })()}
              <a className="btn-wa btn-wa-free" href={whatsappLink('libre')} target="_blank" rel="noreferrer">💬 Abrir chat (mensaje libre)</a>
            </div>
            <p className="whatsapp-hint">Se abrirá WhatsApp con el mensaje listo. Puedes editarlo antes de enviar.</p>
          </div>

          <div className="form-group">
            <label className="form-label">Tipo de atención</label>
            <select className="form-select" value={tipoAtencion} onChange={e => setTipoAtencion(e.target.value)}>
              <option value="">Sin asignar</option>
              <option value="camilla">🛏️ Camilla</option>
              <option value="ejercicios">🏃 Terapia de Ejercicios</option>
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Notas / Observaciones internas</label>
            <textarea className="form-textarea" rows={3}
              placeholder="Observaciones clínicas, indicaciones, motivo de rechazo..."
              value={notas} onChange={e => setNotas(e.target.value)} />
          </div>
        </div>

        <div className="modal-acciones">
          <p className="acciones-label">Actualizar estado en el sistema:</p>
          {cita.estado === 'pendiente' && (<>
            <button className="btn btn-primary" onClick={() => handleAccion('confirmada')} disabled={procesando}>✓ Marcar como confirmada</button>
            <button className="btn btn-danger"  onClick={() => handleAccion('rechazada')}  disabled={procesando}>✕ Marcar como rechazada</button>
          </>)}
          {cita.estado === 'confirmada' && (<>
            <button className="btn btn-primary" onClick={() => handleAccion('completada')} disabled={procesando}>✓ Marcar completada</button>
            <button className="btn btn-danger"  onClick={() => handleAccion('cancelada')}  disabled={procesando}>Cancelar cita</button>
          </>)}
          {['completada','rechazada','cancelada'].includes(cita.estado) && (
            <button className="btn btn-secondary" onClick={() => handleAccion(cita.estado)} disabled={procesando}>💾 Guardar notas</button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Agenda Completa ──────────────────────────────────────────────────────────

function AgendaCompleta({ citas, kinesiólogos, colores, fechaActual, diasSemana, cargando, onVerDetalle, onFechaAnterior, onFechaSiguiente, onHoy }) {

  const colorKine = (kineId) => {
    const idx = kinesiólogos.findIndex(k => k.id === kineId)
    return colores[idx] || '#9CA3AF'
  }

  return (
    <div>
      <div className="panel-topbar">
        <div className="nav-fecha">
          <button className="nav-fecha-btn" onClick={onFechaAnterior}>‹</button>
          <h2 className="fecha-titulo">
            Semana del {format(startOfWeek(fechaActual, { weekStartsOn: 1 }), "d 'de' MMMM", { locale: es })}
          </h2>
          <button className="nav-fecha-btn" onClick={onFechaSiguiente}>›</button>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={onHoy}>Hoy</button>
      </div>

      {/* Leyenda de colores */}
      <div className="agenda-leyenda">
        {kinesiólogos.map((k, i) => (
          <div key={k.id} className="leyenda-item">
            <span className="leyenda-dot" style={{ background: colores[i] }} />
            <span>{k.nombre}</span>
          </div>
        ))}
        <div className="leyenda-item">
          <span className="leyenda-dot" style={{ background: '#9CA3AF' }} />
          <span>Sin asignar</span>
        </div>
      </div>

      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '60px' }}>
          <div className="spinner" />
        </div>
      ) : (
        <div className="semana-grid">
          {diasSemana.map(dia => {
            const diaStr = format(dia, 'yyyy-MM-dd')
            const citasDia = citas.filter(c => c.fecha === diaStr)
            return (
              <div key={diaStr} className={`semana-dia ${isToday(dia) ? 'hoy' : ''}`}>
                <div className="semana-dia-header">
                  <span className="semana-dow">{format(dia, 'EEE', { locale: es })}</span>
                  <span className="semana-num">{format(dia, 'd')}</span>
                  {citasDia.length > 0 && <span className="semana-count">{citasDia.length}</span>}
                </div>
                <div className="semana-citas">
                  {citasDia.map(c => (
                    <div
                      key={c.id}
                      className="cita-card compact"
                      style={{ borderLeftColor: colorKine(c.kinesiologo_id), borderLeftWidth: 3 }}
                      onClick={() => onVerDetalle(c)}
                    >
                      <div className="cita-card-top">
                        <span className="cita-hora">{c.hora_inicio?.substring(0,5)}</span>
                        <span className={`badge badge-${c.estado}`}>{ESTADOS[c.estado]?.label}</span>
                      </div>
                      <div className="cita-nombre">{c.paciente_nombre}</div>
                      <div style={{ fontSize: '0.75rem', color: colorKine(c.kinesiologo_id), fontWeight: 500, marginTop: 2 }}>
                        {c.kinesiologo?.nombre || 'Sin asignar'}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
