-- The Watcher — books & video games.
-- Run AFTER 011. Additive and safe to re-run: nothing is deleted or rewritten.
--
-- 1. Library safety: books and games live in two new keys of each library
--    ("books", "games"). An older copy of the app (an open tab, a phone that
--    hasn't updated yet) doesn't know them and would save the library without
--    them. This trigger keeps any top-level key the incoming save leaves out,
--    so nothing can be lost that way. (The app always sends every key it
--    knows, so this never brings back something you removed.)
-- 2. Communities, community titles/lists, comments and Watch together accept
--    books and games (the old checks only allowed shows and movies). Only the
--    CHECK rules change; no row is touched.
-- 3. Public profile counts for books and games.

-- ================================================================ 1. library
create or replace function public.library_carry_keys()
returns trigger language plpgsql set search_path = public as $$
begin
  if jsonb_typeof(old.data) = 'object' and jsonb_typeof(new.data) = 'object' then
    -- Right side wins; keys only the old copy has are kept.
    new.data := old.data || new.data;
  end if;
  return new;
end $$;

do $$
begin
  -- Named so it runs before library_keep_history (BEFORE triggers run in name order).
  if not exists (select 1 from pg_trigger where tgname = 'library_carry_keys') then
    execute 'create trigger library_carry_keys before update on public.library
             for each row execute function public.library_carry_keys()';
  end if;
end $$;

-- ===================================================== 2. wider CHECK rules
-- Drop a table's CHECK constraint(s) whose definition mentions a pattern,
-- then add the new rule under a fixed name (so re-running is a no-op).
create or replace function pg_temp.replace_check(tbl regclass, pattern text, new_name text, new_def text)
returns void language plpgsql as $$
declare c record;
begin
  if exists (select 1 from pg_constraint where conrelid = tbl and conname = new_name) then
    return;
  end if;
  for c in select conname from pg_constraint
           where conrelid = tbl and contype = 'c' and pg_get_constraintdef(oid) ilike pattern loop
    execute format('alter table %s drop constraint %I', tbl, c.conname);
  end loop;
  execute format('alter table %s add constraint %I check (%s)', tbl, new_name, new_def);
end $$;

select pg_temp.replace_check('public.communities', '%topic_type%', 'communities_topic_type_v2',
  $c$topic_type is null or topic_type in ('show','movie','book','game')$c$);

select pg_temp.replace_check('public.communities', '%content_types%', 'communities_content_types_v2',
  $c$cardinality(content_types) between 1 and 4
     and content_types <@ array['show','movie','book','game']::text[]$c$);

select pg_temp.replace_check('public.community_titles', '%show|movie%', 'community_titles_ref_v2',
  $c$ref ~ '^(show|movie|book|game):[0-9A-Za-z_-]{1,40}$'$c$);

select pg_temp.replace_check('public.community_lists', '%episodes%', 'community_lists_kind_v2',
  $c$kind in ('mixed','shows','seasons','episodes','movies','books','games')$c$);

select pg_temp.replace_check('public.title_comments', '%season:%', 'title_comments_target_v2',
  $c$char_length(target) <= 80 and target ~ '^(show:[0-9A-Za-z_-]+|movie:[0-9A-Za-z_-]+|book:[0-9A-Za-z_-]+|game:[0-9A-Za-z_-]+|season:[0-9A-Za-z_-]+:[0-9]+|episode:[0-9A-Za-z_-]+:[0-9]+:[0-9]+)$'$c$);

select pg_temp.replace_check('public.match_sessions', '%kind%', 'match_sessions_kind_v2',
  $c$kind in ('movie','show','book','game')$c$);

-- ======================================================= 3. profile counts
alter table public.profile_stats add column if not exists books_followed integer not null default 0;
alter table public.profile_stats add column if not exists books_finished integer not null default 0;
alter table public.profile_stats add column if not exists games_followed integer not null default 0;
alter table public.profile_stats add column if not exists games_finished integer not null default 0;
