# Supabase setup for The Watcher

The private library stays in one owner-only JSON row in `public.library`.
Social profiles, follows, and aggregate stats live in separate tables.

## Before changing the database

1. In the app, open **Settings → Library & Data → Download backup** on the
   device that has your library. Keep the downloaded file somewhere safe.
2. Confirm you are using the intended Supabase project.
3. Run the SQL files in order in Supabase's SQL Editor:
   - `supabase/migration.sql`
   - `supabase/002_social_foundation.sql`
   - `supabase/003_social_permissions.sql`

If the first two files have already run, run only the new `003` file. All
three scripts are designed to be rerun. The third script narrows direct
profile and follow-row edits; it does not restructure or delete library data.
Do not use the older single-table SQL snippet from a previous copy of this
setup guide.

## Configure the app

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the app's build
environment. The anon key is public; row-level security protects each user's
data. The TV Time export is not shipped in the public website. The creator's
existing library remains in their own cloud row; use a private backup file if
it ever needs to be restored. Rebuild or redeploy after changing these values.

## Verify with two accounts

1. Sign in on the device that holds the owner's library. If the cloud account
   is empty, choose **Keep device copy** to upload it. Check that cloud sync
   completes, and keep the downloaded backup until you have verified it.
2. Sign out, then create a second test account. Its library should be empty.
3. Check that the second account cannot see or update the owner's library.
4. Check that a private profile's follow request stays pending until accepted.
5. Check that a signed-in user cannot directly change username or follower
   counts through the `profiles` table, or rewrite IDs on a `follows` row.

If device and cloud libraries differ, the app asks which one to keep. Download
a backup before choosing. A failed cloud read or save should leave the device
library intact and prevent sign-out until the sync issue is resolved.
When signing into a different account on a device with existing data, the
library-check screen hides that data until the cloud check succeeds. A known
previous account's copy cannot be uploaded into the new account. A device
library already verified for the same account remains visible during a
temporary cloud outage, with syncing paused.
