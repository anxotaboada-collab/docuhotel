-- Docuhotel — Supabase schema
-- Run this in the Supabase SQL editor on a fresh project.
-- Idempotent: safe to re-run (CREATE IF NOT EXISTS / DROP POLICY IF EXISTS).

create extension if not exists "pgcrypto";

-- ───────────────────────────────────────────────────────────────────
-- Tenancy + identity
-- ───────────────────────────────────────────────────────────────────

create table if not exists hotels (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  country      text default 'ES',
  timezone     text default 'Europe/Madrid',
  public_token text unique not null default ('hotel-' || substr(md5(random()::text), 1, 8)),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Mirrors auth.users with hotel-scoped profile (roles, departments).
create table if not exists app_users (
  id           uuid primary key references auth.users(id) on delete cascade,
  hotel_id     uuid not null references hotels(id) on delete cascade,
  name         text not null,
  email        text not null,
  role         text not null check (role in ('admin','dept_head','employee')),
  departments  text[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_app_users_hotel on app_users(hotel_id);

-- Helper: hotel of the currently authenticated user.
create or replace function current_hotel_id() returns uuid
language sql stable security definer set search_path = public as $$
  select hotel_id from app_users where id = auth.uid();
$$;

create or replace function current_user_role() returns text
language sql stable security definer set search_path = public as $$
  select role from app_users where id = auth.uid();
$$;

create or replace function current_departments() returns text[]
language sql stable security definer set search_path = public as $$
  select departments from app_users where id = auth.uid();
$$;

-- ───────────────────────────────────────────────────────────────────
-- Taxonomies (per-hotel)
-- ───────────────────────────────────────────────────────────────────

create table if not exists categories (
  id        text primary key,
  hotel_id  uuid not null references hotels(id) on delete cascade,
  name      text not null,
  sort      int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_categories_hotel on categories(hotel_id);

create table if not exists departments (
  id        text primary key,
  hotel_id  uuid not null references hotels(id) on delete cascade,
  name      text not null,
  sort      int  not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_departments_hotel on departments(hotel_id);

create table if not exists statuses (
  id        text primary key,
  hotel_id  uuid not null references hotels(id) on delete cascade,
  key       text not null,
  color     text not null,
  bg        text not null,
  label     jsonb not null,
  sort      int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_statuses_hotel on statuses(hotel_id);

create table if not exists periods (
  id        text primary key,
  hotel_id  uuid not null references hotels(id) on delete cascade,
  months    int not null,
  manual    boolean not null default false,
  label     jsonb not null,
  sort      int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_periods_hotel on periods(hotel_id);

create table if not exists responsibles (
  id        text primary key,
  hotel_id  uuid not null references hotels(id) on delete cascade,
  name      text not null,
  email     text,
  created_at timestamptz not null default now()
);
create index if not exists idx_responsibles_hotel on responsibles(hotel_id);

-- ───────────────────────────────────────────────────────────────────
-- Documents
-- ───────────────────────────────────────────────────────────────────

create table if not exists documents (
  id              text primary key,
  hotel_id        uuid not null references hotels(id) on delete cascade,
  title           text not null,
  description     text default '',
  category_id     text references categories(id) on delete set null,
  status_id       text references statuses(id) on delete set null,
  period_id       text references periods(id) on delete set null,
  departments     text[] not null default '{}',           -- '*' means all
  responsible_ids text[] not null default '{}',
  start_date      timestamptz,
  expiry_date     timestamptz,
  version         int not null default 1,
  public_access   boolean not null default false,
  linked_doc_ids  text[] not null default '{}',
  -- File pointer (Supabase Storage)
  file_key        text,                                    -- path inside bucket
  file_name       text,
  file_size       bigint,
  file_mime       text,
  uploaded_by     uuid references auth.users(id) on delete set null,
  uploaded_at     timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_documents_hotel on documents(hotel_id);
create index if not exists idx_documents_expiry on documents(expiry_date);

-- ───────────────────────────────────────────────────────────────────
-- Projects (external audit shares)
-- ───────────────────────────────────────────────────────────────────

create table if not exists projects (
  id                text primary key,
  hotel_id          uuid not null references hotels(id) on delete cascade,
  name              text not null,
  notes             text default '',
  status            text not null default 'active',
  doc_ids           text[] not null default '{}',
  share_token       text,
  share_expires_at  timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists idx_projects_hotel on projects(hotel_id);
create unique index if not exists idx_projects_share_token on projects(share_token) where share_token is not null;

-- ───────────────────────────────────────────────────────────────────
-- Requests (public uploads from external recipients)
-- ───────────────────────────────────────────────────────────────────

create table if not exists requests (
  id               text primary key,
  hotel_id         uuid not null references hotels(id) on delete cascade,
  title            text not null,
  notes            text default '',
  recipient_name   text,
  recipient_email  text,
  share_token      text unique not null,
  expires_at       timestamptz not null,
  max_file_size_mb int not null default 10,
  status           text not null default 'open',   -- open | saved | submitted | expired
  saved_at         timestamptz,
  submitted_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists idx_requests_hotel on requests(hotel_id);

create table if not exists request_items (
  id          text primary key,
  request_id  text not null references requests(id) on delete cascade,
  title       text not null,
  comments    text default '',
  required    boolean not null default false,
  sort        int not null default 0
);
create index if not exists idx_request_items_request on request_items(request_id);

create table if not exists request_uploads (
  id              text primary key,
  request_item_id text not null references request_items(id) on delete cascade,
  file_key        text not null,
  file_name       text not null,
  file_size       bigint not null,
  file_mime       text,
  uploaded_at     timestamptz not null default now(),
  deleted_at      timestamptz
);
create index if not exists idx_request_uploads_item on request_uploads(request_item_id);

create table if not exists request_log (
  id          uuid primary key default gen_random_uuid(),
  request_id  text not null references requests(id) on delete cascade,
  ts          timestamptz not null default now(),
  action      text not null,
  details     text
);
create index if not exists idx_request_log_request on request_log(request_id);

-- ───────────────────────────────────────────────────────────────────
-- Activity log + email log + email templates + config
-- ───────────────────────────────────────────────────────────────────

create table if not exists activity_log (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references hotels(id) on delete cascade,
  ts          timestamptz not null default now(),
  user_id     uuid references auth.users(id) on delete set null,
  action      text not null,
  target_type text,
  target_id   text,
  details     text
);
create index if not exists idx_activity_log_hotel_ts on activity_log(hotel_id, ts desc);

create table if not exists email_log (
  id          uuid primary key default gen_random_uuid(),
  hotel_id    uuid not null references hotels(id) on delete cascade,
  ts          timestamptz not null default now(),
  template_id text,
  to_email    text not null,
  subject     text,
  status      text not null,
  trigger     text,
  error       text
);
create index if not exists idx_email_log_hotel_ts on email_log(hotel_id, ts desc);

create table if not exists email_templates (
  id          text primary key,
  hotel_id    uuid not null references hotels(id) on delete cascade,
  trigger     text not null,
  enabled     boolean not null default true,
  recipients  jsonb not null default '[]',
  send_hour   int default 8,
  attach_pdf  boolean default false,
  include_view_link boolean default true,
  name        jsonb not null,
  subject     jsonb not null,
  body        jsonb not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_email_templates_hotel on email_templates(hotel_id);

-- Per-hotel config blob (lang, hotel info, permissions matrix, email provider settings)
create table if not exists hotel_config (
  hotel_id    uuid primary key references hotels(id) on delete cascade,
  data        jsonb not null default '{}',
  updated_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────
-- updated_at triggers
-- ───────────────────────────────────────────────────────────────────

create or replace function set_updated_at() returns trigger
language plpgsql as $fn$
begin new.updated_at = now(); return new; end;
$fn$;

do $do$
declare t text;
begin
  for t in select unnest(array[
    'hotels','app_users','documents','projects','requests','email_templates','hotel_config'
  ]) loop
    execute format('drop trigger if exists trg_%I_updated on %I', t, t);
    execute format('create trigger trg_%I_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end
$do$;

-- ───────────────────────────────────────────────────────────────────
-- RLS
-- ───────────────────────────────────────────────────────────────────

alter table hotels          enable row level security;
alter table app_users       enable row level security;
alter table categories      enable row level security;
alter table departments     enable row level security;
alter table statuses        enable row level security;
alter table periods         enable row level security;
alter table responsibles    enable row level security;
alter table documents       enable row level security;
alter table projects        enable row level security;
alter table requests        enable row level security;
alter table request_items   enable row level security;
alter table request_uploads enable row level security;
alter table request_log     enable row level security;
alter table activity_log    enable row level security;
alter table email_log       enable row level security;
alter table email_templates enable row level security;
alter table hotel_config    enable row level security;

-- Hotels: a user can read its own hotel; only admin can update.
drop policy if exists hotels_select on hotels;
create policy hotels_select on hotels for select using (id = current_hotel_id());
drop policy if exists hotels_admin_update on hotels;
create policy hotels_admin_update on hotels for update using (id = current_hotel_id() and current_user_role() = 'admin');

-- app_users: see everyone in your hotel; admins manage.
drop policy if exists app_users_select on app_users;
create policy app_users_select on app_users for select using (hotel_id = current_hotel_id());
drop policy if exists app_users_admin_write on app_users;
create policy app_users_admin_write on app_users
  for all using (hotel_id = current_hotel_id() and current_user_role() = 'admin')
  with check (hotel_id = current_hotel_id() and current_user_role() = 'admin');
drop policy if exists app_users_self_update on app_users;
create policy app_users_self_update on app_users for update using (id = auth.uid()) with check (id = auth.uid());

-- Generic hotel-scoped policies (same shape repeated)
do $do$
declare t text;
begin
  for t in select unnest(array[
    'categories','departments','statuses','periods','responsibles',
    'projects','email_templates','hotel_config'
  ]) loop
    execute format('drop policy if exists %1$I_select on %1$I', t);
    execute format('create policy %1$I_select on %1$I for select using (hotel_id = current_hotel_id())', t);
    execute format('drop policy if exists %1$I_admin_write on %1$I', t);
    execute format('create policy %1$I_admin_write on %1$I for all using (hotel_id = current_hotel_id() and current_user_role() in (''admin'',''dept_head'')) with check (hotel_id = current_hotel_id() and current_user_role() in (''admin'',''dept_head''))', t);
  end loop;
end
$do$;

-- Documents: select scoped by department visibility.
drop policy if exists documents_select on documents;
create policy documents_select on documents
  for select using (
    hotel_id = current_hotel_id()
    and (
      current_user_role() = 'admin'
      or '*' = any(departments)
      or current_departments() && departments
      or '*' = any(current_departments())
    )
  );

drop policy if exists documents_write on documents;
create policy documents_write on documents
  for all using (
    hotel_id = current_hotel_id() and current_user_role() in ('admin','dept_head')
  ) with check (
    hotel_id = current_hotel_id() and current_user_role() in ('admin','dept_head')
  );

-- Requests + items + uploads + log: admin/dept_head; public access via share_token handled in client by anon key
drop policy if exists requests_rw on requests;
create policy requests_rw on requests
  for all using (hotel_id = current_hotel_id() and current_user_role() in ('admin','dept_head'))
  with check (hotel_id = current_hotel_id() and current_user_role() in ('admin','dept_head'));

drop policy if exists request_items_rw on request_items;
create policy request_items_rw on request_items
  for all using (exists (select 1 from requests r where r.id = request_id and r.hotel_id = current_hotel_id()))
  with check (exists (select 1 from requests r where r.id = request_id and r.hotel_id = current_hotel_id()));

drop policy if exists request_uploads_rw on request_uploads;
create policy request_uploads_rw on request_uploads
  for all using (exists (
    select 1 from request_items i join requests r on r.id = i.request_id
    where i.id = request_item_id and r.hotel_id = current_hotel_id()
  )) with check (true);

drop policy if exists request_log_rw on request_log;
create policy request_log_rw on request_log
  for all using (exists (select 1 from requests r where r.id = request_id and r.hotel_id = current_hotel_id()))
  with check (true);

-- ───────────────────────────────────────────────────────────────────
-- Public access via token (anonymous users)
-- ───────────────────────────────────────────────────────────────────

-- These RPCs are dropped first so re-running this file is safe even if an
-- older version with a different return type exists (Postgres refuses to
-- change a function's return type via CREATE OR REPLACE).
drop function if exists public_documents(text);
drop function if exists audit_project(text);
drop function if exists request_by_token(text);
drop function if exists request_log_append(text, text, text);

-- Documents marked as public_access can be read by anyone who knows hotel.public_token.
-- The frontend's "public" route always supplies the token via a SECURITY DEFINER RPC.
create function public_documents(p_token text)
returns setof documents
language sql stable security definer set search_path = public
as $fn$
  select d.*
  from documents d
  join hotels h on h.id = d.hotel_id
  where h.public_token = p_token and d.public_access = true;
$fn$;
grant execute on function public_documents(text) to anon, authenticated;

-- Project audit: validate share token and return docs.
create function audit_project(p_token text)
returns table(project jsonb, docs jsonb)
language sql stable security definer set search_path = public
as $fn$
  select
    to_jsonb(p) - 'share_token',
    coalesce(jsonb_agg(to_jsonb(d)) filter (where d.id is not null), '[]'::jsonb)
  from projects p
  left join documents d on d.id = any(p.doc_ids)
  where p.share_token = p_token
    and (p.share_expires_at is null or p.share_expires_at > now())
  group by p.id;
$fn$;
grant execute on function audit_project(text) to anon, authenticated;

-- Request access via share_token: returns request + items + uploads (no auth).
create function request_by_token(p_token text)
returns jsonb
language sql stable security definer set search_path = public
as $fn$
  select jsonb_build_object(
    'request', to_jsonb(r),
    'items', coalesce((select jsonb_agg(to_jsonb(i) order by i.sort) from request_items i where i.request_id = r.id), '[]'::jsonb),
    'uploads', coalesce((select jsonb_agg(to_jsonb(u)) from request_uploads u
                          join request_items i on i.id = u.request_item_id
                         where i.request_id = r.id and u.deleted_at is null), '[]'::jsonb)
  ) from requests r where r.share_token = p_token;
$fn$;
grant execute on function request_by_token(text) to anon, authenticated;

-- Append to request_log without auth (for public uploaders).
create function request_log_append(p_token text, p_action text, p_details text)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_request_id text;
begin
  select r.id into v_request_id from requests r where r.share_token = p_token;
  if v_request_id is null then
    raise exception 'invalid token';
  end if;
  insert into request_log (request_id, action, details)
  values (v_request_id, p_action, p_details);
end;
$fn$;
grant execute on function request_log_append(text, text, text) to anon, authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Activity & email logs
-- ───────────────────────────────────────────────────────────────────

drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log
  for select using (hotel_id = current_hotel_id() and current_user_role() in ('admin','dept_head'));

drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log
  for insert with check (hotel_id = current_hotel_id());

drop policy if exists email_log_select on email_log;
create policy email_log_select on email_log
  for select using (hotel_id = current_hotel_id() and current_user_role() = 'admin');

drop policy if exists email_log_insert on email_log;
create policy email_log_insert on email_log
  for insert with check (hotel_id = current_hotel_id());
