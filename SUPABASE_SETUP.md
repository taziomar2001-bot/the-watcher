# Supabase setup for The Watcher

Each account's library is one owner-only JSON row in `public.library` — the
real, permanent copy. Devices keep a local copy so the app opens instantly and
works offline, and sync it automatically. Social profiles, follows and stats
live in separate tables.

## SQL files

Run these in order in Supabase → SQL Editor (skip any you've already run; all
are safe to re-run and none restructure or delete library data):

1. `supabase/migration.sql`
2. `supabase/002_social_foundation.sql`
3. `supabase/003_social_permissions.sql`
4. `supabase/004_social_profiles.sql`
5. `supabase/005_library_history.sql` — automatic cloud backups
6. `supabase/006_communities.sql` — communities (roles, announcements, chat, moderation)
7. `supabase/007_community_images.sql` — community picture and banner
8. `supabase/008_watch_together.sql` — Watch together sessions and swipes

## Backups

There is nothing to back up by hand. `005` makes the server keep copies of
each library automatically (at most every 6 hours, plus a copy before any save
that would shrink it by more than 30%), 20 per account. To inspect them:

```sql
select user_id, saved_at, kept_at, reason, length(data::text) as size
from public.library_history order by kept_at desc;
```

To restore one (replace the id), run as the project owner in the SQL Editor:

```sql
update public.library l set data = h.data
from public.library_history h
where h.id = 123 and l.user_id = h.user_id;
```

Devices pick up the restored library the next time the app opens.

## How sync behaves

- The account's cloud library always wins on sign-in, unless that device has
  the same account's own unsynced changes — then they're saved (and merged if
  the cloud also changed meanwhile). No "which copy" questions.
- A library created on a device without an account becomes the account's
  library on first sign-in if the account is empty.
- A device copy from a different account is never shown or uploaded.
- Offline edits are kept on the device and uploaded on reconnect.

## Configure the app

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the build environment
(Netlify). The anon key is public; row-level security protects each user's
data. Google sign-in: enable the Google provider in Supabase and set the
Google Cloud redirect URI to `https://<project-ref>.supabase.co/auth/v1/callback`.
