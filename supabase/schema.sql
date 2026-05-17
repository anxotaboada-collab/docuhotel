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

-- ───────────────────────────────────────────────────────────────────
-- Multi-hotel / regional access — tables & helper functions.
-- These MUST come before the RLS policies below, because those policies
-- reference user_can_access()/user_is_regional() and the document_hotels table.
-- (Everything here is additive and idempotent: re-running this file is safe.)
-- ───────────────────────────────────────────────────────────────────

-- "Regional admin": can access every hotel in the system.
alter table app_users add column if not exists is_regional boolean not null default false;

-- Extra hotels a (non-regional) user may access, beyond app_users.hotel_id.
create table if not exists user_hotels (
  user_id    uuid not null references auth.users(id) on delete cascade,
  hotel_id   uuid not null references hotels(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, hotel_id)
);
create index if not exists idx_user_hotels_user on user_hotels(user_id);
alter table user_hotels enable row level security;

-- A regional/corporate document is a *single* documents row that is also
-- visible in the hotels listed here (no duplication). Empty for hotel-local docs.
create table if not exists document_hotels (
  document_id text not null references documents(id) on delete cascade,
  hotel_id    uuid not null references hotels(id) on delete cascade,
  primary key (document_id, hotel_id)
);
create index if not exists idx_document_hotels_hotel on document_hotels(hotel_id);
alter table document_hotels enable row level security;

-- Helpers (SECURITY DEFINER so they aren't blocked by the tables' own RLS).
create or replace function user_is_regional() returns boolean
language sql stable security definer set search_path = public as $fn$
  select coalesce((select is_regional from app_users where id = auth.uid()), false);
$fn$;

-- Every hotel id the current user may access (regional → all hotels).
create or replace function user_hotel_ids() returns uuid[]
language sql stable security definer set search_path = public as $fn$
  select case
    when user_is_regional() then array(select id from hotels)
    else array(
      select hotel_id from app_users where id = auth.uid()
      union
      select hotel_id from user_hotels where user_id = auth.uid()
    )
  end;
$fn$;

create or replace function user_can_access(p_hotel_id uuid) returns boolean
language sql stable security definer set search_path = public as $fn$
  select p_hotel_id = any(user_hotel_ids());
$fn$;

-- Fast hotel-list lookup for the boot path. The equivalent
-- `select * from hotels` query is forced through the per-row RLS policy,
-- which on Supabase calls user_hotel_ids() for every row. For a regional
-- user that helper does its own `select id from hotels`, so the cost is
-- O(N²) in the number of hotels — easily 60s+ on free-tier projects with
-- a few hundred hotels. This RPC computes user_hotel_ids() once and does a
-- single PK-indexed `id = any(...)` filter, which stays O(N).
create or replace function list_accessible_hotels() returns table (
  id uuid, name text, country text, timezone text, public_token text
)
language sql stable security definer set search_path = public as $fn$
  select id, name, country, timezone, public_token
  from hotels
  where id = any(user_hotel_ids())
  order by name
  limit 500;
$fn$;
grant execute on function list_accessible_hotels() to authenticated;

drop policy if exists user_hotels_select on user_hotels;
create policy user_hotels_select on user_hotels for select using (user_id = auth.uid() or user_is_regional());
drop policy if exists user_hotels_regional_write on user_hotels;
create policy user_hotels_regional_write on user_hotels for all using (user_is_regional()) with check (user_is_regional());

drop policy if exists document_hotels_select on document_hotels;
create policy document_hotels_select on document_hotels for select using (user_can_access(hotel_id));
drop policy if exists document_hotels_regional_write on document_hotels;
create policy document_hotels_regional_write on document_hotels for all using (user_is_regional()) with check (user_is_regional());

-- Hotels: a user can read any hotel it can access; admins (or regional) can update.
drop policy if exists hotels_select on hotels;
create policy hotels_select on hotels for select using (user_can_access(id));
drop policy if exists hotels_admin_update on hotels;
create policy hotels_admin_update on hotels for update
  using ((user_can_access(id) and current_user_role() = 'admin') or user_is_regional())
  with check ((user_can_access(id) and current_user_role() = 'admin') or user_is_regional());

-- app_users: see everyone in your hotel(s) + yourself; admins/regional manage.
drop policy if exists app_users_select on app_users;
create policy app_users_select on app_users for select using (id = auth.uid() or user_can_access(hotel_id));
drop policy if exists app_users_admin_write on app_users;
create policy app_users_admin_write on app_users
  for all using ((user_can_access(hotel_id) and current_user_role() = 'admin') or user_is_regional())
  with check ((user_can_access(hotel_id) and current_user_role() = 'admin') or user_is_regional());
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
    execute format('create policy %1$I_select on %1$I for select using (user_can_access(hotel_id))', t);
    execute format('drop policy if exists %1$I_admin_write on %1$I', t);
    execute format('create policy %1$I_admin_write on %1$I for all using ((user_can_access(hotel_id) and current_user_role() in (''admin'',''dept_head'')) or user_is_regional()) with check ((user_can_access(hotel_id) and current_user_role() in (''admin'',''dept_head'')) or user_is_regional())', t);
  end loop;
end
$do$;

-- Documents: visible if you can access the hotel (with dept scoping) OR the doc
-- is a regional/corporate doc shared into one of your hotels (document_hotels).
drop policy if exists documents_select on documents;
create policy documents_select on documents
  for select using (
    (
      user_can_access(hotel_id)
      and (
        current_user_role() = 'admin'
        or user_is_regional()
        or '*' = any(departments)
        or current_departments() && departments
        or '*' = any(current_departments())
      )
    )
    or exists (
      select 1 from document_hotels dh
      where dh.document_id = documents.id and user_can_access(dh.hotel_id)
    )
  );

drop policy if exists documents_write on documents;
create policy documents_write on documents
  for all using (
    user_is_regional()
    or (user_can_access(hotel_id) and current_user_role() in ('admin','dept_head'))
    or exists (select 1 from document_hotels dh where dh.document_id = documents.id
               and user_can_access(dh.hotel_id) and current_user_role() in ('admin','dept_head'))
  ) with check (
    user_is_regional()
    or (user_can_access(hotel_id) and current_user_role() in ('admin','dept_head'))
    or exists (select 1 from document_hotels dh where dh.document_id = documents.id
               and user_can_access(dh.hotel_id) and current_user_role() in ('admin','dept_head'))
  );

-- Requests + items + uploads + log: admin/dept_head (or regional); public access via share_token handled in client by anon key
drop policy if exists requests_rw on requests;
create policy requests_rw on requests
  for all using ((user_can_access(hotel_id) and current_user_role() in ('admin','dept_head')) or user_is_regional())
  with check ((user_can_access(hotel_id) and current_user_role() in ('admin','dept_head')) or user_is_regional());

drop policy if exists request_items_rw on request_items;
create policy request_items_rw on request_items
  for all using (exists (select 1 from requests r where r.id = request_id and (user_can_access(r.hotel_id) or user_is_regional())))
  with check (exists (select 1 from requests r where r.id = request_id and (user_can_access(r.hotel_id) or user_is_regional())));

drop policy if exists request_uploads_rw on request_uploads;
create policy request_uploads_rw on request_uploads
  for all using (exists (
    select 1 from request_items i join requests r on r.id = i.request_id
    where i.id = request_item_id and (user_can_access(r.hotel_id) or user_is_regional())
  )) with check (true);

drop policy if exists request_log_rw on request_log;
create policy request_log_rw on request_log
  for all using (exists (select 1 from requests r where r.id = request_id and (user_can_access(r.hotel_id) or user_is_regional())))
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
drop function if exists request_upload_delete(text, text);
drop function if exists request_save_progress(text);
drop function if exists request_submit(text);
drop function if exists create_hotel(text, text, text);

-- Documents marked as public_access AND in "En vigor" (status.key='active') can be
-- read by anyone who knows hotel.public_token. The status filter happens server-side
-- because the client cannot match status_id against DEFAULT_STATUSES — per-hotel
-- status rows have ids like "st_active_<uuid>", not the canonical "st_active".
create function public_documents(p_token text)
returns setof documents
language sql stable security definer set search_path = public
as $fn$
  select d.*
  from documents d
  join hotels h on h.id = d.hotel_id
  join statuses s on s.id = d.status_id
  where h.public_token = p_token
    and d.public_access = true
    and s.key = 'active';
$fn$;
grant execute on function public_documents(text) to anon, authenticated;

-- Used by the Storage policy below: tells whether a storage object path belongs
-- to a document flagged public_access AND currently En vigor. Draft public-access
-- documents stay private until they go active.
create or replace function is_public_doc_file(p_name text)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1
    from documents d
    join statuses s on s.id = d.status_id
    where d.file_key = p_name
      and d.public_access = true
      and s.key = 'active'
  );
$fn$;
grant execute on function is_public_doc_file(text) to anon, authenticated;

-- Used by the Storage policy below: tells whether a request is in a state
-- where the anonymous uploader (recipient of the share link) is allowed to
-- add files — i.e. status open/saved and not expired. SECURITY DEFINER so the
-- storage policy's check bypasses RLS on the `requests` table, which
-- otherwise hides every row from anonymous callers and makes the upload fail
-- with "new row violates row-level security policy".
create or replace function is_request_open_for_upload(p_request_id text)
returns boolean
language sql stable security definer set search_path = public
as $fn$
  select exists (
    select 1 from requests r
    where r.id = p_request_id
      and r.status in ('open','saved')
      and r.expires_at > now()
  );
$fn$;
grant execute on function is_request_open_for_upload(text) to anon, authenticated;

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

-- Soft-delete an upload, by the anonymous uploader, while the request is still
-- open (i.e. not submitted/expired). Sets request_uploads.deleted_at so
-- request_by_token (and the admin's load) stop counting it.
create function request_upload_delete(p_token text, p_upload_id text)
returns void
language plpgsql security definer set search_path = public
as $fn$
declare
  v_request_id text;
begin
  select r.id into v_request_id
    from requests r
   where r.share_token = p_token
     and r.status in ('open','saved')
     and r.expires_at > now()
     and r.submitted_at is null;
  if v_request_id is null then
    raise exception 'invalid token or request closed';
  end if;
  update request_uploads u
     set deleted_at = now()
    from request_items i
   where u.id = p_upload_id
     and i.id = u.request_item_id
     and i.request_id = v_request_id
     and u.deleted_at is null;
end;
$fn$;
grant execute on function request_upload_delete(text, text) to anon, authenticated;

-- Mark the request as "in progress" (draft saved by the uploader).
create function request_save_progress(p_token text)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  update requests
     set saved_at = now(),
         status = case when status = 'open' then 'saved' else status end,
         updated_at = now()
   where share_token = p_token
     and submitted_at is null
     and expires_at > now();
  if not found then raise exception 'invalid token or request closed'; end if;
end;
$fn$;
grant execute on function request_save_progress(text) to anon, authenticated;

-- Final submit by the uploader: locks the request (no more uploads).
create function request_submit(p_token text)
returns void
language plpgsql security definer set search_path = public
as $fn$
begin
  update requests
     set submitted_at = now(),
         status = 'submitted',
         updated_at = now()
   where share_token = p_token
     and submitted_at is null
     and expires_at > now();
  if not found then raise exception 'invalid token or request closed'; end if;
end;
$fn$;
grant execute on function request_submit(text) to anon, authenticated;

-- Master / regional: create a brand-new hotel (with the default taxonomies),
-- without touching the SQL editor. SECURITY DEFINER → bypasses RLS, but checks
-- user_is_regional() first. Returns the new hotel id.
create function create_hotel(p_name text, p_country text default 'ES', p_timezone text default 'Europe/Madrid')
returns uuid
language plpgsql security definer set search_path = public
as $fn$
declare
  v_hotel_id uuid;
  v_pfx text;
begin
  if not user_is_regional() then
    raise exception 'only regional admins can create hotels';
  end if;
  if coalesce(btrim(p_name), '') = '' then
    raise exception 'hotel name required';
  end if;
  insert into hotels(name, country, timezone)
    values (btrim(p_name), coalesce(nullif(btrim(p_country), ''), 'ES'), coalesce(nullif(btrim(p_timezone), ''), 'Europe/Madrid'))
    returning id into v_hotel_id;
  v_pfx := replace(v_hotel_id::text, '-', '');

  insert into statuses(id, hotel_id, key, color, bg, label, sort) values
    ('st_active_'||v_pfx,   v_hotel_id, 'active',   '#14532d', '#dcfce7', '{"es":"En vigor","en":"Active","de":"Gültig"}', 0),
    ('st_draft_'||v_pfx,    v_hotel_id, 'draft',    '#404040', '#e5e5e3', '{"es":"Borrador","en":"Draft","de":"Entwurf"}', 1),
    ('st_pending_'||v_pfx,  v_hotel_id, 'pending',  '#1e3a8a', '#dbeafe', '{"es":"Pendiente de aprobar","en":"Pending approval","de":"Genehmigung ausstehend"}', 2),
    ('st_archived_'||v_pfx, v_hotel_id, 'archived', '#6b6b6b', '#efefee', '{"es":"Descatalogado","en":"Archived","de":"Archiviert"}', 3);

  insert into categories(id, hotel_id, name, sort) values
    ('cat_oca_'||v_pfx,       v_hotel_id, 'OCA', 0),
    ('cat_travelife_'||v_pfx, v_hotel_id, 'Travelife', 1),
    ('cat_prl_'||v_pfx,       v_hotel_id, 'Prevención de riesgos', 2);

  insert into departments(id, hotel_id, name, sort) values
    ('dep_housekeeping_'||v_pfx, v_hotel_id, 'Housekeeping', 0),
    ('dep_fb_'||v_pfx,           v_hotel_id, 'F&B', 1),
    ('dep_kitchen_'||v_pfx,      v_hotel_id, 'Cocina', 2),
    ('dep_maint_'||v_pfx,        v_hotel_id, 'Mantenimiento', 3),
    ('dep_direction_'||v_pfx,    v_hotel_id, 'Dirección', 4),
    ('dep_hr_'||v_pfx,           v_hotel_id, 'RRHH', 5);

  insert into periods(id, hotel_id, months, manual, label, sort) values
    ('p_manual_'||v_pfx, v_hotel_id, 0,   true,  '{"es":"Manual","en":"Manual","de":"Manuell"}', 0),
    ('p_1m_'||v_pfx,     v_hotel_id, 1,   false, '{"es":"1 mes","en":"1 month","de":"1 Monat"}', 1),
    ('p_3m_'||v_pfx,     v_hotel_id, 3,   false, '{"es":"3 meses","en":"3 months","de":"3 Monate"}', 2),
    ('p_6m_'||v_pfx,     v_hotel_id, 6,   false, '{"es":"6 meses","en":"6 months","de":"6 Monate"}', 3),
    ('p_12m_'||v_pfx,    v_hotel_id, 12,  false, '{"es":"1 año","en":"1 year","de":"1 Jahr"}', 4),
    ('p_24m_'||v_pfx,    v_hotel_id, 24,  false, '{"es":"2 años","en":"2 years","de":"2 Jahre"}', 5),
    ('p_36m_'||v_pfx,    v_hotel_id, 36,  false, '{"es":"3 años","en":"3 years","de":"3 Jahre"}', 6),
    ('p_60m_'||v_pfx,    v_hotel_id, 60,  false, '{"es":"5 años","en":"5 years","de":"5 Jahre"}', 7);

  insert into responsibles(id, hotel_id, name, email) values
    ('r_dir_'||v_pfx,  v_hotel_id, 'Dirección General',     'direccion@hotel.com'),
    ('r_jefe_'||v_pfx, v_hotel_id, 'Jefa de Recepción',     'recepcion@hotel.com'),
    ('r_gov_'||v_pfx,  v_hotel_id, 'Gobernanta',            'gobernanta@hotel.com'),
    ('r_chef_'||v_pfx, v_hotel_id, 'Chef Ejecutivo',        'chef@hotel.com'),
    ('r_main_'||v_pfx, v_hotel_id, 'Jefe de Mantenimiento', 'mantenimiento@hotel.com');

  insert into hotel_config(hotel_id, data) values (v_hotel_id, '{}'::jsonb) on conflict (hotel_id) do nothing;
  return v_hotel_id;
end;
$fn$;
revoke execute on function create_hotel(text, text, text) from anon;
grant execute on function create_hotel(text, text, text) to authenticated;

-- ───────────────────────────────────────────────────────────────────
-- Activity & email logs
-- ───────────────────────────────────────────────────────────────────

drop policy if exists activity_log_select on activity_log;
create policy activity_log_select on activity_log
  for select using ((user_can_access(hotel_id) and current_user_role() in ('admin','dept_head')) or user_is_regional());

drop policy if exists activity_log_insert on activity_log;
create policy activity_log_insert on activity_log
  for insert with check (user_can_access(hotel_id) or user_is_regional());

drop policy if exists email_log_select on email_log;
create policy email_log_select on email_log
  for select using ((user_can_access(hotel_id) and current_user_role() = 'admin') or user_is_regional());

drop policy if exists email_log_insert on email_log;
create policy email_log_insert on email_log
  for insert with check (user_can_access(hotel_id) or user_is_regional());

-- ───────────────────────────────────────────────────────────────────
-- Multi-hotel / regional access — registry of regional uploads.
-- (user_hotels / document_hotels and the helper functions are defined
-- earlier, right after the RLS-enable block, because the policies above
-- depend on them.)
-- ───────────────────────────────────────────────────────────────────

-- Registry: each regional upload — what document, who, when, which hotels.
create table if not exists regional_uploads (
  id          uuid primary key default gen_random_uuid(),
  document_id text references documents(id) on delete set null,
  uploaded_by uuid references auth.users(id) on delete set null,
  title       text,
  hotel_ids   uuid[] not null default '{}',
  created_at  timestamptz not null default now()
);
alter table regional_uploads enable row level security;

drop policy if exists regional_uploads_select on regional_uploads;
create policy regional_uploads_select on regional_uploads for select using (user_is_regional());
drop policy if exists regional_uploads_regional_write on regional_uploads;
create policy regional_uploads_regional_write on regional_uploads for all using (user_is_regional()) with check (user_is_regional());
