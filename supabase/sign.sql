-- Docuhotel — Módulo de firma electrónica (sobres de firma)
-- Ejecutar DESPUÉS de schema.sql
--
-- Modelo de confianza: estas tablas llevan RLS ACTIVADA y SIN NINGUNA POLÍTICA.
-- Ni la anon key ni el JWT de un usuario pueden leerlas o escribirlas: todo pasa
-- por la edge function `docu-sign`, que usa la service role. El motivo es que
-- aquí viven los tokens de firma y los hashes de los OTP — si el front pudiera
-- hacer `select * from sign_signer` cualquier empleado del hotel podría firmar
-- en nombre de otro, y se acabó el valor probatorio.

-- ───────────────────────────────────────────────────────────────────
-- Sobre de firma: una petición de firma sobre UN documento
-- ───────────────────────────────────────────────────────────────────
create table if not exists sign_envelope (
  id              uuid primary key default gen_random_uuid(),
  hotel_id        uuid not null references hotels(id) on delete cascade,
  document_id     text references documents(id) on delete set null,
  title           text not null,
  message         text default '',
  -- Copia CONGELADA del PDF en el momento del envío. No se apunta al fichero del
  -- documento porque ese puede sustituirse por una versión nueva: lo que se firmó
  -- tiene que seguir siendo byte a byte lo que se envió.
  file_key        text not null,
  file_name       text,
  file_size       bigint,
  file_mime       text,
  file_sha256     text not null,
  page_count      int,
  mode            text not null default 'parallel',   -- parallel | sequential
  require_otp     boolean not null default true,      -- código de un solo uso al email
  require_read    boolean not null default true,      -- hay que llegar al final del PDF
  require_id      boolean not null default false,     -- pedir DNI/NIE/pasaporte
  signature_kind  text not null default 'draw',       -- draw | typed
  consent_text    text not null,                      -- literal aceptado por el firmante
  consent_sha256  text not null,
  status          text not null default 'sent',       -- sent | completed | cancelled | expired
  expires_at      timestamptz not null,
  created_by      uuid references auth.users(id) on delete set null,
  created_by_name  text,
  created_by_email text,
  created_at      timestamptz not null default now(),
  completed_at    timestamptz,
  -- PDF final: original + página de firmas + certificado de auditoría
  signed_file_key text,
  signed_sha256   text,
  -- Sello de tiempo RFC-3161 (best-effort) sobre el hash del PDF final
  tsa_provider    text,
  tsa_gen_time    timestamptz,
  tsa_token       text,
  meta            jsonb not null default '{}'
);
create index if not exists idx_sign_env_hotel on sign_envelope(hotel_id, created_at desc);
create index if not exists idx_sign_env_doc   on sign_envelope(document_id);

-- ───────────────────────────────────────────────────────────────────
-- Firmantes (y destinatarios en copia)
-- ───────────────────────────────────────────────────────────────────
create table if not exists sign_signer (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid not null references sign_envelope(id) on delete cascade,
  order_idx       int not null default 0,
  name            text not null,
  email           text not null,
  token           text not null unique,               -- enlace personal (#/sign/<token>)
  status          text not null default 'pending',    -- pending|opened|read|signed|declined
  otp_hash        text,
  otp_sent_at     timestamptz,
  otp_attempts    int not null default 0,
  otp_verified_at timestamptz,
  invited_at      timestamptz,
  reminded_at     timestamptz,
  reminders       int not null default 0,
  first_opened_at timestamptz,
  read_completed_at timestamptz,
  signed_at       timestamptz,
  declined_at     timestamptz,
  decline_reason  text,
  pages_viewed    int not null default 0,
  read_seconds    int not null default 0,
  ip              text,
  ua              text,
  lang            text,
  typed_name      text,
  id_number       text,
  signature_key   text,
  signature_sha256 text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_sign_signer_env on sign_signer(envelope_id, order_idx);

-- ───────────────────────────────────────────────────────────────────
-- Rastro de auditoría: append-only y ENCADENADO POR HASH
--
-- hash = sha256(prev_hash | ts | type | signer | detail). Si alguien edita o
-- borra un evento a posteriori, la cadena deja de cuadrar y se puede demostrar.
-- El certificado del PDF final publica el hash del último eslabón.
-- ───────────────────────────────────────────────────────────────────
create table if not exists sign_event (
  id          bigserial primary key,
  envelope_id uuid not null references sign_envelope(id) on delete cascade,
  signer_id   uuid references sign_signer(id) on delete set null,
  ts          timestamptz not null default now(),
  type        text not null,
  detail      jsonb not null default '{}',
  ip          text,
  ua          text,
  prev_hash   text,
  hash        text not null
);
create index if not exists idx_sign_event_env on sign_event(envelope_id, id);

-- Append-only: un evento no se puede reescribir nunca, ni siquiera desde la
-- service role. El DELETE sí se permite, porque si no el borrado en cascada de un
-- hotel o de un sobre quedaría bloqueado para siempre; la prueba contra la
-- manipulación la da la cadena de hashes, no el trigger.
create or replace function sign_event_immutable() returns trigger
language plpgsql as $fn$
begin
  raise exception 'sign_event es un registro de auditoría inmutable (append-only)';
end;
$fn$;
drop trigger if exists trg_sign_event_no_update on sign_event;
create trigger trg_sign_event_no_update before update on sign_event
  for each row execute function sign_event_immutable();

alter table sign_envelope enable row level security;
alter table sign_signer   enable row level security;
alter table sign_event    enable row level security;
-- (a propósito: sin políticas — solo la service role de la edge function entra)
