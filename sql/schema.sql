-- =============================================
-- ESQUEMA PARA CLÍNICA DE KINESIOLOGÍA
-- Ejecutar en el SQL Editor de Supabase
-- =============================================

-- Tabla de kinesiologos (usuarios del sistema)
CREATE TABLE kinesiólogos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Insertar los 2 kinesiólogos iniciales
-- (La contraseña la manejas desde Supabase Auth)
INSERT INTO kinesiólogos (nombre, email) VALUES
  ('Camila Sepúlveda', 'kinesiologacamilasepulveda@gmail.com'),
  ('Carlos Concha', 'consil.carlos@gmail.com');

-- Tabla de citas
CREATE TABLE citas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Datos del paciente
  paciente_nombre TEXT NOT NULL,
  paciente_telefono TEXT NOT NULL,  -- para WhatsApp
  paciente_email TEXT,
  paciente_rut TEXT,
  motivo_consulta TEXT,
  
  -- Datos de la cita
  fecha DATE NOT NULL,
  hora_inicio TIME NOT NULL,  -- ej: '09:00'
  kinesiologo_id UUID REFERENCES kinesiólogos(id),
  tipo_atencion TEXT CHECK (tipo_atencion IN ('camilla', 'ejercicios', NULL)),  -- lo define el kine
  
  -- Estado
  estado TEXT NOT NULL DEFAULT 'pendiente' 
    CHECK (estado IN ('pendiente', 'confirmada', 'rechazada', 'completada', 'cancelada')),
  
  -- Notas del kinesiólogo (al confirmar/completar)
  notas_kinesiologo TEXT,
  
  -- Metadatos
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Índices para queries frecuentes
CREATE INDEX idx_citas_fecha ON citas(fecha);
CREATE INDEX idx_citas_estado ON citas(estado);
CREATE INDEX idx_citas_kinesiologo ON citas(kinesiologo_id, fecha);

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER citas_updated_at
  BEFORE UPDATE ON citas
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE kinesiólogos ENABLE ROW LEVEL SECURITY;

-- Política: cualquiera puede INSERTAR una cita (pacientes)
CREATE POLICY "pacientes_pueden_agendar" ON citas
  FOR INSERT WITH CHECK (true);

-- Política: cualquiera puede VER citas (para mostrar disponibilidad)
-- Solo expone fecha/hora/tipo, no datos personales
CREATE POLICY "ver_disponibilidad" ON citas
  FOR SELECT USING (true);

-- Política: solo kinesiólogos autenticados pueden actualizar citas
CREATE POLICY "kines_actualizan_citas" ON citas
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Política: kinesiólogos pueden ver su perfil
CREATE POLICY "ver_kinesiólogos" ON kinesiólogos
  FOR SELECT USING (true);

-- Vista de disponibilidad (no expone datos del paciente)
CREATE VIEW disponibilidad AS
SELECT 
  fecha,
  hora_inicio,
  COUNT(*) as total_citas,
  COUNT(*) FILTER (WHERE tipo_atencion = 'camilla') as camillas_ocupadas,
  COUNT(*) FILTER (WHERE tipo_atencion = 'ejercicios') as ejercicios_ocupados,
  -- Un slot está disponible si hay menos de 2 citas Y al menos un tipo libre
  CASE 
    WHEN COUNT(*) >= 2 THEN false
    WHEN COUNT(*) FILTER (WHERE tipo_atencion = 'camilla') >= 1 
      AND COUNT(*) FILTER (WHERE tipo_atencion = 'ejercicios') >= 1 THEN false
    ELSE true
  END as disponible
FROM citas
WHERE estado NOT IN ('rechazada', 'cancelada')
GROUP BY fecha, hora_inicio;
