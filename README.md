# The Watcher

A personal entertainment tracking & discovery app — track shows and movies, mark
episodes watched, follow a release calendar, keep a watchlist, and browse your own
cinematic media library. Built as an installable **mobile PWA** so you can add it to
your iPhone home screen and use it full-screen like a native app, from anywhere.

- **Dark, poster-driven, cinematic** UI (black + yellow) matching the design spec.
- **Shows / Movies / Explore / Profile** with fixed bottom navigation.
- Watch List poster grids with progress bars, date-grouped Upcoming calendar,
  movie release countdowns, trending carousels, cinematic collapsing profile,
  show/movie detail pages, search, and browse-all catalogues.
- **Your library persists on-device** (localStorage) — zero backend, zero cost.
- Runs on **rich sample data out of the box**; add a free TMDB key for live data.

---

## Run it locally

Requires [Node.js](https://nodejs.org) 18+.

```bash
npm install
npm run dev
```

Open the printed URL (e.g. http://localhost:5173). To view it as a phone, open your
browser dev tools and switch to an iPhone device frame.

Production build + local preview:

```bash
npm run build
npm run preview
```

## Use it on your phone

The app is a **PWA** — the cheapest way to get a private, phone-accessible app with
no App Store fees. Two options:

**A. Same Wi-Fi (quick test).** Run `npm run dev -- --host`, then on your iPhone open
the "Network" URL it prints. In Safari, tap Share → **Add to Home Screen**.

**B. Free hosting (access from anywhere).** Deploy the `dist/` folder to any free
static host — Cloudflare Pages, Netlify, or Vercel. Then open the URL in Safari on
your iPhone and **Add to Home Screen**. It launches full-screen like a native app.

> Fastest free deploy: create a free account at Cloudflare Pages / Netlify / Vercel,
> point it at this project (build command `npm run build`, output dir `dist`), and
> you get a private HTTPS URL. Keep the URL to yourself and it stays effectively
> private.

## Live data from TMDB (optional, free)

The app ships with realistic sample data so everything works immediately. To pull
real posters, episodes, and release dates:

1. Create a free account at https://www.themoviedb.org/signup
2. Go to **Settings → API** (https://www.themoviedb.org/settings/api) and request a
   key (Developer / personal use).
3. Copy `.env.example` to `.env` and paste your **API Read Access Token (v4)** into
   `VITE_TMDB_TOKEN` (or your v3 key into `VITE_TMDB_KEY`).
4. Restart the dev server (or rebuild). The app auto-detects the key and switches
   to live TMDB data.

Images from TMDB are cached by the service worker for fast, offline-friendly loads.

## Tech

React + TypeScript + Vite · React Router · Zustand (persisted to localStorage) ·
vite-plugin-pwa. No paid services required.

## Project layout

```
src/
  components/   reusable design-system components (PosterCard, EpisodeReleaseCard, …)
  screens/      Shows, Movies, Explore, Profile, detail, browse, search
  data/         catalog (mock ⇄ TMDB switch), tmdb client, mock seed, poster art
  store/        library state (watchlist / watched / favorites / lists), toasts
  utils/        date grouping helpers
```

## Roadmap ideas

- Cross-device sync of your library (free Supabase tier) so it follows you across
  phone + laptop.
- Full TMDB wiring for the episode calendar and personalized Explore.
- Notifications for release day.
