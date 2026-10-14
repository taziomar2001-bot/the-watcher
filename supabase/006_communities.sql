-- The Watcher — Wave 5: Communities.
-- Run AFTER 002–005. Additive and safe to re-run. Never touches public.library.
--
-- Roles: owner (one per community) > admin > member. Membership changes go
-- through the RPCs below (security definer, rules enforced in the database),
-- so a modified app can't promote itself, rejoin after a ban, etc.
--   public community  → anyone can read announcements and join instantly
--   private community → listed in search, but content is members-only and
--                       joining needs an owner/admin to approve
-- Chat is members-only in both cases.

-- ---------------------------------------------------------------- tables
create table if not exists public.communities (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (char_length(name) between 3 and 60),
  description  text not null default '' check (char_length(description) <= 500),
  visibility   text not null default 'public' check (visibility in ('public','private')),
  topic_type   text check (topic_type in ('show','movie')),
  topic_id     text,
  topic_title  text,
  topic_poster text,
  created_by   uuid not null references auth.users(id) on delete cascade,
  member_count integer not null default 0,
  created_at   timestamptz not null default now()
);
create index if not exists communities_topic_idx on public.communities (topic_type, topic_id);
create index if not exists communities_name_idx on public.communities (lower(name));

create table if not exists public.community_members (
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner','admin','member')),
  status       text not null default 'active' check (status in ('active','pending','banned')),
  joined_at    timestamptz not null default now(),
  primary key (community_id, user_id)
);
create index if not exists community_members_user_idx on public.community_members (user_id, status);

create table if not exists public.community_posts (
  id           uuid primary key default gen_random_uuid(),
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 4000),
  pinned       boolean not null default false,
  created_at   timestamptz not null default now()
);
create index if not exists community_posts_idx on public.community_posts (community_id, pinned desc, created_at desc);

create table if not exists public.community_comments (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.community_posts(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists community_comments_idx on public.community_comments (post_id, created_at);

create table if not exists public.community_reactions (
  post_id      uuid not null references public.community_posts(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  emoji        text not null check (emoji in ('👍','❤️','😂','😮','🔥')),
  created_at   timestamptz not null default now(),
  primary key (post_id, user_id, emoji)
);

create table if not exists public.community_messages (
  id           bigserial primary key,
  community_id uuid not null references public.communities(id) on delete cascade,
  author_id    uuid not null references auth.users(id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 1000),
  created_at   timestamptz not null default now()
);
create index if not exists community_messages_idx on public.community_messages (community_id, id desc);

-- ---------------------------------------------------------------- helpers
-- The caller's active role in a community, or null.
create or replace function public.community_role(cid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.community_members
  where community_id = cid and user_id = auth.uid() and status = 'active'
$$;

create or replace function public.can_read_community(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.communities c where c.id = cid and c.visibility = 'public')
      or public.community_role(cid) is not null
$$;

create or replace function public.is_community_mod(cid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.community_role(cid) in ('owner','admin'), false)
$$;

revoke execute on function public.community_role(uuid) from public, anon;
revoke execute on function public.can_read_community(uuid) from public, anon;
revoke execute on function public.is_community_mod(uuid) from public, anon;
grant execute on function public.community_role(uuid) to authenticated;
grant execute on function public.can_read_community(uuid) to authenticated;
grant execute on function public.is_community_mod(uuid) to authenticated;

-- Keep member_count current.
create or replace function public.community_sync_count()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid := coalesce(new.community_id, old.community_id);
begin
  update public.communities c
    set member_count = (select count(*) from public.community_members m where m.community_id = cid and m.status = 'active')
    where c.id = cid;
  return null;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'community_members_count') then
    execute 'create trigger community_members_count after insert or update or delete on public.community_members
             for each row execute function public.community_sync_count()';
  end if;
end $$;

-- ---------------------------------------------------------------- RLS
alter table public.communities         enable row level security;
alter table public.community_members   enable row level security;
alter table public.community_posts     enable row level security;
alter table public.community_comments  enable row level security;
alter table public.community_reactions enable row level security;
alter table public.community_messages  enable row level security;

revoke all on public.communities, public.community_members, public.community_posts,
              public.community_comments, public.community_reactions, public.community_messages
  from public, anon, authenticated;
grant select on public.communities, public.community_members to authenticated;
grant update (name, description, visibility) on public.communities to authenticated;
grant select, insert, delete on public.community_posts, public.community_comments,
                                public.community_reactions, public.community_messages to authenticated;
grant update (body, pinned) on public.community_posts to authenticated;
grant usage, select on sequence public.community_messages_id_seq to authenticated;

do $$
begin
  -- communities: discoverable by every member of The Watcher; edited by mods.
  if not exists (select 1 from pg_policies where tablename='communities' and policyname='communities_select') then
    execute 'create policy "communities_select" on public.communities for select to authenticated using (true)';
  end if;
  if not exists (select 1 from pg_policies where tablename='communities' and policyname='communities_update_mod') then
    execute 'create policy "communities_update_mod" on public.communities for update to authenticated
             using (public.is_community_mod(id)) with check (public.is_community_mod(id))';
  end if;

  -- members: visible to readers of the community, and your own row always.
  if not exists (select 1 from pg_policies where tablename='community_members' and policyname='community_members_select') then
    execute 'create policy "community_members_select" on public.community_members for select to authenticated
             using (user_id = auth.uid() or (status = ''active'' and public.can_read_community(community_id))
                    or public.is_community_mod(community_id))';
  end if;

  -- announcements: readable per community visibility; written by owner/admins.
  if not exists (select 1 from pg_policies where tablename='community_posts' and policyname='community_posts_select') then
    execute 'create policy "community_posts_select" on public.community_posts for select to authenticated
             using (public.can_read_community(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_posts' and policyname='community_posts_insert') then
    execute 'create policy "community_posts_insert" on public.community_posts for insert to authenticated
             with check (author_id = auth.uid() and public.is_community_mod(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_posts' and policyname='community_posts_update') then
    execute 'create policy "community_posts_update" on public.community_posts for update to authenticated
             using (public.is_community_mod(community_id)) with check (public.is_community_mod(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_posts' and policyname='community_posts_delete') then
    execute 'create policy "community_posts_delete" on public.community_posts for delete to authenticated
             using (author_id = auth.uid() or public.is_community_mod(community_id))';
  end if;

  -- comments + reactions: members take part; authors and mods can remove.
  if not exists (select 1 from pg_policies where tablename='community_comments' and policyname='community_comments_select') then
    execute 'create policy "community_comments_select" on public.community_comments for select to authenticated
             using (public.can_read_community(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_comments' and policyname='community_comments_insert') then
    execute 'create policy "community_comments_insert" on public.community_comments for insert to authenticated
             with check (author_id = auth.uid() and public.community_role(community_id) is not null
                         and exists (select 1 from public.community_posts p where p.id = post_id and p.community_id = community_comments.community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_comments' and policyname='community_comments_delete') then
    execute 'create policy "community_comments_delete" on public.community_comments for delete to authenticated
             using (author_id = auth.uid() or public.is_community_mod(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_reactions' and policyname='community_reactions_select') then
    execute 'create policy "community_reactions_select" on public.community_reactions for select to authenticated
             using (public.can_read_community(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_reactions' and policyname='community_reactions_insert') then
    execute 'create policy "community_reactions_insert" on public.community_reactions for insert to authenticated
             with check (user_id = auth.uid() and public.community_role(community_id) is not null
                         and exists (select 1 from public.community_posts p where p.id = post_id and p.community_id = community_reactions.community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_reactions' and policyname='community_reactions_delete') then
    execute 'create policy "community_reactions_delete" on public.community_reactions for delete to authenticated
             using (user_id = auth.uid())';
  end if;

  -- chat: members only, in public and private communities alike.
  if not exists (select 1 from pg_policies where tablename='community_messages' and policyname='community_messages_select') then
    execute 'create policy "community_messages_select" on public.community_messages for select to authenticated
             using (public.community_role(community_id) is not null)';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_messages' and policyname='community_messages_insert') then
    execute 'create policy "community_messages_insert" on public.community_messages for insert to authenticated
             with check (author_id = auth.uid() and public.community_role(community_id) is not null)';
  end if;
  if not exists (select 1 from pg_policies where tablename='community_messages' and policyname='community_messages_delete') then
    execute 'create policy "community_messages_delete" on public.community_messages for delete to authenticated
             using (author_id = auth.uid() or public.is_community_mod(community_id))';
  end if;
end $$;

-- ---------------------------------------------------------------- RPCs
create or replace function public.create_community(
  p_name text, p_description text, p_visibility text,
  p_topic_type text default null, p_topic_id text default null, p_topic_title text default null, p_topic_poster text default null
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  if (select count(*) from public.community_members where user_id = auth.uid() and role = 'owner') >= 10 then
    raise exception 'too_many_communities';
  end if;
  insert into public.communities (name, description, visibility, topic_type, topic_id, topic_title, topic_poster, created_by)
    values (trim(p_name), coalesce(trim(p_description), ''), coalesce(p_visibility, 'public'),
            p_topic_type, p_topic_id, p_topic_title, p_topic_poster, auth.uid())
    returning id into new_id;
  insert into public.community_members (community_id, user_id, role, status) values (new_id, auth.uid(), 'owner', 'active');
  return new_id;
end $$;

-- Join: instant for public communities, a request for private ones. Banned
-- users can't rejoin. Returns the resulting status.
create or replace function public.join_community(cid uuid)
returns text language plpgsql security definer set search_path = public as $$
declare vis text; cur text;
begin
  if auth.uid() is null then raise exception 'not_authenticated' using errcode = '42501'; end if;
  select visibility into vis from public.communities where id = cid;
  if vis is null then raise exception 'not_found'; end if;
  select status into cur from public.community_members where community_id = cid and user_id = auth.uid();
  if cur = 'banned' then raise exception 'banned'; end if;
  if cur is not null then return cur; end if;
  insert into public.community_members (community_id, user_id, role, status)
    values (cid, auth.uid(), 'member', case when vis = 'public' then 'active' else 'pending' end);
  return case when vis = 'public' then 'active' else 'pending' end;
end $$;

-- Leave (or cancel a request). The owner must hand over ownership or delete
-- the community instead.
create or replace function public.leave_community(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.community_members where community_id = cid and user_id = auth.uid() and role = 'owner') then
    raise exception 'owner_cannot_leave';
  end if;
  delete from public.community_members where community_id = cid and user_id = auth.uid() and status <> 'banned';
end $$;

-- Moderation. Admins manage members; only the owner manages admins.
-- actions: approve, decline, remove, ban, unban, make_admin, make_member, transfer_owner
create or replace function public.moderate_member(cid uuid, target uuid, action text)
returns void language plpgsql security definer set search_path = public as $$
declare me text := public.community_role(cid); them text; them_status text;
begin
  if me is null or me not in ('owner','admin') then raise exception 'not_allowed' using errcode = '42501'; end if;
  if target = auth.uid() then raise exception 'not_on_yourself'; end if;
  select role, status into them, them_status from public.community_members where community_id = cid and user_id = target;
  if them = 'owner' then raise exception 'not_allowed' using errcode = '42501'; end if;
  if them = 'admin' and me <> 'owner' then raise exception 'not_allowed' using errcode = '42501'; end if;

  if action = 'approve' then
    update public.community_members set status = 'active', joined_at = now() where community_id = cid and user_id = target and status = 'pending';
  elsif action = 'decline' then
    delete from public.community_members where community_id = cid and user_id = target and status = 'pending';
  elsif action = 'remove' then
    delete from public.community_members where community_id = cid and user_id = target and status = 'active';
  elsif action = 'ban' then
    insert into public.community_members (community_id, user_id, role, status) values (cid, target, 'member', 'banned')
      on conflict (community_id, user_id) do update set role = 'member', status = 'banned';
  elsif action = 'unban' then
    delete from public.community_members where community_id = cid and user_id = target and status = 'banned';
  elsif action in ('make_admin','make_member','transfer_owner') then
    if me <> 'owner' then raise exception 'not_allowed' using errcode = '42501'; end if;
    if them_status is distinct from 'active' then raise exception 'not_a_member'; end if;
    if action = 'make_admin' then
      update public.community_members set role = 'admin' where community_id = cid and user_id = target;
    elsif action = 'make_member' then
      update public.community_members set role = 'member' where community_id = cid and user_id = target;
    else
      update public.community_members set role = 'admin' where community_id = cid and user_id = auth.uid();
      update public.community_members set role = 'owner' where community_id = cid and user_id = target;
    end if;
  else
    raise exception 'unknown_action';
  end if;
end $$;

create or replace function public.delete_community(cid uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.community_role(cid) is distinct from 'owner' then raise exception 'not_allowed' using errcode = '42501'; end if;
  delete from public.communities where id = cid;
end $$;

revoke execute on function public.create_community(text, text, text, text, text, text, text) from public, anon;
revoke execute on function public.join_community(uuid) from public, anon;
revoke execute on function public.leave_community(uuid) from public, anon;
revoke execute on function public.moderate_member(uuid, uuid, text) from public, anon;
revoke execute on function public.delete_community(uuid) from public, anon;
grant execute on function public.create_community(text, text, text, text, text, text, text) to authenticated;
grant execute on function public.join_community(uuid) to authenticated;
grant execute on function public.leave_community(uuid) to authenticated;
grant execute on function public.moderate_member(uuid, uuid, text) to authenticated;
grant execute on function public.delete_community(uuid) to authenticated;

-- ---------------------------------------------------------------- realtime chat
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'community_messages') then
    execute 'alter publication supabase_realtime add table public.community_messages';
  end if;
end $$;
