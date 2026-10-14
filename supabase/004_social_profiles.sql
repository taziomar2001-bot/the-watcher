-- The Watcher — Wave 2: real public profiles, leaderboard and follow lists.
-- Run AFTER 002 and 003. Additive and safe to re-run: no DROP of tables or
-- data, and public.library (your private library) is never touched.

-- A viewer may see a profile's protected content when they ARE that user, the
-- profile is public, or they are an accepted follower. Security definer so the
-- follows policy below can use it without recursing into its own RLS.
create or replace function public.can_view_profile(target uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() = target
      or exists (select 1 from public.profiles p where p.id = target and p.visibility = 'public')
      or exists (select 1 from public.follows f
                 where f.following_id = target and f.follower_id = auth.uid() and f.status = 'accepted');
$$;
revoke execute on function public.can_view_profile(uuid) from public, anon;
grant execute on function public.can_view_profile(uuid) to authenticated;

-- Follower / following lists: accepted edges are visible when either side's
-- profile is visible to the viewer. Pending requests stay private to the two
-- people involved (existing follows_select_own policy).
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='follows' and policyname='follows_select_visible') then
    execute 'create policy "follows_select_visible" on public.follows for select to authenticated
             using (status = ''accepted'' and (public.can_view_profile(follower_id) or public.can_view_profile(following_id)))';
  end if;
end $$;

-- Richer stats for profile dashboards and the leaderboard.
alter table public.profile_stats add column if not exists shows_followed  integer not null default 0;
alter table public.profile_stats add column if not exists movies_followed integer not null default 0;
alter table public.profile_stats add column if not exists tv_minutes      bigint  not null default 0;
alter table public.profile_stats add column if not exists movie_minutes   bigint  not null default 0;

-- What a user chooses to show on their profile: favorites and PUBLIC lists
-- only (titles + poster paths). Written by the owner's app; private lists and
-- the rest of the library never leave the private library row.
create table if not exists public.profile_showcase (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  favorites  jsonb not null default '[]'::jsonb,
  lists      jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.profile_showcase enable row level security;
revoke all on public.profile_showcase from public, anon;
grant select, insert, update on public.profile_showcase to authenticated;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'profile_showcase_set_updated_at') then
    execute 'create trigger profile_showcase_set_updated_at before update on public.profile_showcase
             for each row execute function public.set_updated_at()';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_showcase' and policyname='profile_showcase_select_visible') then
    execute 'create policy "profile_showcase_select_visible" on public.profile_showcase for select to authenticated
             using (public.can_view_profile(user_id))';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_showcase' and policyname='profile_showcase_insert_own') then
    execute 'create policy "profile_showcase_insert_own" on public.profile_showcase for insert to authenticated
             with check (auth.uid() = user_id)';
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='profile_showcase' and policyname='profile_showcase_update_own') then
    execute 'create policy "profile_showcase_update_own" on public.profile_showcase for update to authenticated
             using (auth.uid() = user_id) with check (auth.uid() = user_id)';
  end if;
end $$;

-- Verify:
--   select user_id, shows_followed, movies_followed, tv_minutes, movie_minutes from public.profile_stats;
--   select user_id, jsonb_array_length(favorites), jsonb_array_length(lists) from public.profile_showcase;
