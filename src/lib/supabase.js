import { createClient } from '@supabase/supabase-js'

// ⚠️  REEMPLAZA estos valores con los de tu proyecto en Supabase
// Los encuentras en: Project Settings → API
const SUPABASE_URL = 'https://TU_PROJECT_ID.supabase.co'
const SUPABASE_ANON_KEY = 'TU_ANON_KEY'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Verificar disponibilidad de un slot
export const verificarDisponibilidad = async (fecha, hora) => {
  const { data, error } = await supabase
    .from('citas')
    .select('tipo_atencion, estado')
    .eq('fecha', fecha)
    .eq('hora_inicio', hora)
    .not('estado', 'in', '("rechazada","cancelada")')

  if (error) throw error
  const disponible = data.length < 2
  return { disponible, total: data.length }
}

// Agendar cita (paciente)
export const agendarCita = async (datosCita) => {
  const { data, error } = await supabase
    .from('citas')
    .insert([datosCita])
    .select()
    .single()

  if (error) throw error
  return data
}

// Actualizar cita (kinesiólogo)
export const actualizarCita = async (id, updates) => {
  const { data, error } = await supabase
    .from('citas')
    .update(updates)
    .eq('id', id)
    .select()
    .single()

  if (error) throw error
  return data
}

// Obtener kinesiólogos (tabla renombrada sin tilde)
export const getKinesiologo = async () => {
  const { data, error } = await supabase
    .from('kinesiologo')
    .select('*')
    .order('nombre')

  if (error) throw error
  return data
}

export const ESTADOS = {
  pendiente: { label: 'Pendiente', color: '#F59E0B' },
  confirmada: { label: 'Confirmada', color: '#10B981' },
  rechazada:  { label: 'Rechazada',  color: '#EF4444' },
  completada: { label: 'Completada', color: '#6366F1' },
  cancelada:  { label: 'Cancelada',  color: '#9CA3AF' },
}

export const TIPOS_ATENCION = {
  camilla:    { label: 'Camilla',               icon: '🛏️' },
  ejercicios: { label: 'Terapia de Ejercicios', icon: '🏃' },
}
