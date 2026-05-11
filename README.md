# Docuhotel

Gestor de documentos para hoteles — prototipo funcional.

## Funcionalidades

- 📄 **Documentos** — gestión completa con categorías, departamentos, estados, vigencias y caducidad manual
- 📁 **Proyectos** — agrupa documentos y comparte con auditor externo vía enlace temporal (con marca de agua)
- 📥 **Solicitudes** — pide documentación a empleados/proveedores con enlace temporal, drag&drop y log
- 🌐 **Acceso público QR** — documentos marcados como públicos accesibles por código QR
- ⚙️ **Administración** — categorías, departamentos, estados con colores, periodos, usuarios, plantillas de email, roles/permisos, datos del hotel
- 📊 **Registro inmutable** — todas las acciones quedan registradas
- 🌍 **Multidioma** — Español, English, Deutsch
- 🎨 **Modo oscuro** y densidad configurable

## Cómo abrir

Abre `index.html` directamente en el navegador. Todo el estado se guarda en `localStorage`.

## Arquitectura de producción

Ver `ARQUITECTURA.md` para la migración a:
- **GitHub** → código
- **Vercel** → publicación
- **Supabase** → base de datos + auth
- **Cloudflare R2** → almacenamiento de PDFs

## Stack actual (prototipo)

- HTML + React 18.3 (vía Babel in-browser)
- localStorage para persistencia
- Sin build step — abre el HTML y funciona

## Deploy en Vercel

1. Importa el repo en [vercel.com/new](https://vercel.com/new)
2. Framework Preset: **Other**
3. Build Command: *(vacío)*
4. Output Directory: `./`
5. Deploy
