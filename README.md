# The Watcher

Track everything you watch, read and play, and share it with the people you follow.

The Watcher is an installable web app (PWA) for **TV shows, movies, books and video games**. It started as a personal tracker and is growing into a social platform, with profiles, follows, communities, shared lists, comments and a "Watch together" picker. Add it to your phone's home screen and it opens full screen like a native app.

---

## What it does

### Tracking
- **Four kinds, always in the same order:** Books · Movies · TV Shows · Video Games.
- **TV shows:** mark episodes, seasons or whole shows as watched; watchlist; follow and "stopped watching" states; time watched and time left.
- **Movies:** watchlist, watched, release countdowns.
- **Books:** following, reading, finished, stopped (status only, no time stats).
- **Video games:** Played, On shelf or Upcoming, with an optional "played on" console.
- **One colour language everywhere:** white = following, blue = not out yet, orange = in progress, green = done, red = stopped.
- **Ratings:** a personal 5-star rating next to the public /10 score from each catalogue.
- **Favorites:** up to 9 per kind.

### Finding something to watch
- **Content tab:** your library per kind. Tap the tab again to move to the next kind. The app opens on Movies.
- **Up & Coming:** a calendar of upcoming episodes and releases for what you follow.
- **Discover:** trending and popular rows for every kind, plus one search for titles and people.
- **Pick for me:** a random pick filtered by kind, genre, length and source (anything, or only your own library).
- **Watch together:** a shared swipe session; matches show up when everyone swipes right.

### Social
- **Accounts:** Google sign-in or email and password; every account picks an @username.
- **Privacy:** public by default with per-item toggles. Private accounts approve their followers.
- **Profiles:** time watched, per-kind cards, stats, favorites, lists, public libraries; a leaderboard (TV and movies).
- **Lists:** pick the type once (mixed, shows, seasons, episodes, movies, books or games), rank the items, share them.
- **Communities:** groups around titles, with News, Chat, Lists and members. Owners and admins post official lists; members share ranked lists; Remix copies a shared list into your own. Communities can be discovered by category and city.
- **Comments** on every title, with spoiler blurring, likes and replies.

### Feel
- Dark and light themes (follows your device by default), poster-first layout.
- Phone gestures: drag a drawer's handle down to close it, the Back button closes the top drawer, and the installed iPhone app gets a left-edge swipe to go back.
- Anything destructive asks first.
- Fast repeat opens: screens, posters and catalogue answers are cached on the device.

---

## Your data

- **The cloud is the library.** Each account's library is one owner-only row in Supabase, protected by row-level security. Each device keeps a copy so the app opens instantly and works offline, and syncs on its own. There's nothing to back up by hand.
- **Safety copies:** the server keeps automatic snapshots (at most every 6 hours, before any large shrink, 20 per account).
- **Nothing fake:** no placeholder users or made-up activity; empty states instead.
- Database changes are additive and safe to re-run; none of them restructure or delete library data.

---

## Data sources

| Kind | Source | Key needed |
|---|---|---|
| TV shows & movies | [TMDB](https://www.themoviedb.org) | Free API key |
| Books | [Open Library](https://openlibrary.org/developers/api) | None |
| Video games | [IGDB](https://www.igdb.com) via a Supabase Edge Function | Twitch app, stored as Supabase secrets |

Every source is credited on title pages. With no TMDB key, the app runs in **sample mode**: a built-in catalogue for all four kinds, so it can be developed and tested offline.

---

## Tech

React 19 · TypeScript · Vite · React Router (hash routing) · Zustand · vite-plugin-pwa (Workbox) · Supabase (Postgres, auth, Realtime, Edge Functions) · hosted on Netlify.

---

## Run it locally

Requires Node.js 20 or later.

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
npm run lint
```

Without a `.env` file it runs in sample mode. To use live data, copy `.env.example` to `.env` and fill in what you need:

| Variable | What it's for |
|---|---|
| `VITE_TMDB_TOKEN` (or `VITE_TMDB_KEY`) | Live TV and movie data |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | Accounts, sync and everything social |
| `VITE_IGDB=on` | Video games, once the `igdb` function is deployed |

Books need no variable.

## Backend setup

See **[SUPABASE_SETUP.md](SUPABASE_SETUP.md)** for:
- the SQL files to run, in order (`supabase/migration.sql`, then `002` to `012`);
- Google sign-in;
- deploying the `igdb` Edge Function and its secrets.

Secrets like the Twitch client secret live only in Supabase's secret store, never in the app or the repo.

## Deploy

Netlify builds the site with `npm run build` and publishes `dist/` (see `netlify.toml`). Add the `VITE_` variables under Site configuration → Environment variables. Don't mark them as secret: they're compiled into the public app, and Netlify's secret scanning would fail the build. Each push to `main` deploys automatically.

---

## Project layout

```
src/
  screens/     one file per page (Content tabs, Discover, Pick for me, Watch together,
               title pages, Profile, Stats, Lists, Communities, Settings, …)
  ui/          shared UI: drawers (Sheet), poster grids, pickers, comments, gestures, theme CSS
  components/  icons, toasts, small building blocks
  logic/       app rules: statuses, sync, stats, lists, favorites, Pick-for-me filters
  data/        catalogue clients (TMDB, Open Library, IGDB), Supabase calls, sample catalogues
  store/       Zustand stores (library, signed-in user, cached title facts, toasts)
  hooks/ utils/
supabase/
  *.sql        database schema and policies, run in order
  functions/   igdb Edge Function
scripts/       one-off data builders (community city index)
public/        icons and static assets
```
