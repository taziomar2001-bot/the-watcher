-- The Watcher — community profile picture and banner.
-- Run AFTER 006. Additive and safe to re-run. Images are small JPEGs stored
-- inline (the app resizes them before upload).
alter table public.communities add column if not exists avatar text;
alter table public.communities add column if not exists banner text;
alter table public.communities add column if not exists banner_thumb text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'communities_avatar_size') then
    alter table public.communities add constraint communities_avatar_size check (avatar is null or length(avatar) <= 200000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'communities_banner_thumb_size') then
    alter table public.communities add constraint communities_banner_thumb_size check (banner_thumb is null or length(banner_thumb) <= 120000);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'communities_banner_size') then
    alter table public.communities add constraint communities_banner_size check (banner is null or length(banner) <= 600000);
  end if;
end $$;

grant update (name, description, visibility, avatar, banner, banner_thumb) on public.communities to authenticated;
