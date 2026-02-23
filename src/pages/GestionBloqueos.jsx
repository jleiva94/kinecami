import { useState, useEffect } from 'react'
import { format, addDays, startOfToday, isSunday, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase } from '../lib/supabase'
import './GestionBloqueos.css'

const HORAS = Array.from({ length: 33 }, (_, i) => {
  const mins = 6 * 60 + i * 30
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}).filter(h => h <= '22:00')

const Toast = ({ msg, type, onClose }) => {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t) }, [onClose])
  return <div className={`toast toast-${type}`}>{msg}</div>
}

export default function GestionBloqueos({ perfil, onBack }) {
  const [bloqueos, setBloqueos] = useState([])
  const [cargando, setCargando] = useState(true)
  const [toast, setToast] = useState(null)
  const [mostrarForm, setMostrarForm] = useState(false)

  // Form state
  const [tipo, setTipo] = useState('dia_completo')
  const [fecha, setFecha] = useState('')
  const [horaInicio, setHoraInicio] = useState('09:00')
  const [horaFin, setHoraFin] = useState('10:00')
  const [motivo, setMotivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  const hoy = format(startOfToday(), 'yyyy-MM-dd')

  const cargarBloqueos = async () => {
    setCargando(true)
    const { data, error } = await supabase
      .from('bloqueos')
      .select('*')
      .eq('kinesiologo_id', perfil.id)
      .gte('fecha', hoy)
      .order('fecha')
      .order('hora_inicio')

    if (!error) setBloqueos(data || [])
    setCargando(false)
  }

  useEffect(() => { cargarBloqueos() }, [perfil.id])

  const handleGuardar = async () => {
    if (!fecha) return setToast({ msg: 'Selecciona una fecha', type: 'error' })
    if (tipo === 'rango_horas' && horaFin <= horaInicio)
      return setToast({ msg: 'La hora de fin debe ser mayor a la de inicio', type: 'error' })

    setGuardando(true)
    const payload = {
      kinesiologo_id: perfil.id,
      tipo,
      fecha,
      motivo: motivo.trim() || null,
      hora_inicio: tipo === 'rango_horas' ? horaInicio : null,
      hora_fin: tipo === 'rango_horas' ? horaFin : null,
    }

    const { error } = await supabase.from('bloqueos').insert([payload])
    if (error) {
      setToast({ msg: 'Error al guardar el bloqueo', type: 'error' })
    } else {
      setToast({ msg: 'Bloqueo guardado correctamente', type: 'success' })
      setMostrarForm(false)
      setFecha(''); setMotivo(''); setTipo('dia_completo')
      cargarBloqueos()
    }
    setGuardando(false)
  }

  const handleEliminar = async (id) => {
    const { error } = await supabase.from('bloqueos').delete().eq('id', id)
    if (error) {
      setToast({ msg: 'Error al eliminar', type: 'error' })
    } else {
      setToast({ msg: 'Bloqueo eliminado', type: 'success' })
      setBloqueos(prev => prev.filter(b => b.id !== id))
    }
  }

  // Agrupar bloqueos por fecha
  const bloqueosPorFecha = bloqueos.reduce((acc, b) => {
    if (!acc[b.fecha]) acc[b.fecha] = []
    acc[b.fecha].push(b)
    return acc
  }, {})

  return (
    <div className="bloqueos-wrapper">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <div className="bloqueos-header">
        <button className="btn-back" onClick={onBack}>← Volver al panel</button>
        <div>
          <h2 className="bloqueos-title">Mis bloqueos de horario</h2>
          <p className="bloqueos-sub">{perfil.nombre} · Próximos bloqueos activos</p>
        </div>
        <button className="btn btn-primary" onClick={() => setMostrarForm(v => !v)}>
          {mostrarForm ? '✕ Cancelar' : '+ Agregar bloqueo'}
        </button>
      </div>

      {/* Formulario nuevo bloqueo */}
      {mostrarForm && (
        <div className="bloqueo-form card">
          <h3 className="form-section-title">Nuevo bloqueo</h3>

          <div className="form-row">
            <div className="form-group">
              <label className="form-label">Tipo</label>
              <div className="tipo-toggle">
                <button
                  className={`tipo-btn ${tipo === 'dia_completo' ? 'active' : ''}`}
                  onClick={() => setTipo('dia_completo')}
                >
                  📅 Día completo
                </button>
                <button
                  className={`tipo-btn ${tipo === 'rango_horas' ? 'active' : ''}`}
                  onClick={() => setTipo('rango_horas')}
                >
                  🕐 Rango de horas
                </button>
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">Fecha</label>
              <input
                type="date"
                className="form-input"
                min={hoy}
                value={fecha}
                onChange={e => setFecha(e.target.value)}
              />
            </div>
          </div>

          {tipo === 'rango_horas' && (
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Desde</label>
                <select className="form-select" value={horaInicio} onChange={e => setHoraInicio(e.target.value)}>
                  {HORAS.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Hasta</label>
                <select className="form-select" value={horaFin} onChange={e => setHoraFin(e.target.value)}>
                  {HORAS.filter(h => h > horaInicio).map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="form-label">Motivo <span className="hint">Opcional</span></label>
            <input
              className="form-input"
              placeholder="Ej: Vacaciones, Capacitación, Trámites..."
              value={motivo}
              onChange={e => setMotivo(e.target.value)}
            />
          </div>

          <div className="form-actions">
            <button className="btn btn-primary" onClick={handleGuardar} disabled={guardando || !fecha}>
              {guardando ? 'Guardando...' : 'Guardar bloqueo'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de bloqueos */}
      {cargando ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
          <div className="spinner" />
        </div>
      ) : Object.keys(bloqueosPorFecha).length === 0 ? (
        <div className="bloqueos-empty">
          <span>📭</span>
          <p>No tienes bloqueos programados</p>
          <small>Agrega bloqueos para días de vacaciones, capacitaciones o cualquier horario en que no estés disponible.</small>
        </div>
      ) : (
        <div className="bloqueos-lista">
          {Object.entries(bloqueosPorFecha).map(([fecha, items]) => (
            <div key={fecha} className="bloqueo-fecha-grupo">
              <div className="bloqueo-fecha-header">
                <span className="bloqueo-fecha-label">
                  {format(parseISO(fecha), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </span>
              </div>
              {items.map(b => (
                <div key={b.id} className="bloqueo-item">
                  <div className="bloqueo-item-icon">
                    {b.tipo === 'dia_completo' ? '📅' : '🕐'}
                  </div>
                  <div className="bloqueo-item-info">
                    <strong>
                      {b.tipo === 'dia_completo'
                        ? 'Día completo'
                        : `${b.hora_inicio?.substring(0,5)} – ${b.hora_fin?.substring(0,5)}`
                      }
                    </strong>
                    {b.motivo && <span className="bloqueo-motivo">{b.motivo}</span>}
                  </div>
                  <button
                    className="bloqueo-delete"
                    onClick={() => handleEliminar(b.id)}
                    title="Eliminar bloqueo"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
