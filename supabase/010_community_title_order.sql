-- The Watcher — order of a community's linked titles. Run AFTER 009.
-- Additive and safe to re-run: adds two columns and one function; existing
-- titles keep the order they were added in until an owner/admin changes it.

alter table public.community_titles add column if not exists position integer;
alter table public.communities add column if not exists title_order text not null default 'added';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_title_order_check') then
    alter table public.communities add constraint communities_title_order_check check (title_order in ('added', 'custom'));
  end if;
end $$;

-- Owners/admins: show titles in the order they were added, or in a custom
-- order (p_refs = every linked ref, first to last). Never adds or removes titles.
create or replace function public.set_community_title_order(cid uuid, p_mode text, p_refs text[] default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_community_mod(cid) then raise exception 'not_allowed' using errcode = '42501'; end if;
  if p_mode not in ('added', 'custom') then raise exception 'bad_input'; end if;
  update public.communities set title_order = p_mode where id = cid;
  if p_mode = 'custom' and p_refs is not null then
    update public.community_titles t set position = o.pos
    from unnest(p_refs) with ordinality as o(ref, pos)
    where t.community_id = cid and t.ref = o.ref;
  end if;
end $$;
revoke execute on function public.set_community_title_order(uuid, text, text[]) from public, anon;
grant execute on function public.set_community_title_order(uuid, text, text[]) to authenticated;
