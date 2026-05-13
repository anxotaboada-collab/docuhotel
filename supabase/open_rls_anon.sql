-- Docuhotel — TEMPORARY: open RLS to anon (no-login mode).
--
-- ⚠️  WARNING: with this script applied, ANYONE who knows the site URL can
-- read and write every row in the database. Only use while you're debugging
-- the slow GoTrue / auth flow on the free tier. Revert with the second block
-- at the bottom of this file when you're done.
--
-- Why: the app's normal RLS depends on auth.uid() (=> requires a logged-in
-- user). To skip the login we let the supabase anon role access everything.
--
-- HOW TO APPLY:
--   1. Open https://supabase.com/dashboard
--   2. Pick the docuhotel project → SQL Editor (left sidebar) → New query
--   3. Paste the "OPEN" block below, run.
--   4. To re-secure later: paste the "REVERT" block, run, and re-run schema.sql.

-- ─────────────────────────────────────────────────────────────────────
-- OPEN: grant anon full access to every table the app touches.
-- ─────────────────────────────────────────────────────────────────────

do $do$
declare t text;
begin
  for t in select unnest(array[
    'hotels','app_users','categories','departments','statuses','periods',
    'responsibles','documents','projects','requests','request_items',
    'request_uploads','request_log','activity_log','email_log',
    'email_templates','hotel_config','user_hotels','document_hotels'
  ]) loop
    -- Drop the existing policies so the open ones win.
    execute format('drop policy if exists %1$I_anon_all on %1$I', t);
    -- Single permissive policy: anyone may do anything.
    execute format('create policy %1$I_anon_all on %1$I for all to anon using (true) with check (true)', t);
    -- Authenticated users also keep full access (so existing tokens still work).
    execute format('drop policy if exists %1$I_authenticated_all on %1$I', t);
    execute format('create policy %1$I_authenticated_all on %1$I for all to authenticated using (true) with check (true)', t);
  end loop;
end
$do$;

-- Storage: let anon read/write the bucket too (PDFs).
-- Adjust 'docuhotel' if your bucket is named differently.
drop policy if exists docuhotel_storage_anon_all on storage.objects;
create policy docuhotel_storage_anon_all on storage.objects
  for all to anon
  using (bucket_id = 'docuhotel')
  with check (bucket_id = 'docuhotel');
drop policy if exists docuhotel_storage_authenticated_all on storage.objects;
create policy docuhotel_storage_authenticated_all on storage.objects
  for all to authenticated
  using (bucket_id = 'docuhotel')
  with check (bucket_id = 'docuhotel');


-- ─────────────────────────────────────────────────────────────────────
-- REVERT (run this later to re-secure the database, then re-run schema.sql
-- so the original auth-aware policies are recreated).
-- ─────────────────────────────────────────────────────────────────────
--
-- do $do$
-- declare t text;
-- begin
--   for t in select unnest(array[
--     'hotels','app_users','categories','departments','statuses','periods',
--     'responsibles','documents','projects','requests','request_items',
--     'request_uploads','request_log','activity_log','email_log',
--     'email_templates','hotel_config','user_hotels','document_hotels'
--   ]) loop
--     execute format('drop policy if exists %1$I_anon_all on %1$I', t);
--     execute format('drop policy if exists %1$I_authenticated_all on %1$I', t);
--   end loop;
-- end
-- $do$;
-- drop policy if exists docuhotel_storage_anon_all on storage.objects;
-- drop policy if exists docuhotel_storage_authenticated_all on storage.objects;
