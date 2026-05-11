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

-- Authenticated users can READ files whose hotel they belong to.
drop policy if exists "storage_docs_read" on storage.objects;
create policy "storage_docs_read" on storage.objects
  for select using (
    bucket_id = 'docuhotel'
    and (
      -- documents path: docs/{hotel_id}/...
      (split_part(name, '/', 1) = 'docs'
        and split_part(name, '/', 2)::uuid = current_hotel_id())
      or
      -- request uploads: anyone in the hotel that owns the request
      (split_part(name, '/', 1) = 'requests'
        and exists (
          select 1 from requests r
          where r.id = split_part(name, '/', 2)
            and r.hotel_id = current_hotel_id()
        ))
    )
  );

-- Authenticated admin/dept_head can write to docs/ paths in their hotel.
drop policy if exists "storage_docs_write" on storage.objects;
create policy "storage_docs_write" on storage.objects
  for insert with check (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'docs'
    and split_part(name, '/', 2)::uuid = current_hotel_id()
    and current_role() in ('admin','dept_head')
  );

drop policy if exists "storage_docs_delete" on storage.objects;
create policy "storage_docs_delete" on storage.objects
  for delete using (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'docs'
    and split_part(name, '/', 2)::uuid = current_hotel_id()
    and current_role() = 'admin'
  );

-- Anonymous uploaders (public request links) can write to requests/{request_id}/...
-- but ONLY if a request with that id exists and is not expired/submitted.
drop policy if exists "storage_requests_anon_write" on storage.objects;
create policy "storage_requests_anon_write" on storage.objects
  for insert with check (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'requests'
    and exists (
      select 1 from requests r
      where r.id = split_part(name, '/', 2)
        and r.status in ('open','saved')
        and r.expires_at > now()
    )
  );

-- Anonymous READ for documents marked as public_access = true.
-- This lets unauthenticated visitors of #/public/{token} create signed URLs
-- for those specific PDFs (and only those).
drop policy if exists "storage_public_docs_read" on storage.objects;
create policy "storage_public_docs_read" on storage.objects
  for select using (
    bucket_id = 'docuhotel'
    and split_part(name, '/', 1) = 'docs'
    and exists (
      select 1 from documents d
      where d.file_key = name and d.public_access = true
    )
  );

-- Authenticated users in a hotel can read their hotel's request uploads
-- (already covered by storage_docs_read above through the requests/ branch).
-- Anonymous READ for request uploads is intentionally NOT granted.
