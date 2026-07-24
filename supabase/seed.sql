-- Docuhotel — Seed data for a brand-new hotel.
-- Run ONCE after creating your first auth user.
--
-- HOW TO RUN (Supabase SQL Editor — NOT psql):
--   1. Authentication → Users → create your admin user, copy its "User UID".
--   2. Edit the 4 values in the `declare` block below (v_user_id, v_email, v_name, v_hname).
--   3. Paste the whole file into the SQL Editor and run it.
--
-- Note: this file uses plain SQL only (no psql `\set` / `:var` — those don't
-- work in the Supabase SQL Editor).

-- Safe to re-run: if the admin user already has a hotel, it reuses it and
-- only fills in any missing default rows (ON CONFLICT DO NOTHING everywhere).
do $do$
declare
  -- ▼▼▼ EDIT THESE FOUR VALUES ▼▼▼
  v_user_id uuid := '00000000-0000-0000-0000-000000000000';  -- the auth user UID
  v_email   text := 'admin@hotel.com';
  v_name    text := 'Administrador';
  v_hname   text := 'Hotel Demo';
  -- ▲▲▲ EDIT THESE FOUR VALUES ▲▲▲
  v_hotel_id uuid;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Edit v_user_id at the top of this file with your real auth user UID first (Authentication -> Users -> User UID).';
  end if;
  if not exists (select 1 from auth.users where id = v_user_id) then
    raise exception 'No auth user with id % exists. Create it in Authentication -> Users first.', v_user_id;
  end if;

  -- Hotel + admin profile (reuse if the user is already linked to one)
  select hotel_id into v_hotel_id from app_users where id = v_user_id;
  if v_hotel_id is null then
    insert into hotels(name) values (v_hname) returning id into v_hotel_id;
    insert into app_users(id, hotel_id, name, email, role, departments)
    values (v_user_id, v_hotel_id, v_name, v_email, 'admin', array['*']);
  end if;

  -- Default statuses
  insert into statuses(id, hotel_id, key, color, bg, label, sort) values
    ('st_active',   v_hotel_id, 'active',   '#14532d', '#dcfce7', '{"es":"En vigor","en":"Active","de":"Gültig"}', 0),
    ('st_draft',    v_hotel_id, 'draft',    '#404040', '#e5e5e3', '{"es":"Borrador","en":"Draft","de":"Entwurf"}', 1),
    ('st_pending',  v_hotel_id, 'pending',  '#1e3a8a', '#dbeafe', '{"es":"Pendiente de aprobar","en":"Pending approval","de":"Genehmigung ausstehend"}', 2),
    ('st_archived', v_hotel_id, 'archived', '#6b6b6b', '#efefee', '{"es":"Descatalogado","en":"Archived","de":"Archiviert"}', 3)
  on conflict (id) do nothing;

  -- Default categories (GLOBAL taxonomy: no hotel_id, shared by every hotel)
  insert into categories(id, name, sort) values
    ('cat_oca',       'OCA', 0),
    ('cat_travelife', 'Travelife', 1),
    ('cat_prl',       'Prevención de riesgos', 2)
  on conflict (id) do nothing;

  -- Default departments
  insert into departments(id, hotel_id, name, sort) values
    ('dep_housekeeping', v_hotel_id, 'Housekeeping', 0),
    ('dep_fb',           v_hotel_id, 'F&B', 1),
    ('dep_kitchen',      v_hotel_id, 'Cocina', 2),
    ('dep_maint',        v_hotel_id, 'Mantenimiento', 3),
    ('dep_direction',    v_hotel_id, 'Dirección', 4),
    ('dep_hr',           v_hotel_id, 'RRHH', 5)
  on conflict (id) do nothing;

  -- Default periods
  insert into periods(id, hotel_id, months, manual, label, sort) values
    ('p_manual', v_hotel_id, 0,   true,  '{"es":"Manual","en":"Manual","de":"Manuell"}', 0),
    ('p_1m',     v_hotel_id, 1,   false, '{"es":"1 mes","en":"1 month","de":"1 Monat"}', 1),
    ('p_2m',     v_hotel_id, 2,   false, '{"es":"2 meses","en":"2 months","de":"2 Monate"}', 2),
    ('p_3m',     v_hotel_id, 3,   false, '{"es":"3 meses","en":"3 months","de":"3 Monate"}', 3),
    ('p_6m',     v_hotel_id, 6,   false, '{"es":"6 meses","en":"6 months","de":"6 Monate"}', 4),
    ('p_12m',    v_hotel_id, 12,  false, '{"es":"1 año","en":"1 year","de":"1 Jahr"}', 5),
    ('p_24m',    v_hotel_id, 24,  false, '{"es":"2 años","en":"2 years","de":"2 Jahre"}', 6),
    ('p_36m',    v_hotel_id, 36,  false, '{"es":"3 años","en":"3 years","de":"3 Jahre"}', 7),
    ('p_60m',    v_hotel_id, 60,  false, '{"es":"5 años","en":"5 years","de":"5 Jahre"}', 8),
    ('p_120m',   v_hotel_id, 120, false, '{"es":"10 años","en":"10 years","de":"10 Jahre"}', 9),
    ('p_240m',   v_hotel_id, 240, false, '{"es":"20 años","en":"20 years","de":"20 Jahre"}', 10)
  on conflict (id) do nothing;

  -- Default responsibles
  insert into responsibles(id, hotel_id, name, email) values
    ('r_dir',  v_hotel_id, 'Dirección General',     'direccion@hotel.com'),
    ('r_jefe', v_hotel_id, 'Jefa de Recepción',     'recepcion@hotel.com'),
    ('r_gov',  v_hotel_id, 'Gobernanta',            'gobernanta@hotel.com'),
    ('r_chef', v_hotel_id, 'Chef Ejecutivo',        'chef@hotel.com'),
    ('r_main', v_hotel_id, 'Jefe de Mantenimiento', 'mantenimiento@hotel.com')
  on conflict (id) do nothing;

  -- Empty hotel_config (frontend will fill it)
  insert into hotel_config(hotel_id, data) values (v_hotel_id, '{}'::jsonb)
  on conflict (hotel_id) do nothing;

  raise notice 'Seed complete. Hotel "%" id %, admin %.', v_hname, v_hotel_id, v_email;
end
$do$;
