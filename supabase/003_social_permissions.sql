-- The Watcher — Wave 1 follow-up: protect social identity and follow edges.
-- Run AFTER 002_social_foundation.sql. Safe to re-run.
-- This does not change public.library or delete user data.

-- The original table-level grants let an authenticated client update any
-- column in its own profile row. Limit direct edits to the identity fields;
-- follower counts stay trigger-managed and usernames go through the RPC.
revoke insert, update on public.profiles from public, anon, authenticated;
grant update (display_name, avatar, bio, visibility)
  on public.profiles to authenticated;

-- A follow target may accept a request by changing status only. In particular,
-- neither side may rewrite the follower or target IDs of an existing edge.
revoke update on public.follows from public, anon, authenticated;
grant update (status) on public.follows to authenticated;
alter policy follows_accept on public.follows
  to authenticated
  using (auth.uid() = following_id and status = 'pending')
  with check (auth.uid() = following_id and status = 'accepted');

-- A security-definer RPC should reject anonymous calls and a missing profile.
create or replace function public.claim_username(uname text)
returns text language plpgsql security definer set search_path = public as $$
declare clean text;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  clean := lower(trim(uname));
  if clean !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'invalid_username';
  end if;
  if exists (select 1 from public.profiles where lower(username) = clean and id <> auth.uid()) then
    raise exception 'username_taken';
  end if;
  update public.profiles set username = clean, updated_at = now() where id = auth.uid();
  if not found then
    raise exception 'profile_missing';
  end if;
  return clean;
end $$;
revoke execute on function public.claim_username(text) from public, anon;
grant execute on function public.claim_username(text) to authenticated;
