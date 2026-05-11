-- Docuhotel — Seed data for a brand-new hotel.
-- Run ONCE after creating your first auth user.
-- BEFORE running, replace the two placeholders below:
--   :AUTH_USER_ID   the uuid of your first Supabase auth user (Authentication → Users → click user → "User UID")
--   :ADMIN_EMAIL    that user's email
--   :ADMIN_NAME     a display name for the admin
--   :HOTEL_NAME     your hotel's name

-- Example:
--   psql ... -v AUTH_USER_ID="'11111111-1111-1111-1111-111111111111'" \
--             -v ADMIN_EMAIL="'admin@hotel.com'" \
--             -v ADMIN_NAME="'Admin'" \
--             -v HOTEL_NAME="'Hotel Demo'" -f seed.sql
-- Or just edit the values inline below and run from the SQL editor.

\set AUTH_USER_ID '00000000-0000-0000-0000-000000000000'
\set ADMIN_EMAIL  'admin@hotel.com'
\set ADMIN_NAME   'Administrador'
\set HOTEL_NAME   'Hotel Demo'

do $$
declare
  v_hotel_id uuid;
  v_user_id  uuid := :'AUTH_USER_ID'::uuid;
  v_email    text := :'ADMIN_EMAIL';
  v_name     text := :'ADMIN_NAME';
  v_hname    text := :'HOTEL_NAME';
begin
  -- Hotel
  insert into hotels(name) values (v_hname) returning id into v_hotel_id;

  -- Admin profile
  insert into app_users(id, hotel_id, name, email, role, departments)
  values (v_user_id, v_hotel_id, v_name, v_email, 'admin', array['*']);

  -- Default statuses
  insert into statuses(id, hotel_id, key, color, bg, label, sort) values
    ('st_active',   v_hotel_id, 'active',   '#14532d', '#dcfce7', '{"es":"En vigor","en":"Active","de":"Gültig"}', 0),
    ('st_draft',    v_hotel_id, 'draft',    '#404040', '#e5e5e3', '{"es":"Borrador","en":"Draft","de":"Entwurf"}', 1),
    ('st_pending',  v_hotel_id, 'pending',  '#1e3a8a', '#dbeafe', '{"es":"Pendiente de aprobar","en":"Pending approval","de":"Genehmigung ausstehend"}', 2),
    ('st_archived', v_hotel_id, 'archived', '#6b6b6b', '#efefee', '{"es":"Descatalogado","en":"Archived","de":"Archiviert"}', 3);

  -- Default categories
  insert into categories(id, hotel_id, name, sort) values
    ('cat_oca',       v_hotel_id, 'OCA', 0),
    ('cat_travelife', v_hotel_id, 'Travelife', 1),
    ('cat_prl',       v_hotel_id, 'Prevención de riesgos', 2);

  -- Default departments
  insert into departments(id, hotel_id, name, sort) values
    ('dep_housekeeping', v_hotel_id, 'Housekeeping', 0),
    ('dep_fb',           v_hotel_id, 'F&B', 1),
    ('dep_kitchen',      v_hotel_id, 'Cocina', 2),
    ('dep_maint',        v_hotel_id, 'Mantenimiento', 3),
    ('dep_direction',    v_hotel_id, 'Dirección', 4),
    ('dep_hr',           v_hotel_id, 'RRHH', 5);

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
    ('p_240m',   v_hotel_id, 240, false, '{"es":"20 años","en":"20 years","de":"20 Jahre"}', 10);

  -- Default responsibles
  insert into responsibles(id, hotel_id, name, email) values
    ('r_dir',  v_hotel_id, 'Dirección General',     'direccion@hotel.com'),
    ('r_jefe', v_hotel_id, 'Jefa de Recepción',     'recepcion@hotel.com'),
    ('r_gov',  v_hotel_id, 'Gobernanta',            'gobernanta@hotel.com'),
    ('r_chef', v_hotel_id, 'Chef Ejecutivo',        'chef@hotel.com'),
    ('r_main', v_hotel_id, 'Jefe de Mantenimiento', 'mantenimiento@hotel.com');

  -- Empty hotel_config (frontend will fill it)
  insert into hotel_config(hotel_id, data) values (v_hotel_id, '{}'::jsonb);
end $$;
