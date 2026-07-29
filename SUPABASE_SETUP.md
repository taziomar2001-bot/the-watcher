# Cloud Backup Setup (Supabase)

This makes your library permanent and syncable across devices. It's free and
takes about 5 minutes. Do it on a desktop/laptop.

## 1. Create the project

1. Go to https://supabase.com and sign up (free).
2. Click **New project**. Give it a name (e.g. `the-watcher`), set a database
   password (save it somewhere), pick the nearest region, and create it.
3. Wait ~1 minute for it to finish provisioning.

## 2. Create the database table

In the left sidebar open **SQL Editor** → **New query**, paste this, and click **Run**:

```sql
create table if not exists public.library (
  user_id uuid references auth.users on delete cascade primary key,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.library enable row level security;

create policy "Users manage their own library"
  on public.library for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
```

This creates one secure row per account (row-level security means only you can
read or write your own data), holding your whole library as JSON.

## 3. (Recommended) Turn off email confirmation

So "Create account" signs you straight in:

- **Authentication** → **Providers** → **Email** → turn **off** "Confirm email" → Save.

(If you leave it on, you'll get a confirmation email to click before signing in.)

## 4. Copy your keys into the app

- **Project Settings** (gear icon) → **API**.
- Copy the **Project URL** and the **anon public** key.
- In your project's `.env` file add:

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR-ANON-PUBLIC-KEY
```

Rebuild (`npm run build`) or restart `npm run dev`.

## 5. Use it

- Open the app → **Profile** tab → **Cloud Backup** card.
- Tap **Create account** (email + password) once. Your library uploads automatically.
- From then on every change auto-backs-up.
- **On a new phone:** install the app, open Profile, **Sign in** with the same
  email/password → tap **Restore** and everything comes back.

Notes:
- The `anon` key is safe to ship in a client app — row-level security is what
  protects your data, and it's tied to your login.
- Sync is last-write-wins per device. If the app says "cloud has newer data,"
  tap Restore to pull it. Use **Back up now** / **Restore** for manual control.
