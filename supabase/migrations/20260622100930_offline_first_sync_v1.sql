-- Offline-first sync contract v1.
--
-- This migration adds generic row-change metadata, a client mutation journal,
-- and media-variant metadata. It avoids a narrow application table list by
-- registering all current public base tables that have primary keys, excluding
-- the sync metadata tables themselves. Future tables can opt in with
-- public.sync_register_table('table_name').

create extension if not exists pgcrypto;

create table if not exists public.sync_tables (
  table_name text primary key,
  primary_key_columns text[] not null,
  readable_offline boolean not null default true,
  writable_offline boolean not null default true,
  registered_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.sync_entities (
  table_name text not null,
  pk jsonb not null,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  server_version bigint generated always as identity,
  row_hash text,
  user_id uuid,
  changed_at timestamptz not null default now(),
  deleted_at timestamptz,
  primary key (table_name, pk)
);

create index if not exists idx_sync_entities_version
  on public.sync_entities(server_version);

create index if not exists idx_sync_entities_changed_at
  on public.sync_entities(changed_at);

create table if not exists public.sync_mutations (
  id uuid primary key default gen_random_uuid(),
  client_mutation_id uuid not null,
  user_id uuid not null default auth.uid(),
  table_name text not null references public.sync_tables(table_name),
  pk jsonb,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  base_server_version bigint,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending'
    check (status in ('pending', 'applied', 'conflicted', 'rejected')),
  conflict jsonb,
  created_at timestamptz not null default now(),
  applied_at timestamptz,
  unique (user_id, client_mutation_id)
);

create index if not exists idx_sync_mutations_user_status
  on public.sync_mutations(user_id, status, created_at);

create table if not exists public.media_assets (
  id uuid primary key default gen_random_uuid(),
  source_table text,
  source_pk jsonb,
  source_column text,
  media_type text not null check (media_type in ('image', 'audio')),
  original_bucket text not null,
  original_path text not null,
  offline_bucket text,
  offline_path text,
  content_hash text,
  byte_size bigint,
  width integer,
  height integer,
  duration_seconds numeric,
  variant_format text,
  variant_quality integer,
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (media_type, original_bucket, original_path)
);

create index if not exists idx_media_assets_source
  on public.media_assets(source_table, source_pk);

create index if not exists idx_media_assets_updated_at
  on public.media_assets(updated_at);

create table if not exists public.offline_download_packs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  pack_type text not null,
  pack_key text not null,
  title text,
  manifest jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, pack_type, pack_key)
);

alter table public.sync_tables enable row level security;
alter table public.sync_entities enable row level security;
alter table public.sync_mutations enable row level security;
alter table public.media_assets enable row level security;
alter table public.offline_download_packs enable row level security;

drop policy if exists "Authenticated users read sync table registry" on public.sync_tables;
create policy "Authenticated users read sync table registry"
  on public.sync_tables for select
  to authenticated
  using (true);

drop policy if exists "Authenticated users read sync entity versions" on public.sync_entities;
create policy "Authenticated users read sync entity versions"
  on public.sync_entities for select
  to authenticated
  using (true);

drop policy if exists "Users manage own sync mutations" on public.sync_mutations;
create policy "Users manage own sync mutations"
  on public.sync_mutations for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "Authenticated users read media asset manifest" on public.media_assets;
create policy "Authenticated users read media asset manifest"
  on public.media_assets for select
  to authenticated
  using (deleted_at is null);

drop policy if exists "Users manage own offline download packs" on public.offline_download_packs;
create policy "Users manage own offline download packs"
  on public.offline_download_packs for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select on public.sync_tables to authenticated;
grant select on public.sync_entities to authenticated;
grant select on public.media_assets to authenticated;
grant select, insert, update, delete on public.sync_mutations to authenticated;
grant select, insert, update, delete on public.offline_download_packs to authenticated;

create or replace function public.sync_pk_for_row(target_table text, row_data jsonb)
returns jsonb
language plpgsql
stable
as $$
declare
  pk_columns text[];
  pk jsonb := '{}'::jsonb;
  column_name text;
begin
  select primary_key_columns
    into pk_columns
    from public.sync_tables
   where sync_tables.table_name = sync_pk_for_row.target_table;

  if pk_columns is null or array_length(pk_columns, 1) is null then
    raise exception 'Table % is not registered for sync', target_table;
  end if;

  foreach column_name in array pk_columns loop
    pk := pk || jsonb_build_object(column_name, row_data -> column_name);
  end loop;

  return pk;
end;
$$;

create or replace function public.sync_touch_entity()
returns trigger
language plpgsql
as $$
declare
  row_data jsonb;
  entity_pk jsonb;
  owner uuid;
begin
  row_data := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  entity_pk := public.sync_pk_for_row(tg_table_name, row_data);
  owner := nullif(row_data ->> 'user_id', '')::uuid;

  insert into public.sync_entities (
    table_name,
    pk,
    operation,
    row_hash,
    user_id,
    changed_at,
    deleted_at
  )
  values (
    tg_table_name,
    entity_pk,
    lower(tg_op),
    case when tg_op = 'DELETE' then null else encode(digest(row_data::text, 'sha256'), 'hex') end,
    owner,
    now(),
    case when tg_op = 'DELETE' then now() else null end
  )
  on conflict (table_name, pk) do update
  set operation = excluded.operation,
      row_hash = excluded.row_hash,
      user_id = excluded.user_id,
      changed_at = excluded.changed_at,
      deleted_at = excluded.deleted_at;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

create or replace function public.sync_register_table(target_table text)
returns void
language plpgsql
as $$
declare
  pk_columns text[];
  trigger_name text;
begin
  select array_agg(a.attname order by a.attnum)
    into pk_columns
    from pg_index i
    join pg_attribute a
      on a.attrelid = i.indrelid
     and a.attnum = any(i.indkey)
   where i.indrelid = format('public.%I', target_table)::regclass
     and i.indisprimary;

  if pk_columns is null or array_length(pk_columns, 1) is null then
    raise exception 'Cannot register %. It has no primary key.', target_table;
  end if;

  insert into public.sync_tables(table_name, primary_key_columns)
  values (target_table, pk_columns)
  on conflict (table_name) do update
  set primary_key_columns = excluded.primary_key_columns,
      updated_at = now();

  trigger_name := format('sync_touch_%s', target_table);
  execute format('drop trigger if exists %I on public.%I', trigger_name, target_table);
  execute format(
    'create trigger %I after insert or update or delete on public.%I for each row execute function public.sync_touch_entity()',
    trigger_name,
    target_table
  );
end;
$$;

create or replace function public.sync_has_conflict(
  target_table text,
  target_pk jsonb,
  base_server_version bigint
)
returns boolean
language sql
stable
as $$
  select coalesce(
    (
      select server_version > coalesce(base_server_version, 0)
      from public.sync_entities
      where table_name = target_table
        and pk = target_pk
    ),
    false
  );
$$;

grant execute on function public.sync_has_conflict(text, jsonb, bigint) to authenticated;

do $$
declare
  table_record record;
begin
  for table_record in
    select c.relname as table_name
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public'
       and c.relkind = 'r'
       and c.relname not in (
         'sync_tables',
         'sync_entities',
         'sync_mutations',
         'media_assets',
         'offline_download_packs'
       )
       and exists (
         select 1
           from pg_index i
          where i.indrelid = c.oid
            and i.indisprimary
       )
  loop
    perform public.sync_register_table(table_record.table_name);
  end loop;
end $$;
