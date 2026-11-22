-- Energy Map: Layer 2 Anonymous Remote Push Devices Schema & Hardened RPCs
--
-- Security & Privacy Architecture:
-- - `SUPABASE_SERVICE_ROLE_KEY` NEVER lives on Vercel.
-- - `public.push_devices` has RLS enabled and ALL privileges revoked from
--   `PUBLIC`, `anon`, and `authenticated` — clients can never SELECT or dump
--   tokens, and Vercel can never touch any other table (such as `public.foods`).
-- - A server-only shared secret lives in `private.push_config` (non-exposed
--   schema, revoked from `PUBLIC`, `anon`, and `authenticated`).
-- - Two narrow `SECURITY DEFINER` RPCs (`register_push_device` and
--   `unregister_push_device`, both `SET search_path = ''`, returning `void`)
--   verify `p_secret` against `private.push_config` BEFORE validating inputs
--   and touching `public.push_devices`. Direct PostgREST calls from `anon`
--   without `PUSH_RPC_SECRET` fail immediately with `42501` (unauthorized).
-- - `user_id` is nullable and references `auth.users(id)` so the schema is
--   ready for optional future Supabase Auth binding without a breaking change.
-- - Only the maintainer's local CLI (`scripts/push/send-announcement.js`) uses
--   `SUPABASE_SERVICE_ROLE_KEY` to query tokens and prune stale rows.

-- 1. Device token table (locked down; service_role + SECURITY DEFINER RPCs only)
create table if not exists public.push_devices (
  installation_id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ios', 'android')),
  token text not null unique,
  topics text[] not null default '{}'::text[],
  app_version text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Fast topic fan-out queries (`topics @> ARRAY['announcements']`).
create index if not exists idx_push_devices_topics_gin
  on public.push_devices using gin (topics);

-- Fast platform filtering during FCM / APNs dispatch.
create index if not exists idx_push_devices_platform
  on public.push_devices (platform);

-- Ready for future per-user Auth lookups without indexing anonymous NULL rows.
create index if not exists idx_push_devices_user_id
  on public.push_devices (user_id)
  where user_id is not null;

alter table public.push_devices enable row level security;

revoke all on table public.push_devices from public, anon, authenticated;
grant all on table public.push_devices to service_role;

-- 2. Private schema holding the server-only RPC shared secret
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to service_role;

create table if not exists private.push_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table private.push_config enable row level security;

revoke all on table private.push_config from public, anon, authenticated;
grant all on table private.push_config to service_role;

-- Seed the shared secret once (replace with a strong random 32+ byte hex
-- string that matches Vercel's `PUSH_RPC_SECRET` environment variable):
--
--   insert into private.push_config (key, value)
--   values ('rpc_secret', 'REPLACE_WITH_STRONG_RANDOM_SECRET')
--   on conflict (key) do update
--     set value = excluded.value,
--         updated_at = now();

-- 3. Narrow SECURITY DEFINER RPC: register / update one device
create or replace function public.register_push_device(
  p_secret text,
  p_installation_id uuid,
  p_platform text,
  p_token text,
  p_topics text[],
  p_app_version text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_secret text;
  v_platform text;
  v_token text;
  v_topics text[];
  v_app_version text;
begin
  select value
    into v_expected_secret
    from private.push_config
   where key = 'rpc_secret';

  if v_expected_secret is null
     or length(trim(v_expected_secret)) = 0
     or p_secret is null
     or p_secret <> v_expected_secret then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_installation_id is null then
    raise exception 'installation_id is required' using errcode = '22023';
  end if;

  v_platform := lower(trim(coalesce(p_platform, '')));
  if v_platform not in ('ios', 'android') then
    raise exception 'invalid platform' using errcode = '22023';
  end if;

  v_token := trim(coalesce(p_token, ''));
  if char_length(v_token) = 0 or char_length(v_token) > 512 then
    raise exception 'invalid push token' using errcode = '22023';
  end if;

  -- Strictly allowlist broadcast topics inside Postgres as defense-in-depth.
  select coalesce(array_agg(distinct t order by t), '{}'::text[])
    into v_topics
    from unnest(coalesce(p_topics, '{}'::text[])) as raw(val)
    cross join lateral (select lower(trim(coalesce(raw.val, ''))) as t) norm
   where norm.t in ('announcements');

  v_app_version := nullif(left(trim(coalesce(p_app_version, '')), 32), '');

  -- If the OS reissued the same push token after an app reinstall (new
  -- installation_id), clear the orphaned row so unique(token) never collides.
  delete from public.push_devices
   where token = v_token
     and installation_id <> p_installation_id;

  insert into public.push_devices (
    installation_id,
    platform,
    token,
    topics,
    app_version,
    updated_at
  )
  values (
    p_installation_id,
    v_platform,
    v_token,
    v_topics,
    v_app_version,
    now()
  )
  on conflict (installation_id) do update
    set platform = excluded.platform,
        token = excluded.token,
        topics = excluded.topics,
        app_version = excluded.app_version,
        updated_at = now();
end;
$$;

revoke all on function public.register_push_device(text, uuid, text, text, text[], text) from public;
grant execute on function public.register_push_device(text, uuid, text, text, text[], text) to anon, authenticated;

-- 4. Narrow SECURITY DEFINER RPC: unregister one device
create or replace function public.unregister_push_device(
  p_secret text,
  p_installation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_secret text;
begin
  select value
    into v_expected_secret
    from private.push_config
   where key = 'rpc_secret';

  if v_expected_secret is null
     or length(trim(v_expected_secret)) = 0
     or p_secret is null
     or p_secret <> v_expected_secret then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  if p_installation_id is null then
    raise exception 'installation_id is required' using errcode = '22023';
  end if;

  delete from public.push_devices
   where installation_id = p_installation_id;
end;
$$;

revoke all on function public.unregister_push_device(text, uuid) from public;
grant execute on function public.unregister_push_device(text, uuid) to anon, authenticated;
