-- The Watcher — automatic cloud backups of every library.
-- Run AFTER the earlier files. Additive and safe to re-run; it never changes
-- public.library itself, it only keeps copies of it.
--
-- Every time a library is saved, the server keeps the PREVIOUS version when:
--   • the last kept copy is more than 6 hours old, or
--   • the save would make the library much smaller (a likely mistake).
-- The 20 most recent copies per account are kept. Nothing in the app needs to
-- ask about backups: if something ever goes wrong, a copy can be restored
-- from here.

create table if not exists public.library_history (
  id         bigserial primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  data       jsonb not null,
  saved_at   timestamptz not null,           -- when that version was current
  kept_at    timestamptz not null default now(),
  reason     text not null default 'periodic' -- 'periodic' | 'shrink'
);
create index if not exists library_history_user_idx on public.library_history (user_id, kept_at desc);

alter table public.library_history enable row level security;
revoke all on public.library_history from public, anon, authenticated;
grant select on public.library_history to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='library_history' and policyname='library_history_select_own') then
    execute 'create policy "library_history_select_own" on public.library_history for select to authenticated using (auth.uid() = user_id)';
  end if;
end $$;

create or replace function public.library_keep_history()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  last_kept timestamptz;
  old_size int := length(old.data::text);
  new_size int := length(new.data::text);
  why text;
begin
  if new.data is not distinct from old.data or old.data = '{}'::jsonb then
    return new;
  end if;
  select max(kept_at) into last_kept from public.library_history where user_id = old.user_id;
  if new_size < old_size * 0.7 then
    why := 'shrink';
  elsif last_kept is null or last_kept < now() - interval '6 hours' then
    why := 'periodic';
  end if;
  if why is not null then
    insert into public.library_history (user_id, data, saved_at, reason)
      values (old.user_id, old.data, old.updated_at, why);
    delete from public.library_history h
      where h.user_id = old.user_id
        and h.id not in (select id from public.library_history
                         where user_id = old.user_id order by kept_at desc limit 20);
  end if;
  return new;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'library_keep_history') then
    execute 'create trigger library_keep_history before update on public.library
             for each row execute function public.library_keep_history()';
  end if;
end $$;

-- "Delete my library" in the app really deletes: drop the copies too.
create or replace function public.library_drop_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  delete from public.library_history where user_id = old.user_id;
  return old;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'library_drop_history') then
    execute 'create trigger library_drop_history after delete on public.library
             for each row execute function public.library_drop_history()';
  end if;
end $$;

-- Keep a first copy of every existing library right away.
insert into public.library_history (user_id, data, saved_at, reason)
  select l.user_id, l.data, l.updated_at, 'periodic'
  from public.library l
  where l.data <> '{}'::jsonb
    and not exists (select 1 from public.library_history h where h.user_id = l.user_id);

-- Check:  select user_id, saved_at, kept_at, reason, length(data::text) as size
--         from public.library_history order by kept_at desc;
