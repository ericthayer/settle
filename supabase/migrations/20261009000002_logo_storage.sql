-- Private bucket for the business logo, one folder per owner: logos/{owner_id}/...
-- Read via signed URLs only. Skipped where the storage schema doesn't exist
-- (the plain-Postgres SQL test harness).

do $migration$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present; skipping logo bucket';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('logos', 'logos', false, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
  on conflict (id) do update
    set public = excluded.public,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;

  execute $p$
    create policy logos_owner_select on storage.objects for select to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy logos_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy logos_owner_update on storage.objects for update to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
  execute $p$
    create policy logos_owner_delete on storage.objects for delete to authenticated
      using (bucket_id = 'logos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $p$;
end
$migration$;
