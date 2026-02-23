# 🏥 Clínica de Kinesiología — Guía de Instalación Completa

## Resumen del Sistema

| Capa | Tecnología | Costo |
|------|-----------|-------|
| Frontend | React | Gratis |
| Base de datos | Supabase (PostgreSQL) | Gratis |
| Hosting | Vercel o Netlify | Gratis |
| Notificaciones WhatsApp | CallMeBot | Gratis |

---

## PASO 1 — Crear cuenta en Supabase (5 min)

1. Ve a **https://supabase.com** → "Start for free"
2. Crea una cuenta con tu email o GitHub
3. Clic en **"New Project"**
   - Nombre: `kine-clinic` (o el que quieras)
   - Base de datos password: guárdala bien
   - Región: South America (São Paulo) — la más cercana a Chile
4. Espera ~2 minutos a que el proyecto se inicialice

---

## PASO 2 — Crear la base de datos (3 min)

1. En tu proyecto de Supabase, ve al menú izquierdo → **SQL Editor**
2. Clic en **"New Query"**
3. Copia y pega **todo** el contenido del archivo `sql/schema.sql`
4. Clic en **"Run"** (o Ctrl+Enter)
5. Deberías ver "Success. No rows returned"

---

## PASO 3 — Crear los usuarios kinesiólogos (3 min)

Los kinesiólogos se autentican vía Supabase Auth:

1. En Supabase → menú izquierdo → **Authentication** → **Users**
2. Clic en **"Add user"** → "Create new user"
   - Email: `camila@clinica.cl` (o el email real de Camila)
   - Password: la que ella elija
   - ✅ Auto Confirm User
3. Repetir para el segundo kinesiólogo cuando tengas su nombre/email
4. Luego ir a la tabla **kinesiólogos** (Table Editor) y actualizar los emails para que coincidan

---

## PASO 4 — Obtener las credenciales de Supabase (2 min)

1. En Supabase → **Project Settings** (ícono engranaje) → **API**
2. Copia:
   - **Project URL**: algo como `https://xxxxxxxx.supabase.co`
   - **anon public**: la clave larga que empieza con `eyJ...`

---

## PASO 5 — Configurar el código (2 min)

1. Abre el archivo `src/lib/supabase.js`
2. Reemplaza las dos líneas al inicio:
   ```js
   const SUPABASE_URL = 'https://TU_PROJECT_ID.supabase.co'   // ← tu URL
   const SUPABASE_ANON_KEY = 'TU_ANON_KEY'                    // ← tu clave
   ```
3. Guarda el archivo

---

## PASO 6 — Probar localmente (opcional, requiere Node.js)

Si tienes Node.js instalado:
```bash
cd kine-clinic
npm install
npm start
```
Se abrirá en http://localhost:3000

---

## PASO 7 — Publicar en Vercel (5 min) ✨

**Opción A: Con GitHub (recomendada)**
1. Sube el proyecto a un repositorio en GitHub
2. Ve a **https://vercel.com** → "New Project"
3. Conecta tu cuenta de GitHub y selecciona el repositorio
4. Sin cambiar nada, clic en **"Deploy"**
5. En ~1 minuto tendrás una URL pública tipo `kine-clinic.vercel.app`

**Opción B: Sin GitHub (más rápido)**
1. Instala Vercel CLI: `npm install -g vercel`
2. Desde la carpeta del proyecto: `vercel`
3. Sigue los pasos en la terminal

---

## PASO 8 — Configurar CallMeBot para WhatsApp (5 min por paciente)

CallMeBot es un servicio gratuito. **Cada paciente** debe activarlo una sola vez:

1. El paciente agrega este número de WhatsApp a sus contactos:
   **+34 644 59 82 88** (nombre: "CallMeBot")
2. Le envía el mensaje: `I allow callmebot to send me messages`
3. Recibirá su **API key personal** por WhatsApp (ej: `123456`)
4. Esa API key se la entrega a la clínica o la ingresa en el formulario

> ⚠️ **Nota importante**: En la versión actual, las notificaciones WhatsApp se envían desde el frontend con la API key del paciente. Para una solución más robusta (y donde la clínica envíe por su cuenta), se puede configurar una **Supabase Edge Function** — avísame si quieres ese paso adicional.

---

## Flujo del sistema

### El paciente:
1. Entra a tu URL pública (`kine-clinic.vercel.app`)
2. Elige fecha → hora disponible → kinesiólogo (opcional) → llena sus datos
3. Envía la solicitud → queda en estado **Pendiente**

### El kinesiólogo:
1. Entra a `tu-url.vercel.app/login`
2. Ve el panel con todas las citas
3. Abre una cita pendiente → asigna tipo de atención (camilla o ejercicios) → confirma o rechaza
4. El sistema envía WhatsApp automático al paciente

---

## Restricciones de capacidad

El sistema bloquea automáticamente cuando:
- Ya hay **2 citas** en el mismo horario, O
- Ya hay **1 cita en camilla** y se intenta agendar otra en camilla, O
- Ya hay **1 cita de ejercicios** y se intenta agendar otra de ejercicios

Los horarios disponibles son:
- **Lunes a Viernes**: 6:00 a 22:00 (última cita a las 21:00)
- **Sábados**: 9:00 a 15:00 (última cita a las 14:00)
- **Domingos**: Cerrado

---

## Actualizar el nombre de la clínica y kinesiólogos

- **Nombre de la clínica**: editar `src/pages/AgendarCita.jsx`, línea con `"Clínica de Kinesiología"`
- **Segundo kinesiólogo**: una vez que confirmes el nombre, actualizar en Supabase Table Editor → tabla `kinesiólogos`

---

## Estructura de archivos

```
kine-clinic/
├── sql/
│   └── schema.sql          ← Ejecutar en Supabase
├── src/
│   ├── lib/
│   │   └── supabase.js     ← ⚠️  Configurar URL y Key aquí
│   ├── pages/
│   │   ├── AgendarCita.jsx ← Vista pública para pacientes
│   │   ├── AgendarCita.css
│   │   ├── LoginKine.jsx   ← Login del kinesiólogo
│   │   ├── LoginKine.css
│   │   ├── PanelKine.jsx   ← Panel de gestión
│   │   └── PanelKine.css
│   ├── App.jsx             ← Rutas principales
│   ├── App.css             ← Estilos globales
│   └── index.js
├── public/
│   └── index.html
└── package.json
```

---

## ¿Necesitas ayuda adicional?

Escríbeme si quieres:
- [ ] Edge Function de Supabase para WhatsApp más robusto
- [ ] Recordatorios automáticos el día anterior a la cita
- [ ] Página de perfil para que el kinesiólogo gestione sus horarios bloqueados (vacaciones, etc.)
- [ ] Estadísticas de atenciones por mes
