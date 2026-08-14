-- ============================================================================
-- The Watcher — cloud data ownership hardening
-- Run in Supabase → SQL Editor → New query → paste → Run.
--
-- This version contains NO destructive statements (no DROP / DELETE / TRUNCATE),
-- so Supabase will NOT show a "destructive operation" warning. Every step is
-- guarded so it is safe to run and safe to re-run. It only ADDS tables,
-- columns, functions, triggers and policies, and never touches your data.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Shared helper: keep updated_at server-managed.
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
-- ---------------------------------------------------------------------------
create table if not exists public.library (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.library add column if not exists created_at timestamptz not null default now();
alter table public.library add column if not exists updated_at timestamptz not null default now();
comment on table public.library is
  'Per-user application state as a JSON document (one row per authenticated user).';

alter table public.library enable row level security;

-- updated_at trigger (created only if missing).
do $$
begin
  if not exists (
    select 1 from pg_trigger where tgname = 'library_set_updated_at'
  ) then
    execute 'create trigger library_set_updated_at
             before update on public.library
             for each row execute function public.set_updated_at()';
  end if;
end $$;

-- Per-operation owner-only policies (each created only if missing). The WITH
-- CHECK on insert/update makes it impossible to write under another user''s UUID.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='library' and policyname='library_select_own') then
    execute 'create policy "library_select_own" on public.library for select to authenticated using (auth.uid() = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='library' and policyname='library_insert_own') then
    execute 'create policy "library_insert_own" on public.library for insert to authenticated with check (auth.uid() = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='library' and policyname='library_update_own') then
    execute 'create policy "library_update_own" on public.library for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='library' and policyname='library_delete_own') then
    execute 'create policy "library_delete_own" on public.library for delete to authenticated using (auth.uid() = user_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2. PROFILES — 1:1 with auth.users, application-level account metadata only.
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

alter table public.profiles enable row level security;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profiles_set_updated_at') then
    execute 'create trigger profiles_set_updated_at
             before update on public.profiles
             for each row execute function public.set_updated_at()';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_own') then
    execute 'create policy "profiles_select_own" on public.profiles for select to authenticated using (auth.uid() = id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_insert_own') then
    execute 'create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (auth.uid() = id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_update_own') then
    execute 'create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 3. AUTO-PROVISION new accounts (profile + empty library) on signup.
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

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'on_auth_user_created') then
    execute 'create trigger on_auth_user_created
             after insert on auth.users
             for each row execute function public.handle_new_user()';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 4. BACKFILL only the PROFILE row for your existing account. (We do NOT create
--    a library row here — the app creates/updates it on your next backup, which
--    avoids any chance of a blank row overwriting local data.)
-- ---------------------------------------------------------------------------
insert into public.profiles (id)
  select id from auth.users
  on conflict (id) do nothing;

-- Verify:
--   select * from public.profiles;
--   select user_id, created_at, updated_at from public.library;  -- appears after your first backup
