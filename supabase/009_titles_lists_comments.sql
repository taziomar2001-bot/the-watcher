-- The Watcher — community titles, community lists, title comments, and
-- Watch together filters. Run AFTER 001–008. Additive and safe to re-run:
-- it only creates new tables/columns/functions and copies (never moves or
-- deletes) the title each existing community was already linked to.

-- =========================================================== community titles
-- A community can be about several shows/movies. Owners and admins can add
-- titles; nobody can remove or swap one (add-only, by design).
create table if not exists public.community_titles (
  community_id uuid not null references public.communities(id) on delete cascade,
  ref        text not null check (ref ~ '^(show|movie):[0-9A-Za-z_-]{1,40}$'),
  title      text not null check (char_length(title) between 1 and 300),
  poster     text check (poster is null or char_length(poster) <= 500),
  year       integer,
  added_by   uuid references auth.users(id) on delete set null,
  added_at   timestamptz not null default now(),
  primary key (community_id, ref)
);
create index if not exists community_titles_ref_idx on public.community_titles (ref);

-- Copy each community's existing single linked title (communities.topic_*).
-- The original columns are left untouched.
insert into public.community_titles (community_id, ref, title, poster, added_by, added_at)
select c.id, c.topic_type || ':' || c.topic_id, coalesce(nullif(trim(c.topic_title), ''), 'Untitled'), c.topic_poster, c.created_by, c.created_at
from public.communities c
where c.topic_type in ('show', 'movie') and c.topic_id ~ '^[0-9A-Za-z_-]{1,40}$'
on conflict do nothing;

alter table public.community_titles enable row level security;
revoke all on public.community_titles from public, anon, authenticated;
grant select on public.community_titles to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='community_titles' and policyname='community_titles_select') then
    -- Like a community's name, what it's about is visible to every signed-in user.
    execute 'create policy "community_titles_select" on public.community_titles for select to authenticated using (true)';
  end if;
end $$;

-- Add titles (owners/admins). p_items: [{ref,title,poster,year}]. Returns how many were new.
create or replace function public.add_community_titles(cid uuid, p_items jsonb)
returns integer language plpgsql security definer set search_path = public as $$
declare it jsonb; n integer := 0; total integer; r text;
begin
  if not public.is_community_mod(cid) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'bad_input'; end if;
  for it in select * from jsonb_array_elements(p_items) loop
    select count(*) into total from public.community_titles where community_id = cid;
    exit when total >= 25;
    r := it->>'ref';
    insert into public.community_titles (community_id, ref, title, poster, year, added_by)
      values (cid, r, left(coalesce(nullif(trim(it->>'title'), ''), 'Untitled'), 300), left(it->>'poster', 500),
              nullif(it->>'year', '')::integer, auth.uid())
      on conflict do nothing;
    if found then n := n + 1; end if;
  end loop;
  -- Keep the community's primary title (used for its picture) when it has none.
  update public.communities c set topic_type = split_part(t.ref, ':', 1), topic_id = split_part(t.ref, ':', 2),
         topic_title = t.title, topic_poster = t.poster
  from (select * from public.community_titles where community_id = cid order by added_at limit 1) t
  where c.id = cid and c.topic_id is null;
  return n;
end $$;
revoke execute on function public.add_community_titles(uuid, jsonb) from public, anon;
grant execute on function public.add_community_titles(uuid, jsonb) to authenticated;

-- ============================================================ community lists
-- A snapshot of a member's list shown in a community. The list itself stays in
-- its owner's library; the owner's app refreshes the snapshot when it changes.
-- Owners/admins can link any of their lists ("official"); members can link
-- their ranked lists.
create table if not exists public.community_lists (
  community_id uuid not null references public.communities(id) on delete cascade,
  owner_id   uuid not null references auth.users(id) on delete cascade,
  list_id    text not null check (char_length(list_id) between 1 and 80),
  official   boolean not null default false,
  name       text not null check (char_length(name) between 1 and 120),
  kind       text not null default 'mixed' check (kind in ('mixed','shows','seasons','episodes','movies')),
  ranked     boolean not null default false,
  cover      text check (cover is null or octet_length(cover) <= 400000),
  items      jsonb not null default '[]'::jsonb
             check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 500 and octet_length(items::text) <= 400000),
  linked_at  timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (community_id, owner_id, list_id)
);
create index if not exists community_lists_owner_idx on public.community_lists (owner_id);

alter table public.community_lists enable row level security;
revoke all on public.community_lists from public, anon, authenticated;
grant select on public.community_lists to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='community_lists' and policyname='community_lists_select') then
    -- Readable like the community's posts; only lists of current members show.
    execute 'create policy "community_lists_select" on public.community_lists for select to authenticated
             using (public.can_read_community(community_id) and exists (
               select 1 from public.community_members m
               where m.community_id = community_lists.community_id and m.user_id = community_lists.owner_id and m.status = ''active''))';
  end if;
end $$;

create or replace function public.link_community_list(
  cid uuid, p_list_id text, p_name text, p_kind text, p_ranked boolean, p_cover text, p_items jsonb
) returns boolean language plpgsql security definer set search_path = public as $$
declare mod boolean;
begin
  if public.community_role(cid) is null then raise exception 'not_a_member' using errcode = '42501'; end if;
  mod := public.is_community_mod(cid);
  if not mod and not coalesce(p_ranked, false) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if not exists (select 1 from public.community_lists where community_id = cid and owner_id = auth.uid() and list_id = p_list_id)
     and (select count(*) from public.community_lists where community_id = cid and owner_id = auth.uid()) >= 20 then
    raise exception 'too_many_lists';
  end if;
  insert into public.community_lists (community_id, owner_id, list_id, official, name, kind, ranked, cover, items)
    values (cid, auth.uid(), p_list_id, mod, left(trim(p_name), 120), coalesce(p_kind, 'mixed'), coalesce(p_ranked, false), p_cover, coalesce(p_items, '[]'::jsonb))
  on conflict (community_id, owner_id, list_id) do update
    set official = excluded.official, name = excluded.name, kind = excluded.kind, ranked = excluded.ranked,
        cover = excluded.cover, items = excluded.items, updated_at = now();
  return mod;
end $$;

-- Unlink: your own list, or (owners/admins) anyone's list from their community.
-- Only the community's copy goes; the list stays in its owner's library.
create or replace function public.unlink_community_list(cid uuid, p_list_id text, p_owner uuid default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_owner is not null and p_owner <> auth.uid() and not public.is_community_mod(cid) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  delete from public.community_lists where community_id = cid and list_id = p_list_id and owner_id = coalesce(p_owner, auth.uid());
end $$;
revoke execute on function public.link_community_list(uuid, text, text, text, boolean, text, jsonb) from public, anon;
revoke execute on function public.unlink_community_list(uuid, text, uuid) from public, anon;
grant execute on function public.link_community_list(uuid, text, text, text, boolean, text, jsonb) to authenticated;
grant execute on function public.unlink_community_list(uuid, text, uuid) to authenticated;

-- ============================================================= title comments
-- Comments on shows, movies, seasons and episodes. Every signed-in user can
-- read and post; spoilers are flagged by the author. One level of replies.
create table if not exists public.title_comments (
  id          uuid primary key default gen_random_uuid(),
  target      text not null check (char_length(target) <= 80 and target ~ '^(show:[0-9A-Za-z_-]+|movie:[0-9A-Za-z_-]+|season:[0-9A-Za-z_-]+:[0-9]+|episode:[0-9A-Za-z_-]+:[0-9]+:[0-9]+)$'),
  author_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  parent_id   uuid references public.title_comments(id) on delete cascade,
  body        text not null default '',
  spoiler     boolean not null default false,
  deleted     boolean not null default false,
  like_count  integer not null default 0,
  reply_count integer not null default 0,
  created_at  timestamptz not null default now(),
  check (deleted or char_length(btrim(body)) between 1 and 2000)
);
create index if not exists title_comments_target_idx on public.title_comments (target, created_at desc) where parent_id is null;
create index if not exists title_comments_parent_idx on public.title_comments (parent_id, created_at);
create index if not exists title_comments_author_idx on public.title_comments (author_id, created_at desc);

create table if not exists public.title_comment_likes (
  comment_id uuid not null references public.title_comments(id) on delete cascade,
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists title_comment_likes_user_idx on public.title_comment_likes (user_id);

alter table public.title_comments enable row level security;
alter table public.title_comment_likes enable row level security;
revoke all on public.title_comments, public.title_comment_likes from public, anon, authenticated;
grant select on public.title_comments to authenticated;
grant insert (target, parent_id, body, spoiler) on public.title_comments to authenticated;
grant select, insert, delete on public.title_comment_likes to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename='title_comments' and policyname='title_comments_select') then
    execute 'create policy "title_comments_select" on public.title_comments for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='title_comments' and policyname='title_comments_insert') then
    execute 'create policy "title_comments_insert" on public.title_comments for insert to authenticated with check (author_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where tablename='title_comment_likes' and policyname='title_comment_likes_select') then
    execute 'create policy "title_comment_likes_select" on public.title_comment_likes for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='title_comment_likes' and policyname='title_comment_likes_insert') then
    execute 'create policy "title_comment_likes_insert" on public.title_comment_likes for insert to authenticated with check (user_id = auth.uid())';
  end if;
  if not exists (select 1 from pg_policies where tablename='title_comment_likes' and policyname='title_comment_likes_delete') then
    execute 'create policy "title_comment_likes_delete" on public.title_comment_likes for delete to authenticated using (user_id = auth.uid())';
  end if;
end $$;

-- New comments: author is always the caller; replies attach to the top-level
-- comment of the same title; a gentle rate limit stops floods.
create or replace function public.title_comments_before_insert()
returns trigger language plpgsql security definer set search_path = public as $$
declare p public.title_comments;
begin
  new.author_id := auth.uid();
  new.like_count := 0; new.reply_count := 0; new.deleted := false; new.created_at := now();
  new.body := btrim(new.body);
  if (select count(*) from public.title_comments where author_id = new.author_id and created_at > now() - interval '10 minutes') >= 20 then
    raise exception 'slow_down';
  end if;
  if new.parent_id is not null then
    select * into p from public.title_comments where id = new.parent_id;
    if p.id is null or p.target <> new.target then raise exception 'bad_parent'; end if;
    if p.parent_id is not null then new.parent_id := p.parent_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists title_comments_before_insert on public.title_comments;
create trigger title_comments_before_insert before insert on public.title_comments
  for each row execute function public.title_comments_before_insert();

create or replace function public.title_comments_count_replies()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' and new.parent_id is not null then
    update public.title_comments set reply_count = reply_count + 1 where id = new.parent_id;
  elsif tg_op = 'DELETE' and old.parent_id is not null then
    update public.title_comments set reply_count = greatest(0, reply_count - 1) where id = old.parent_id;
  end if;
  return null;
end $$;
drop trigger if exists title_comments_count_replies on public.title_comments;
create trigger title_comments_count_replies after insert or delete on public.title_comments
  for each row execute function public.title_comments_count_replies();

create or replace function public.title_comment_likes_count()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    update public.title_comments set like_count = like_count + 1 where id = new.comment_id;
  else
    update public.title_comments set like_count = greatest(0, like_count - 1) where id = old.comment_id;
  end if;
  return null;
end $$;
drop trigger if exists title_comment_likes_count on public.title_comment_likes;
create trigger title_comment_likes_count after insert or delete on public.title_comment_likes
  for each row execute function public.title_comment_likes_count();

-- Delete your own comment. If people replied to it, it's blanked to
-- "deleted" instead so their replies stay.
create or replace function public.delete_title_comment(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.title_comments;
begin
  select * into c from public.title_comments where id = p_id;
  if c.id is null then return; end if;
  if c.author_id <> auth.uid() then raise exception 'not_allowed' using errcode = '42501'; end if;
  if c.reply_count > 0 then
    update public.title_comments set deleted = true, body = '', spoiler = false where id = p_id;
  else
    delete from public.title_comments where id = p_id;
  end if;
end $$;
revoke execute on function public.delete_title_comment(uuid) from public, anon;
grant execute on function public.delete_title_comment(uuid) to authenticated;

-- ===================================================== Watch together filters
alter table public.match_sessions add column if not exists source  text not null default 'anything';
alter table public.match_sessions add column if not exists min_len integer;
alter table public.match_sessions add column if not exists max_len integer;
-- For "from my watchlist" sessions: the host's chosen titles, shared with the
-- guest on purpose ([{id,title,poster,year}]).
alter table public.match_sessions add column if not exists deck jsonb;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'match_sessions_source_check') then
    alter table public.match_sessions add constraint match_sessions_source_check
      check (source in ('anything','watchlist','not_started'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'match_sessions_deck_check') then
    alter table public.match_sessions add constraint match_sessions_deck_check
      check (deck is null or (jsonb_typeof(deck) = 'array' and jsonb_array_length(deck) <= 600 and octet_length(deck::text) <= 300000));
  end if;
end $$;

create or replace function public.create_match_session_v2(
  p_kind text, p_genre_id integer default null, p_genre_name text default null,
  p_min_len integer default null, p_max_len integer default null,
  p_source text default 'anything', p_deck jsonb default null
) returns table (id uuid, code text) language plpgsql security definer set search_path = public as $$
declare r record;
begin
  select * into r from public.create_match_session(p_kind, p_genre_id, p_genre_name);
  update public.match_sessions s
    set min_len = p_min_len, max_len = p_max_len, source = coalesce(p_source, 'anything'),
        deck = case when coalesce(p_source, 'anything') = 'anything' then null else p_deck end
    where s.id = r.id;
  return query select r.id, r.code;
end $$;
revoke execute on function public.create_match_session_v2(text, integer, text, integer, integer, text, jsonb) from public, anon;
grant execute on function public.create_match_session_v2(text, integer, text, integer, integer, text, jsonb) to authenticated;
