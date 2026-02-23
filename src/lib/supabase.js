import { createClient } from '@supabase/supabase-js'

// ⚠️  REEMPLAZA estos valores con los de tu proyecto en Supabase
// Los encuentras en: Project Settings → API
const SUPABASE_URL = 'https://ehfitzhgiqmilcwtqzfm.supabase.co'
const SUPABASE_ANON_KEY = 'sb_publishable_VyhyEBwupFjwmJMVA8e9fA_Rkq3TaDD'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)

// Horarios disponibles según día
export const getHorariosDisponibles = (fecha) => {
  const dia = new Date(fecha + 'T12:00:00').getDay() // 0=Dom, 6=Sab
  const horas = []

  let inicio, fin
  if (dia === 6) {
    // Sábado: 9:00 - 15:00
    inicio = 9
    fin = 14 // última cita a las 14:00, termina a las 15:00
  } else if (dia === 0) {
    // Domingo: cerrado
    return []
  } else {
    // Lunes a Viernes: 6:00 - 22:00
    inicio = 6
    fin = 21 // última cita a las 21:00, termina a las 22:00
  }

  for (let h = inicio; h <= fin; h++) {
    horas.push(`${String(h).padStart(2, '0')}:00`)
  }
  return horas
}

// Verificar disponibilidad de un slot
export const verificarDisponibilidad = async (fecha, hora) => {
  const { data, error } = await supabase
    .from('citas')
    .select('tipo_atencion, estado')
    .eq('fecha', fecha)
    .eq('hora_inicio', hora)
    .not('estado', 'in', '("rechazada","cancelada")')

  if (error) throw error

  const total = data.length
  const camillasOcupadas = data.filter(c => c.tipo_atencion === 'camilla').length
  const ejerciciosOcupados = data.filter(c => c.tipo_atencion === 'ejercicios').length

  // Un slot puede aceptar cita si:
  // 1. No hay 2 citas ya
  // 2. Hay al menos un tipo de espacio libre (o el tipo aún no asignado)
  // Nota: el tipo se asigna después, así que bloqueamos si hay 2 citas cualquiera
  const disponible = total < 2

  return {
    disponible,
    total,
    camillasOcupadas,
    ejerciciosOcupados,
    espaciosLibres: 2 - total
  }
}

// Obtener todas las citas de un día (para kinesiólogos)
export const getCitasDelDia = async (fecha) => {
  const { data, error } = await supabase
    .from('citas')
    .select(`*, kinesiólogos(nombre)`)
    .eq('fecha', fecha)
    .order('hora_inicio')

  if (error) throw error
  return data
}

// Obtener citas por rango de fechas (para vista semanal)
export const getCitasRango = async (fechaInicio, fechaFin) => {
  const { data, error } = await supabase
    .from('citas')
    .select(`*, kinesiólogos(nombre)`)
    .gte('fecha', fechaInicio)
    .lte('fecha', fechaFin)
    .not('estado', 'in', '("rechazada","cancelada")')
    .order('fecha')
    .order('hora_inicio')

  if (error) throw error
  return data
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

// Obtener kinesiólogos
export const getKinesiólogos = async () => {
  const { data, error } = await supabase
    .from('kinesiólogos')
    .select('*')
    .order('nombre')

  if (error) throw error
  return data
}

// Enviar notificación WhatsApp via CallMeBot
export const enviarWhatsApp = async (telefono, mensaje) => {
  // CallMeBot requiere que el paciente primero agregue el número
  // y obtenga su API key personal en https://www.callmebot.com/blog/free-api-whatsapp-messages/
  // Por ahora usamos la URL directa — el paciente debe haber activado el bot
  const telefonoLimpio = telefono.replace(/[^0-9]/g, '')
  const mensajeCodificado = encodeURIComponent(mensaje)
  
  // CallMeBot API (cada usuario necesita su propia apikey)
  // Esta función se llama desde el backend/edge function de Supabase
  // para no exponer la apikey en el frontend
  const url = `https://api.callmebot.com/whatsapp.php?phone=${telefonoLimpio}&text=${mensajeCodificado}&apikey=APIKEY_DEL_PACIENTE`
  
  try {
    await fetch(url)
    return true
  } catch {
    return false
  }
}

export const ESTADOS = {
  pendiente: { label: 'Pendiente', color: '#F59E0B' },
  confirmada: { label: 'Confirmada', color: '#10B981' },
  rechazada: { label: 'Rechazada', color: '#EF4444' },
  completada: { label: 'Completada', color: '#6366F1' },
  cancelada: { label: 'Cancelada', color: '#9CA3AF' },
}

export const TIPOS_ATENCION = {
  camilla: { label: 'Camilla', icon: '🛏️' },
  ejercicios: { label: 'Terapia de Ejercicios', icon: '🏃' },
}
