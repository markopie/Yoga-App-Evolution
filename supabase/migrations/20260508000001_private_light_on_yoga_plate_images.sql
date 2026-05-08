insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'light-on-yoga-plates',
  'light-on-yoga-plates',
  false,
  5242880,
  array['image/webp']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Mark can read private Light on Yoga plates" on storage.objects;

create policy "Mark can read private Light on Yoga plates"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'light-on-yoga-plates'
  and lower(coalesce(auth.jwt() ->> 'email', '')) = 'mark.opie@gmail.com'
);
