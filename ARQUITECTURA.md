# Docuhotel — Arquitectura técnica

Este documento describe cómo migrar Docuhotel desde el prototipo actual (estado en `localStorage`, archivos en `dataURL`) hacia una arquitectura de producción real:

```
GitHub  ──►  Vercel  ──►  Supabase  ──►  Cloudflare R2
(código)    (web app)    (DB + auth)    (archivos)
```

---

## 1. Visión general

| Capa | Servicio | Responsabilidad |
|---|---|---|
| Código fuente | **GitHub** | Repositorio único `docuhotel/`. Branch `main` = producción, `develop` = staging. CI con GitHub Actions opcional. |
| Publicación / runtime | **Vercel** | Deploy automático en cada push a `main`. Variables de entorno (Supabase URL, anon key, R2 creds). SSR/edge para rutas seguras. |
| DB · Auth · API | **Supabase** | Postgres + Row Level Security + Auth (email/password, SSO). Realtime para el log. Storage NO se usa (lo hace R2). |
| Almacenamiento de PDF | **Cloudflare R2** | Bucket privado `docuhotel-prod`. Acceso vía URLs prefirmadas (S3-compatible). Tarifa plana, sin egress. |

---

## 2. Modelo de datos (Supabase / Postgres)

Las tablas reflejan el estado actual en `store.jsx`. Todas con `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at` y `hotel_id` (multi-tenant ready).

### 2.1 Tablas

```sql
-- Multi-tenancy raíz
hotels(id, name, country, timezone, week_start, default_lang, currency)

-- Auth y permisos
users(id, hotel_id, email, name, role_id, departments[], active)
roles(id, hotel_id, name, permissions jsonb)  -- {view,upload,edit,approve,delete,configure}

-- Taxonomías
categories(id, hotel_id, name, color, sort)
departments(id, hotel_id, name)
statuses(id, hotel_id, name, color, is_active)
periods(id, hotel_id, name, months)
responsibles(id, hotel_id, name, email, role)

-- Núcleo
documents(
  id, hotel_id, title, description,
  category_id, status_id, period_id,
  departments[], responsible_id, visibility,  -- 'all' | 'restricted' | 'public'
  public_token, public_enabled,
  start_date, expiry_date, version,
  uploaded_by, uploaded_at,
  file_key,  -- ► clave en R2, NO el archivo
  file_name, file_size, file_mime,
  linked_doc_ids[]
)

-- Proyectos (auditorías)
projects(
  id, hotel_id, name, notes, status,
  doc_ids[],
  share_token, share_enabled, share_expires_at
)

-- Solicitudes de documentación  ►► nuevo
requests(
  id, hotel_id, title, notes,
  recipient_name, recipient_email,
  share_token, expires_at, max_file_size_mb,
  status,  -- 'open' | 'saved' | 'submitted' | 'expired'
  saved_at, submitted_at
)
request_items(
  id, request_id, title, comments, required, sort
)
request_uploads(
  id, request_item_id,
  file_key,  -- R2
  file_name, file_size, file_mime,
  uploaded_at, deleted_at,
  uploader_ip, uploader_ua  -- huella mínima
)
request_log(
  id, request_id, ts, action, details, ip
)

-- Auditoría general
activity_log(id, hotel_id, ts, user_id, action, target_type, target_id, details, ip)
email_log(id, hotel_id, ts, template_id, to_email, subject, status, error)
email_templates(id, hotel_id, trigger, lang, subject, body, recipients jsonb, enabled)
```

### 2.2 Row Level Security (clave)

```sql
-- Solo usuarios de mi hotel ven datos de mi hotel
create policy hotel_isolation on documents
  for all using (hotel_id = (select hotel_id from users where id = auth.uid()));

-- Visibilidad por departamento
create policy doc_dept_visibility on documents
  for select using (
    visibility = 'all'
    or (auth.uid() is not null and exists (
      select 1 from users u
      where u.id = auth.uid() and u.departments && documents.departments
    ))
  );

-- Solo admin/manager pueden editar
create policy doc_edit on documents
  for update using (
    exists (select 1 from users u join roles r on u.role_id = r.id
            where u.id = auth.uid() and (r.permissions->>'edit')::bool)
  );

-- Solicitudes: el público vía share_token (sin login)
-- → se accede mediante Edge Function que valida el token, NO con RLS directo
```

### 2.3 Buckets / almacenamiento R2

```
docuhotel-prod/
  docs/{hotel_id}/{doc_id}/{version}.pdf
  request-uploads/{request_id}/{item_id}/{upload_id}.{ext}
  qr/{token}.png            (opcional, cache)
```

Acceso siempre por URL **prefirmada** (15 min para vista, 5 min para upload). El cliente nunca tiene credenciales R2.

---

## 3. Flujos críticos

### 3.1 Subir un documento (admin)
1. Cliente pide a Supabase Edge Function `presign-upload` → recibe URL R2 prefirmada (PUT).
2. Cliente sube el PDF directo a R2 (no pasa por el servidor).
3. Cliente llama a `documents.insert` con `file_key` y metadatos.
4. Trigger Postgres → escribe en `activity_log` + dispara plantilla `doc_new_published`.

### 3.2 Visualizar / descargar (usuario interno)
1. Cliente pide `presign-view?doc_id=...` → la Edge Function comprueba RLS + visibilidad por dpto.
2. Devuelve URL R2 firmada con cabecera `Content-Disposition: inline` (vista) o `attachment` (descarga).
3. La marca de agua (nombre, fecha, hotel) se aplica server-side con `pdf-lib` antes de devolver la URL, **o** client-side al renderizar.

### 3.3 Acceso público (huésped, código QR)
- `documents.public_enabled = true` y `public_token` único.
- Edge Function `/public/{token}` valida token, devuelve vista solo-lectura con watermark "PÚBLICO".
- Sin login, sin sesión, sin entrar en activity_log.

### 3.4 Auditoría externa (proyecto compartido)
- `projects.share_token` + `share_expires_at`.
- Edge Function `/audit/{token}` pide nombre + entidad → guarda en `sessionStorage` + `activity_log`.
- Cada vista/descarga del auditor entra en `activity_log` con flag `external_audit = true`.

### 3.5 Solicitud de documentación (NUEVO)
```
Admin                      Destinatario
─────                      ─────────────
1. Crea request +
   items + expiry
2. Genera share_token
3. Envía email con
   /request/{token}    ──►  4. Abre enlace
                            5. Sube archivos por item
                              · Validación de tamaño cliente
                              · presign-upload por archivo
                              · Insert en request_uploads
                              · INSERT request_log (action=upload)
                            6. [Guardar borrador]
                              · saved_at = now()
                              · puede volver con el mismo link
                            6'. [Enviar definitivamente]
                              · submitted_at = now()
                              · status = 'submitted'
                              · enlace bloquea modo edición
                              · email a admin (plantilla request_submitted)
```

Reglas:
- Si `now() > expires_at` y `status != 'submitted'` → estado `expired`, bloqueado.
- Tamaño por archivo validado **dos veces**: cliente (UX) y Edge Function (seguridad).
- Soft-delete: `request_uploads.deleted_at` permite ver "se subió y luego se borró".

---

## 4. Reparto de responsabilidades

| Acción | Cliente (Vercel/React) | Edge Function | Postgres (Supabase) | R2 |
|---|---|---|---|---|
| Login | UI | – | `auth.users` | – |
| Listar docs | render | – | RLS filtra | – |
| Subir doc | UI + drag&drop | `presign-upload` | INSERT con file_key | PUT directo |
| Ver doc | UI | `presign-view` (RLS check) | SELECT | GET firmado |
| Solicitud pública | UI sin auth | `validate-token` + `presign-upload` | INSERT request_uploads | PUT directo |
| Email | – | trigger → Resend API | – | – |
| Marca de agua | render canvas | – | – | – |

---

## 5. Variables de entorno (Vercel)

```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE=eyJ...           # solo en Edge Functions
R2_ACCOUNT_ID=xxx
R2_ACCESS_KEY_ID=xxx
R2_SECRET_ACCESS_KEY=xxx
R2_BUCKET=docuhotel-prod
R2_PUBLIC_BASE=https://files.docuhotel.com   # opcional, dominio propio
RESEND_API_KEY=re_xxx
APP_URL=https://app.docuhotel.com
```

---

## 6. Plan de migración del prototipo

El prototipo actual guarda todo en `localStorage` bajo la clave `docuhotel:v1`. Para migrar:

1. **Definir capa de persistencia** (`store.jsx` → `api.js`):
   ```js
   // Hoy:                           Mañana:
   localStorage.getItem(LS_KEY)  →   supabase.from('documents').select(...)
   ```
   Las funciones del front no cambian: misma forma de datos.

2. **Files (dataURL → R2)**:
   ```js
   // Hoy: doc.file.dataUrl (base64 en localStorage)
   // Mañana: doc.file_key → presign-view → URL firmada
   ```

3. **Auth**:
   - `state.config.currentUserId` → `supabase.auth.getUser()`.
   - Roles desde tabla, no constantes.

4. **Migración de datos demo**: script SQL `seed.sql` con las categorías, estados, departamentos por defecto (mismos del prototipo).

---

## 7. Seguridad — checklist mínimo

- [ ] RLS habilitado en TODAS las tablas
- [ ] `service_role` SOLO en Edge Functions, nunca expuesto al cliente
- [ ] URLs R2 prefirmadas: TTL máx. 15 min vista, 5 min upload
- [ ] Tamaño máximo enforzado en Edge Function (no confiar en cliente)
- [ ] MIME type whitelist: `application/pdf`, `image/jpeg`, `image/png`
- [ ] Tokens de proyecto/solicitud: 16+ chars random, no secuenciales
- [ ] Rate limit en endpoints públicos (`/audit`, `/request`, `/public`)
- [ ] CSP cabeceras en Vercel (`next.config.js` o `vercel.json`)
- [ ] HTTPS strict, HSTS preload
- [ ] Backups Supabase: PITR 7 días mínimo
- [ ] R2 versioning activado en bucket

---

## 8. Coste estimado (orientativo, 1 hotel)

| Servicio | Plan | Coste/mes |
|---|---|---|
| Vercel | Hobby (1 proyecto) | 0 € |
| Supabase | Free (500MB, 1GB transfer) | 0 € |
| Cloudflare R2 | 10 GB storage + 1M ops | ~1.5 € |
| Resend | 3.000 emails/mes | 0 € |
| **Total** | | **~1.5 €/mes** |

Para 10 hoteles activos: Vercel Pro (20 €) + Supabase Pro (25 €) + R2 (~15 €) + Resend (20 €) ≈ **80 €/mes**.

---

## 9. Stack frontend recomendado para reescritura

Cuando se reescriba el prototipo para producción:

- **Next.js 15** (App Router) en Vercel — SSR para rutas privadas
- **TypeScript** estricto
- **@supabase/ssr** para auth cookies
- **TanStack Query** para estado servidor
- **shadcn/ui** + Tailwind (sustituye `styles.css`)
- **react-hook-form** + Zod (formularios)
- **pdf-lib** (watermark server-side)
- **react-dropzone** (uploads)
- **@aws-sdk/client-s3** + `@aws-sdk/s3-request-presigner` (R2 es S3-compatible)

El `i18n.jsx` actual ya está estructurado igual que `next-intl` espera — migración directa.
