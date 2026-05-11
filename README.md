# Docuhotel

Gestor de documentos para hoteles. Frontend estático (HTML + React vía Babel en navegador) sobre backend Supabase opcional.

## Modos

| Modo | Backend | Multi-usuario | Persistencia |
|---|---|---|---|
| **Offline** (`offlineMode: true`) | — | No | `localStorage` |
| **Supabase** (`offlineMode: false`) | Supabase (Postgres + Auth + Storage) | Sí | Cloud |

El frontend es el mismo en ambos modos — cambia solo `config.js`.

## Funcionalidades

- 📄 **Documentos** — categorías, departamentos, estados, vigencias y caducidad manual
- 📁 **Proyectos** — agrupa documentos y comparte con auditor externo vía enlace temporal (con marca de agua)
- 📥 **Solicitudes** — pide documentación a empleados/proveedores con enlace temporal, drag&drop y log
- 🌐 **Acceso público QR** — documentos marcados como públicos accesibles por código QR
- ⚙️ **Administración** — categorías, departamentos, estados con colores, periodos, usuarios, plantillas de email, roles/permisos, datos del hotel
- 📊 **Registro inmutable** — todas las acciones quedan registradas
- 🔐 **Auth + RLS por hotel y departamento** (modo Supabase)
- 🌍 **Multidioma** — Español, English, Deutsch
- 🎨 **Modo oscuro** y densidad configurable

## Inicio rápido

### Demo local (sin backend)

```bash
cp config.example.js config.js
# en config.js, deja offlineMode: true
npx serve .
```

Abre `http://localhost:3000`. Los datos viven en `localStorage`.

### Producción con Supabase

Ver **[DEPLOYMENT.md](./DEPLOYMENT.md)** para el paso a paso completo.

Resumen:
1. Crear proyecto Supabase, ejecutar `supabase/schema.sql` + `supabase/storage.sql`.
2. Crear usuario admin en Authentication y ejecutar `supabase/seed.sql`.
3. Copiar `config.example.js` → `config.js` con la URL + anon key.
4. Importar el repo en Vercel (Framework: Other, sin build command).

## Arquitectura

```
Vercel (static)  ──►  Supabase Auth + Postgres (con RLS)
                 ──►  Supabase Storage (PDFs, RLS por hotel)
```

- Sin servidor propio, sin build step.
- Toda la persistencia pasa por `api.jsx`. El resto del frontend (`store.jsx`, componentes) sigue trabajando con el mismo objeto `state` que tenía en el prototipo.
- `store.jsx` carga el estado completo al iniciar y persiste cambios con un diff incremental cada 600 ms.

Más detalle en [ARQUITECTURA.md](./ARQUITECTURA.md).

## Estructura

```
index.html              # Entry point
config.example.js       # Plantilla para config.js (gitignored)
api.jsx                 # Cliente Supabase + uploads
store.jsx               # Carga/guardado + helpers (uid, addMonths, daysUntil)
auth.jsx                # Pantalla de login
app.jsx                 # Shell + bootstrap + rutas
documents.jsx           # Listado + formulario de documentos
viewer.jsx              # Visor con marca de agua
requests.jsx            # Solicitudes a terceros (público)
projects.jsx + audit.jsx# Auditorías compartidas
public.jsx              # Vista pública por QR
admin.jsx               # Panel de administración
log.jsx                 # Registro de actividad
i18n.jsx                # Traducciones es/en/de
ui.jsx + tweaks-panel.jsx# UI compartida
styles.css              # Estilos
supabase/               # schema.sql, storage.sql, seed.sql
vercel.json             # Headers + cleanUrls
```
