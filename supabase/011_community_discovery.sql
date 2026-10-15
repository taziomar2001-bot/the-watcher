-- The Watcher — community discovery, categories, locations and activity order.
-- Run AFTER 010. Existing communities stay intact. Never touches public.library.

alter table public.communities
  add column if not exists content_types text[],
  add column if not exists location_kind text not null default 'global',
  add column if not exists location_country_code text,
  add column if not exists location_country_name text,
  add column if not exists location_city text,
  add column if not exists location_admin_name text,
  add column if not exists location_place_id integer;

-- Backfill once; rerunning the migration will not reset later moderator edits.
update public.communities c
set content_types = case
  when exists (select 1 from public.community_titles t where t.community_id = c.id and t.ref like 'show:%')
   and exists (select 1 from public.community_titles t where t.community_id = c.id and t.ref like 'movie:%')
    then array['show','movie']::text[]
  when exists (select 1 from public.community_titles t where t.community_id = c.id and t.ref like 'show:%')
    then array['show']::text[]
  when exists (select 1 from public.community_titles t where t.community_id = c.id and t.ref like 'movie:%')
    then array['movie']::text[]
  when topic_type in ('show','movie') then array[topic_type]::text[]
  else array['show','movie']::text[] end
where content_types is null;
alter table public.communities
  alter column content_types set default array['show','movie']::text[],
  alter column content_types set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_content_types_check') then
    alter table public.communities add constraint communities_content_types_check check (
      content_types = array['show']::text[]
      or content_types = array['movie']::text[]
      or content_types = array['show','movie']::text[]
    );
  end if;
  if not exists (select 1 from pg_constraint where conname = 'communities_location_check') then
    alter table public.communities add constraint communities_location_check check (
      (location_kind = 'global' and location_country_code is null and location_country_name is null and location_city is null and location_admin_name is null and location_place_id is null)
      or (location_kind = 'country' and location_country_code is not null and location_country_code ~ '^[A-Z]{2}$'
          and location_country_name is not null and char_length(location_country_name) between 2 and 80
          and location_city is null and location_admin_name is null and location_place_id is null)
      or (location_kind = 'city' and location_country_code is not null and location_country_code ~ '^[A-Z]{2}$'
          and location_country_name is not null and char_length(location_country_name) between 2 and 80
          and location_city is not null and char_length(location_city) between 1 and 200
          and location_place_id is not null and location_place_id > 0
          and (location_admin_name is null or char_length(location_admin_name) between 1 and 200))
    );
  end if;
end $$;

create index if not exists communities_content_types_idx on public.communities using gin (content_types);
create index if not exists communities_location_idx on public.communities (location_kind, location_country_code, location_place_id);

-- The original RPC stays available for older clients. New clients pass all
-- discovery fields to this version; the original owner-limit checks still run.
create or replace function public.create_community_v2(
  p_name text, p_description text, p_visibility text,
  p_topic_type text, p_topic_id text, p_topic_title text, p_topic_poster text,
  p_content_types text[], p_location_kind text,
  p_country_code text, p_country_name text, p_city text,
  p_admin_name text, p_place_id integer
) returns uuid language plpgsql security definer set search_path = public as $$
declare new_id uuid;
begin
  new_id := public.create_community(p_name, p_description, p_visibility,
    p_topic_type, p_topic_id, p_topic_title, p_topic_poster);
  update public.communities
     set content_types = p_content_types,
         location_kind = p_location_kind,
         location_country_code = case when p_location_kind = 'global' then null else upper(trim(p_country_code)) end,
         location_country_name = case when p_location_kind = 'global' then null else trim(p_country_name) end,
         location_city = case when p_location_kind = 'city' then trim(p_city) else null end,
         location_admin_name = case when p_location_kind = 'city' then nullif(trim(p_admin_name), '') else null end,
         location_place_id = case when p_location_kind = 'city' then p_place_id else null end
   where id = new_id;
  return new_id;
end $$;
revoke execute on function public.create_community_v2(text,text,text,text,text,text,text,text[],text,text,text,text,text,integer) from public, anon;
grant execute on function public.create_community_v2(text,text,text,text,text,text,text,text[],text,text,text,text,text,integer) to authenticated;

-- Existing UPDATE RLS policy checks is_community_mod(id). Add only these
-- columns to its grant; members cannot change taxonomy or location.
grant update (content_types, location_kind, location_country_code, location_country_name, location_city, location_admin_name, location_place_id)
  on public.communities to authenticated;

alter table public.community_members add column if not exists last_interacted_at timestamptz;

-- Members can like comments in the community news feed.
create table if not exists public.community_comment_likes (
  comment_id uuid not null references public.community_comments(id) on delete cascade,
  community_id uuid not null references public.communities(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
create index if not exists community_comment_likes_community_idx
  on public.community_comment_likes (community_id, created_at desc);
alter table public.community_comment_likes enable row level security;
revoke all on public.community_comment_likes from public, anon, authenticated;
grant select, insert, delete on public.community_comment_likes to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'community_comment_likes' and policyname = 'community_comment_likes_select') then
    execute 'create policy community_comment_likes_select on public.community_comment_likes for select to authenticated
      using (public.can_read_community(community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_comment_likes' and policyname = 'community_comment_likes_insert') then
    execute 'create policy community_comment_likes_insert on public.community_comment_likes for insert to authenticated
      with check (user_id = auth.uid() and public.community_role(community_id) is not null
        and exists (select 1 from public.community_comments c where c.id = comment_id and c.community_id = community_comment_likes.community_id))';
  end if;
  if not exists (select 1 from pg_policies where tablename = 'community_comment_likes' and policyname = 'community_comment_likes_delete') then
    execute 'create policy community_comment_likes_delete on public.community_comment_likes for delete to authenticated
      using (user_id = auth.uid())';
  end if;
end $$;

-- Preserve existing activity when this migration is installed. A visit does
-- not count; only authored posts/comments/messages, reactions and shared lists.
with actions as (
  select community_id, author_id as user_id, created_at as activity_at from public.community_posts
  union all select community_id, author_id, created_at from public.community_comments
  union all select community_id, user_id, created_at from public.community_reactions
  union all select community_id, user_id, created_at from public.community_comment_likes
  union all select community_id, author_id, created_at from public.community_messages
  union all select community_id, owner_id, updated_at from public.community_lists
), recent as (
  select community_id, user_id, max(activity_at) as activity_at
  from actions group by community_id, user_id
)
update public.community_members m
   set last_interacted_at = recent.activity_at
  from recent
 where m.community_id = recent.community_id and m.user_id = recent.user_id
   and (m.last_interacted_at is null or m.last_interacted_at < recent.activity_at);

create or replace function public.community_record_interaction()
returns trigger language plpgsql security definer set search_path = public as $$
declare cid uuid; actor uuid := auth.uid();
begin
  if actor is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then cid := old.community_id;
  else cid := new.community_id; end if;
  update public.community_members
     set last_interacted_at = now()
   where community_id = cid and user_id = actor and status = 'active';
  return coalesce(new, old);
end $$;

drop trigger if exists community_posts_activity on public.community_posts;
create trigger community_posts_activity after insert or update or delete on public.community_posts
  for each row execute function public.community_record_interaction();
drop trigger if exists community_comments_activity on public.community_comments;
create trigger community_comments_activity after insert or update or delete on public.community_comments
  for each row execute function public.community_record_interaction();
drop trigger if exists community_reactions_activity on public.community_reactions;
create trigger community_reactions_activity after insert or delete on public.community_reactions
  for each row execute function public.community_record_interaction();
drop trigger if exists community_comment_likes_activity on public.community_comment_likes;
create trigger community_comment_likes_activity after insert or delete on public.community_comment_likes
  for each row execute function public.community_record_interaction();
drop trigger if exists community_messages_activity on public.community_messages;
create trigger community_messages_activity after insert or delete on public.community_messages
  for each row execute function public.community_record_interaction();
drop trigger if exists community_lists_activity on public.community_lists;
create trigger community_lists_activity after insert or update or delete on public.community_lists
  for each row execute function public.community_record_interaction();
