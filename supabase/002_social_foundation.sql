-- ============================================================================
-- The Watcher — Wave 1: Social Foundation (profiles, stats, follows)
--
-- Run AFTER migration.sql, in Supabase → SQL Editor → New query → paste → Run.
--
-- This migration is ADDITIVE and NON-DESTRUCTIVE: it only CREATES/ALTERS (adds
-- columns, tables, policies, functions, triggers). It contains no DROP / DELETE
-- / TRUNCATE, so Supabase shows no "destructive operation" warning, and it is
-- safe to run and re-run. It never touches public.library — every user's
-- private tracking data stays exactly where it is, owner-only.
--
-- Model:
--   public.profiles       — PUBLIC identity (readable by any signed-in user):
--                           username, display name, avatar, bio, visibility,
--                           follower/following counts.
--   public.profile_stats  — PROTECTED aggregate stats, readable only by the
--                           owner, anyone if the profile is public, or an
--                           ACCEPTED follower (this is the canonical
--                           "protected content" policy we reuse later).
--   public.follows        — follow graph with pending/accepted status, so
--                           private accounts gate content behind approval.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A. PROFILES — extend to a public social identity.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists bio             text;
alter table public.profiles add column if not exists visibility      text    not null default 'public';
alter table public.profiles add column if not exists follower_count  integer not null default 0;
alter table public.profiles add column if not exists following_count integer not null default 0;

-- Only 'public' or 'private' are valid (guarded so re-runs don't error).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_visibility_chk') then
    alter table public.profiles
      add constraint profiles_visibility_chk check (visibility in ('public','private'));
  end if;
end $$;

-- Case-insensitive unique usernames (nulls allowed until claimed).
create unique index if not exists profiles_username_unique
  on public.profiles (lower(username)) where username is not null;

-- Make every profile readable by any signed-in user (identity is public so
-- people can be found and followed). Added as a SEPARATE permissive policy, so
-- the old owner-only select policy is simply OR'd and no DROP is needed.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profiles' and policyname='profiles_select_public') then
    execute 'create policy "profiles_select_public" on public.profiles for select to authenticated using (true)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- B. FOLLOWS — the follow graph (pending/accepted for private accounts).
-- ---------------------------------------------------------------------------
create table if not exists public.follows (
  follower_id  uuid not null references auth.users(id) on delete cascade,
  following_id uuid not null references auth.users(id) on delete cascade,
  status       text not null default 'accepted',
  created_at   timestamptz not null default now(),
  primary key (follower_id, following_id),
  constraint follows_no_self check (follower_id <> following_id),
  constraint follows_status_chk check (status in ('pending','accepted'))
);
create index if not exists follows_following_idx on public.follows (following_id, status);
create index if not exists follows_follower_idx  on public.follows (follower_id, status);

alter table public.follows enable row level security;
grant select, insert, update, delete on public.follows to authenticated;

-- Status is decided by the TARGET's visibility, never trusted from the client:
-- following a public account is instantly accepted; a private account is pending.
create or replace function public.follows_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.follower_id = new.following_id then
    raise exception 'cannot_follow_self';
  end if;
  if exists (select 1 from public.profiles p where p.id = new.following_id and p.visibility = 'private') then
    new.status := 'pending';
  else
    new.status := 'accepted';
  end if;
  new.created_at := now();
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'follows_set_status') then
    execute 'create trigger follows_set_status before insert on public.follows
             for each row execute function public.follows_before_insert()';
  end if;
end $$;

-- Keep follower/following counts on profiles correct for every change.
create or replace function public.follows_sync_counts()
returns trigger language plpgsql security definer set search_path = public as $$
declare uids uuid[];
begin
  uids := array_remove(array[
    case when tg_op in ('INSERT','UPDATE') then new.follower_id end,
    case when tg_op in ('INSERT','UPDATE') then new.following_id end,
    case when tg_op in ('DELETE','UPDATE') then old.follower_id end,
    case when tg_op in ('DELETE','UPDATE') then old.following_id end
  ], null);
  update public.profiles p set
    follower_count  = (select count(*) from public.follows f where f.following_id = p.id and f.status = 'accepted'),
    following_count = (select count(*) from public.follows f where f.follower_id  = p.id and f.status = 'accepted')
  where p.id = any(uids);
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'follows_counts') then
    execute 'create trigger follows_counts after insert or update or delete on public.follows
             for each row execute function public.follows_sync_counts()';
  end if;
end $$;

-- RLS: you see follow rows you are part of; you create only your own follows;
-- the target accepts a pending request; either side can remove the edge.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='follows' and policyname='follows_select_own') then
    execute 'create policy "follows_select_own" on public.follows for select to authenticated
             using (auth.uid() = follower_id or auth.uid() = following_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='follows' and policyname='follows_insert_self') then
    execute 'create policy "follows_insert_self" on public.follows for insert to authenticated
             with check (auth.uid() = follower_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='follows' and policyname='follows_accept') then
    execute 'create policy "follows_accept" on public.follows for update to authenticated
             using (auth.uid() = following_id) with check (auth.uid() = following_id and status = ''accepted'')';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='follows' and policyname='follows_delete_either') then
    execute 'create policy "follows_delete_either" on public.follows for delete to authenticated
             using (auth.uid() = follower_id or auth.uid() = following_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- C. PROFILE_STATS — protected aggregate stats for the leaderboard & profiles.
--    Written by the owner; read per the canonical public/follower gate.
-- ---------------------------------------------------------------------------
create table if not exists public.profile_stats (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  episodes_watched integer not null default 0,
  shows_watched    integer not null default 0,
  shows_finished   integer not null default 0,
  movies_watched   integer not null default 0,
  minutes_watched  bigint  not null default 0,
  updated_at       timestamptz not null default now()
);
alter table public.profile_stats enable row level security;
grant select, insert, update, delete on public.profile_stats to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profile_stats_set_updated_at') then
    execute 'create trigger profile_stats_set_updated_at before update on public.profile_stats
             for each row execute function public.set_updated_at()';
  end if;
  -- Read if: owner, OR profile is public, OR you are an accepted follower.
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_stats' and policyname='profile_stats_select_visible') then
    execute 'create policy "profile_stats_select_visible" on public.profile_stats for select to authenticated using (
               auth.uid() = user_id
               or exists (select 1 from public.profiles p where p.id = profile_stats.user_id and p.visibility = ''public'')
               or exists (select 1 from public.follows f where f.following_id = profile_stats.user_id and f.follower_id = auth.uid() and f.status = ''accepted'')
             )';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_stats' and policyname='profile_stats_write_own') then
    execute 'create policy "profile_stats_write_own" on public.profile_stats for insert to authenticated with check (auth.uid() = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_stats' and policyname='profile_stats_update_own') then
    execute 'create policy "profile_stats_update_own" on public.profile_stats for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- D. USERNAME claiming — validated, case-insensitive, friendly errors.
-- ---------------------------------------------------------------------------
create or replace function public.claim_username(uname text)
returns text language plpgsql security definer set search_path = public as $$
declare clean text;
begin
  clean := lower(trim(uname));
  if clean !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username';
  end if;
  if exists (select 1 from public.profiles where lower(username) = clean and id <> auth.uid()) then
    raise exception 'username_taken';
  end if;
  update public.profiles set username = clean, updated_at = now() where id = auth.uid();
  return clean;
end $$;
grant execute on function public.claim_username(text) to authenticated;

-- ---------------------------------------------------------------------------
-- E. Provision new accounts with display name + visibility from signup data.
--    (Username is claimed explicitly via claim_username so signup never fails
--    on a taken name.) Library + profile rows still auto-created.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name, visibility)
    values (
      new.id,
      nullif(new.raw_user_meta_data->>'display_name',''),
      coalesce(nullif(new.raw_user_meta_data->>'visibility',''),'public')
    )
    on conflict (id) do nothing;
  insert into public.library (user_id) values (new.id) on conflict (user_id) do nothing;
  insert into public.profile_stats (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end $$;

-- Backfill: ensure every existing account has a stats row (counts default 0).
insert into public.profile_stats (user_id)
  select id from auth.users on conflict (user_id) do nothing;

-- Verify:
--   select id, username, display_name, visibility, follower_count, following_count from public.profiles;
--   select * from public.profile_stats;
--   select * from public.follows;
