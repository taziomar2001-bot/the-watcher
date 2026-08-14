-- ============================================================================
-- The Watcher — cloud data ownership hardening
-- Run in Supabase → SQL Editor → New query → paste → Run.
-- Every statement is IDEMPOTENT, ADDITIVE and NON-DESTRUCTIVE. Safe to re-run.
-- It never drops a table or deletes a row. `on conflict do nothing` protects
-- any data you already have.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared helper: keep updated_at server-managed (never trusted from client)
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. LIBRARY — one row per user, holding that user's whole app state as JSON.
--    (follows, watched, ratings, episode ratings, lists + contents, stopped,
--     settings, timestamps, migration flags — everything user-owned.)
-- ---------------------------------------------------------------------------
create table if not exists public.library (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Add the timestamp columns if the table already existed without them.
alter table public.library add column if not exists created_at timestamptz not null default now();
alter table public.library add column if not exists updated_at timestamptz not null default now();

comment on table public.library is
  'Per-user application state as a JSON document (one row per authenticated user).';

drop trigger if exists library_set_updated_at on public.library;
create trigger library_set_updated_at
  before update on public.library
  for each row execute function public.set_updated_at();

-- Row Level Security: each user may only touch their own row. The WITH CHECK on
-- insert/update makes it impossible to write a row under someone else's UUID.
alter table public.library enable row level security;

drop policy if exists "Users manage their own library" on public.library;
drop policy if exists "library_select_own" on public.library;
drop policy if exists "library_insert_own" on public.library;
drop policy if exists "library_update_own" on public.library;
drop policy if exists "library_delete_own" on public.library;

create policy "library_select_own" on public.library
  for select to authenticated using (auth.uid() = user_id);
create policy "library_insert_own" on public.library
  for insert to authenticated with check (auth.uid() = user_id);
create policy "library_update_own" on public.library
  for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "library_delete_own" on public.library
  for delete to authenticated using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- 2. PROFILES — 1:1 with auth.users, application-level account metadata only.
--    (Never store auth secrets here — Supabase Auth owns those.)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  username     text,
  display_name text,
  avatar       text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table public.profiles is
  'Application-level profile metadata, one row per user.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;

create policy "profiles_select_own" on public.profiles
  for select to authenticated using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert to authenticated with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- ---------------------------------------------------------------------------
-- 3. AUTO-PROVISION new accounts. When a user signs up, automatically create
--    their profile row AND an empty library row — no manual step per user, and
--    every future account starts with its own clean state through the same
--    schema + RLS. SECURITY DEFINER so it can write regardless of the session.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  insert into public.library (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- 4. BACKFILL existing accounts (your current one). Only creates the PROFILE
--    row for users that predate this migration. Uses auth.users directly, so you
--    do NOT need to paste your UUID anywhere.
--
--    NOTE: we deliberately do NOT insert a library row here. If your data were
--    ever local-only, a blank cloud row could be pulled down on next sign-in and
--    overwrite it. The app safely creates/updates your library row itself on the
--    next "Back up now" (or automatically on your next change), preserving data.
-- ---------------------------------------------------------------------------
insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

-- Done. Verify with:
--   select * from public.profiles;
--   select user_id, created_at, updated_at from public.library;  -- appears after your first backup
