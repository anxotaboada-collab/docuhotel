-- Docuhotel — Storage buckets and policies
-- Run AFTER schema.sql

-- Private bucket for all document and request uploads.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'docuhotel',
  'docuhotel',
  false,
  52428800, -- 50 MB
  array['application/pdf','image/jpeg','image/png','image/webp']
) on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Path layout:
--   docs/{hotel_id}/{doc_id}/{filename}
--   requests/{request_id}/{item_id}/{upload_id}_{filename}

-- Authenticated users can READ files whose hotel they can access (incl. regional),
-- plus files of docs shared into one of their hotels via document_hotels — those
-- may live under another hotel's path (regional / re-homed documents).
drop policy if exists "storage_docs_read" on storage.objects;
create policy "storage_docs_read" on storage.objects
  for select using (
    bucket_id = 'docuhotel'
    and (
      -- documents path: docs/{hotel_id}/{doc_id}/...
      (split_part(name, '/', 1) = 'docs'
        and (user_is_regional()
          or user_can_access(split_part(name, '/', 2)::uuid)
          or exists (
            select 1 from document_hotels dh
            where dh.document_id = split_part(name, '/', 3)
              and user_can_access(dh.hotel_id)
          )))
      or
      -- request uploads: anyone in the hotel that owns the request
      (split_part(name, '/', 1) = 'requests'
        and exists (
          select 1 from requests r
          where r.id = split_part(name, '/', 2)
            and (user_is_regional() or user_can_access(r.hotel_id))
        ))
    )
  );

-- Authenticated admin/dept_head (or regional) can write to docs/ paths in their hotel.
drop policy if exists "storage_docs_write" on storage.objects;
create policy "storage_docs_write" on storage.objects
  for insert with check (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'docs'
    and (
      user_is_regional()
      or (user_can_access(split_part(name, '/', 2)::uuid) and current_user_role() in ('admin','dept_head'))
    )
  );

drop policy if exists "storage_docs_delete" on storage.objects;
create policy "storage_docs_delete" on storage.objects
  for delete using (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'docs'
    and (
      user_is_regional()
      or (user_can_access(split_part(name, '/', 2)::uuid) and current_user_role() = 'admin')
    )
  );

-- Anonymous uploaders (public request links) can write to requests/{request_id}/...
-- but ONLY if a request with that id exists and is not expired/submitted.
-- The freshness check goes through is_request_open_for_upload(), a SECURITY
-- DEFINER helper, so it bypasses RLS on the `requests` table (which otherwise
-- hides every row from anon callers and makes the insert fail with
-- "new row violates row-level security policy").
drop policy if exists "storage_requests_anon_write" on storage.objects;
create policy "storage_requests_anon_write" on storage.objects
  for insert with check (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'requests'
    and is_request_open_for_upload(split_part(name, '/', 2))
  );

-- Anonymous READ for documents marked as public_access = true.
-- This lets unauthenticated visitors of #/public/{token} create signed URLs
-- for those specific PDFs (and only those).
drop policy if exists "storage_public_docs_read" on storage.objects;
create policy "storage_public_docs_read" on storage.objects
  for select using (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'docs'
    and is_public_doc_file(name)   -- SECURITY DEFINER helper (see schema.sql)
  );

-- Authenticated users in a hotel can read their hotel's request uploads
-- (already covered by storage_docs_read above through the requests/ branch).
-- Anonymous READ for request uploads is intentionally NOT granted.
