-- Cuestionarios en las solicitudes (2026-10-11). Aplicado en producción con las
-- migraciones docuhotel_request_forms y docuhotel_storage_requests_delete.
create table if not exists public.request_templates (
  id uuid primary key default gen_random_uuid(),
  hotel_id uuid null references public.hotels(id) on delete cascade, -- null = plantilla común a todos los hoteles
  name text not null,
  description text not null default '',
  spec jsonb not null default '{"intro":"","blocks":[]}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.request_templates enable row level security;
create policy request_templates_read on public.request_templates for select to authenticated
  using (hotel_id is null or user_can_access(hotel_id) or user_is_regional());
create policy request_templates_write on public.request_templates for all to authenticated
  using (user_is_regional() or (current_user_role() = any (array['admin','dept_head']) and (hotel_id is null or user_can_access(hotel_id))))
  with check (user_is_regional() or (current_user_role() = any (array['admin','dept_head']) and (hotel_id is null or user_can_access(hotel_id))));

alter table public.requests add column if not exists template_id uuid null;
alter table public.requests add column if not exists form_spec jsonb null;
alter table public.requests add column if not exists form_answers jsonb not null default '{}'::jsonb;

-- Guardar respuestas desde el enlace público (sin login)
create or replace function public.request_form_save(p_token text, p_answers jsonb)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_now timestamptz := now();
begin
  if p_answers is null or jsonb_typeof(p_answers) <> 'object' or octet_length(p_answers::text) > 500000 then
    raise exception 'invalid answers';
  end if;
  update requests
     set form_answers = p_answers, saved_at = v_now,
         status = case when status = 'open' then 'saved' else status end,
         updated_at = v_now
   where share_token = p_token and form_spec is not null
     and submitted_at is null and expires_at > v_now;
  if not found then raise exception 'invalid token or request closed'; end if;
  return v_now;
end $$;
revoke all on function public.request_form_save(text, jsonb) from public;
grant execute on function public.request_form_save(text, jsonb) to anon, authenticated;

-- Poder borrar los ficheros subidos a una solicitud (antes no había política de borrado)
create policy storage_requests_delete on storage.objects for delete to authenticated
using (bucket_id = 'docuhotel' and split_part(name, '/', 1) = 'requests' and exists (
  select 1 from public.requests r where r.id = split_part(objects.name, '/', 2)
   and (public.user_is_regional() or (public.user_can_access(r.hotel_id) and public.current_user_role() = any (array['admin','dept_head'])))));
