import { useState } from 'react'
import { format, parseISO } from 'date-fns'
import { es } from 'date-fns/locale'
import { supabase, ESTADOS, TIPOS_ATENCION } from '../lib/supabase'
import './HistorialPacientes.css'

export default function HistorialPacientes() {
  const [busqueda, setBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState(null) // null = sin búsqueda, [] = sin resultados
  const [pacienteSeleccionado, setPacienteSeleccionado] = useState(null)
  const [historial, setHistorial] = useState([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)

  const buscarPaciente = async () => {
    if (!busqueda.trim()) return
    setBuscando(true)
    setPacienteSeleccionado(null)
    setHistorial([])

    const q = busqueda.trim().toLowerCase()

    // Buscar citas que coincidan con RUT, nombre o teléfono
    // Traemos todas y filtramos (Supabase no tiene ilike en múltiples columnas en un solo OR fácilmente)
    const { data, error } = await supabase
      .from('citas')
      .select('paciente_nombre, paciente_rut, paciente_telefono, paciente_email')
      .or(`paciente_rut.ilike.%${q}%,paciente_nombre.ilike.%${q}%,paciente_telefono.ilike.%${q}%`)
      .order('paciente_nombre')

    if (error) { setBuscando(false); return }

    // Deduplicar por RUT o por nombre+teléfono si no tiene RUT
    const vistos = new Set()
    const pacientes = []
    ;(data || []).forEach(c => {
      const key = c.paciente_rut || `${c.paciente_nombre}|${c.paciente_telefono}`
      if (!vistos.has(key)) {
        vistos.add(key)
        pacientes.push({
          nombre: c.paciente_nombre,
          rut: c.paciente_rut,
          telefono: c.paciente_telefono,
          email: c.paciente_email,
        })
      }
    })

    setResultados(pacientes)
    setBuscando(false)
  }

  const verHistorial = async (paciente) => {
    setPacienteSeleccionado(paciente)
    setCargandoHistorial(true)

    // Buscar por RUT si tiene, sino por nombre+teléfono
    let query = supabase
      .from('citas')
      .select('*, kinesiologo(nombre)')
      .order('fecha', { ascending: false })
      .order('hora_inicio', { ascending: false })

    if (paciente.rut) {
      query = query.eq('paciente_rut', paciente.rut)
    } else {
      query = query.eq('paciente_nombre', paciente.nombre).eq('paciente_telefono', paciente.telefono)
    }

    const { data, error } = await query
    if (!error) setHistorial(data || [])
    setCargandoHistorial(false)
  }

  const calcHoraFin = (horaInicio) => {
    if (!horaInicio) return ''
    const [h, m] = horaInicio.split(':').map(Number)
    const fin = h * 60 + m + 60
    return `${String(Math.floor(fin / 60)).padStart(2, '0')}:${String(fin % 60).padStart(2, '0')}`
  }

  return (
    <div className="historial-wrapper">
      <div className="historial-header">
        <h2 className="historial-title">Historial de Pacientes</h2>
        <p className="historial-sub">Busca por nombre, RUT o teléfono</p>
      </div>

      {/* Buscador */}
      <div className="historial-search">
        <input
          className="form-input search-input"
          placeholder="Ej: María González / 12.345.678-9 / 56912345678"
          value={busqueda}
          onChange={e => setBusqueda(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && buscarPaciente()}
        />
        <button className="btn btn-primary" onClick={buscarPaciente} disabled={buscando || !busqueda.trim()}>
          {buscando ? 'Buscando...' : '🔍 Buscar'}
        </button>
      </div>

      <div className="historial-body">
        {/* Panel izquierdo: resultados */}
        <div className="historial-resultados">
          {resultados === null && (
            <div className="historial-placeholder">
              <span>🔍</span>
              <p>Ingresa un nombre, RUT o teléfono para buscar</p>
            </div>
          )}

          {resultados !== null && resultados.length === 0 && (
            <div className="historial-placeholder">
              <span>😕</span>
              <p>No se encontraron pacientes con ese criterio</p>
            </div>
          )}

          {resultados !== null && resultados.length > 0 && (
            <div className="resultados-lista">
              <p className="resultados-count">{resultados.length} paciente{resultados.length !== 1 ? 's' : ''} encontrado{resultados.length !== 1 ? 's' : ''}</p>
              {resultados.map((p, i) => (
                <button
                  key={i}
                  className={`paciente-item ${pacienteSeleccionado?.nombre === p.nombre && pacienteSeleccionado?.telefono === p.telefono ? 'selected' : ''}`}
                  onClick={() => verHistorial(p)}
                >
                  <div className="paciente-avatar">{p.nombre.charAt(0).toUpperCase()}</div>
                  <div className="paciente-info">
                    <strong>{p.nombre}</strong>
                    <span>{p.rut || 'Sin RUT'} · +{p.telefono}</span>
                    {p.email && <span className="paciente-email">{p.email}</span>}
                  </div>
                  <span className="paciente-arrow">›</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Panel derecho: historial */}
        <div className="historial-detalle">
          {!pacienteSeleccionado && (
            <div className="historial-placeholder">
              <span>📋</span>
              <p>Selecciona un paciente para ver su historial</p>
            </div>
          )}

          {pacienteSeleccionado && (
            <>
              <div className="paciente-header-detalle">
                <div className="paciente-avatar grande">{pacienteSeleccionado.nombre.charAt(0).toUpperCase()}</div>
                <div>
                  <h3>{pacienteSeleccionado.nombre}</h3>
                  <p>{pacienteSeleccionado.rut || 'Sin RUT'} · +{pacienteSeleccionado.telefono}</p>
                  {pacienteSeleccionado.email && <p>{pacienteSeleccionado.email}</p>}
                </div>
              </div>

              {cargandoHistorial ? (
                <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
                  <div className="spinner" />
                </div>
              ) : historial.length === 0 ? (
                <div className="historial-placeholder" style={{ padding: '40px 0' }}>
                  <span>📭</span>
                  <p>Este paciente no tiene citas registradas</p>
                </div>
              ) : (
                <div className="citas-historial">
                  <p className="citas-count">{historial.length} cita{historial.length !== 1 ? 's' : ''} en total</p>
                  {historial.map(cita => (
                    <div key={cita.id} className={`cita-historial-item estado-${cita.estado}`}>
                      <div className="cita-hist-fecha">
                        <span className="cita-hist-dia">
                          {format(parseISO(cita.fecha), "d MMM yyyy", { locale: es })}
                        </span>
                        <span className="cita-hist-hora">
                          {cita.hora_inicio?.substring(0,5)} – {calcHoraFin(cita.hora_inicio)}
                        </span>
                      </div>

                      <div className="cita-hist-info">
                        <div className="cita-hist-row">
                          <span className={`badge badge-${cita.estado}`}>{ESTADOS[cita.estado]?.label}</span>
                          {cita.tipo_atencion && (
                            <span className="cita-hist-tipo">
                              {TIPOS_ATENCION[cita.tipo_atencion]?.icon} {TIPOS_ATENCION[cita.tipo_atencion]?.label}
                            </span>
                          )}
                        </div>

                        {cita.kinesiologo?.nombre && (
                          <div className="cita-hist-kine">
                            👩‍⚕️ {cita.kinesiologo.nombre}
                          </div>
                        )}

                        {cita.notas_kinesiologo && (
                          <div className="cita-hist-notas">
                            <span className="notas-label">📝 Notas</span>
                            <p>{cita.notas_kinesiologo}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
