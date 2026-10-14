-- The Watcher — Watch together: swipe on titles with a friend, match on one.
-- Run AFTER the earlier files. Additive and safe to re-run.
--
-- A host starts a session (movie or show, optional genre) and gets a 6-letter
-- code; a friend joins with it. Both swipe through the same deck; a title
-- both of them like is a match. Only the two people in a session can see it.

create table if not exists public.match_sessions (
  id         uuid primary key default gen_random_uuid(),
  code       text not null unique,
  host_id    uuid not null references auth.users(id) on delete cascade,
  guest_id   uuid references auth.users(id) on delete cascade,
  kind       text not null check (kind in ('movie','show')),
  genre_id   integer,
  genre_name text,
  seed       integer not null default (floor(random() * 1000000))::int,
  status     text not null default 'waiting' check (status in ('waiting','active','closed')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index if not exists match_sessions_host_idx on public.match_sessions (host_id, created_at desc);
create index if not exists match_sessions_guest_idx on public.match_sessions (guest_id, created_at desc);

create table if not exists public.match_swipes (
  session_id uuid not null references public.match_sessions(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  item_id    text not null,
  liked      boolean not null,
  title      text,
  poster     text,
  created_at timestamptz not null default now(),
  primary key (session_id, user_id, item_id)
);
create index if not exists match_swipes_item_idx on public.match_swipes (session_id, item_id) where liked;

create or replace function public.in_match_session(sid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.match_sessions s where s.id = sid and auth.uid() in (s.host_id, s.guest_id))
$$;
revoke execute on function public.in_match_session(uuid) from public, anon;
grant execute on function public.in_match_session(uuid) to authenticated;

alter table public.match_sessions enable row level security;
alter table public.match_swipes   enable row level security;
revoke all on public.match_sessions, public.match_swipes from public, anon, authenticated;
grant select on public.match_sessions to authenticated;
grant update (status) on public.match_sessions to authenticated;
grant select, insert, update (liked) on public.match_swipes to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where tablename='match_sessions' and policyname='match_sessions_select') then
    execute 'create policy "match_sessions_select" on public.match_sessions for select to authenticated
             using (auth.uid() in (host_id, guest_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='match_sessions' and policyname='match_sessions_close') then
    execute 'create policy "match_sessions_close" on public.match_sessions for update to authenticated
             using (auth.uid() in (host_id, guest_id)) with check (auth.uid() in (host_id, guest_id) and status = ''closed'')';
  end if;
  if not exists (select 1 from pg_policies where tablename='match_swipes' and policyname='match_swipes_select') then
    execute 'create policy "match_swipes_select" on public.match_swipes for select to authenticated
             using (public.in_match_session(session_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='match_swipes' and policyname='match_swipes_insert') then
    execute 'create policy "match_swipes_insert" on public.match_swipes for insert to authenticated
             with check (user_id = auth.uid() and public.in_match_session(session_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='match_swipes' and policyname='match_swipes_update') then
    execute 'create policy "match_swipes_update" on public.match_swipes for update to authenticated
             using (user_id = auth.uid()) with check (user_id = auth.uid())';
  end if;
end $$;

-- Start a session; returns its id and code. Codes avoid look-alike letters.
create or replace function public.create_match_session(p_kind text, p_genre_id integer default null, p_genre_name text default null)
returns table (id uuid, code text) language plpgsql security definer set search_path = public as $$
declare c text; new_id uuid; alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; i int; tries int := 0;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if (select count(*) from public.match_sessions s where s.host_id = auth.uid() and s.created_at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_sessions';
  end if;
  loop
    c := '';
    for i in 1..6 loop c := c || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1); end loop;
    exit when not exists (select 1 from public.match_sessions s where s.code = c);
    tries := tries + 1;
    if tries > 20 then raise exception 'code_exhausted'; end if;
  end loop;
  insert into public.match_sessions (code, host_id, kind, genre_id, genre_name)
    values (c, auth.uid(), p_kind, p_genre_id, p_genre_name) returning match_sessions.id into new_id;
  return query select new_id, c;
end $$;

-- Join with a code. Returns the session id.
create or replace function public.join_match_session(p_code text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.match_sessions;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select * into s from public.match_sessions where code = upper(trim(p_code));
  if s.id is null or s.status = 'closed' or s.expires_at < now() then raise exception 'code_not_found'; end if;
  if s.host_id = auth.uid() or s.guest_id = auth.uid() then return s.id; end if;
  if s.guest_id is not null then raise exception 'session_full'; end if;
  update public.match_sessions set guest_id = auth.uid(), status = 'active' where match_sessions.id = s.id;
  return s.id;
end $$;

revoke execute on function public.create_match_session(text, integer, text) from public, anon;
revoke execute on function public.join_match_session(text) from public, anon;
grant execute on function public.create_match_session(text, integer, text) to authenticated;
grant execute on function public.join_match_session(text) to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'match_swipes') then
      execute 'alter publication supabase_realtime add table public.match_swipes';
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'match_sessions') then
      execute 'alter publication supabase_realtime add table public.match_sessions';
    end if;
  end if;
end $$;
