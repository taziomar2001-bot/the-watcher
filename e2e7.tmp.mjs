import { chromium } from 'playwright'
const OUT = '/tmp/claude-0/-home-claude/ff69cf3f-0294-5ec9-8cae-38035667e611/scratchpad/shots/'
const G = ['Drama', 'Comedy', 'Thriller', 'Science Fiction', 'Crime', 'Animation', 'Romance', 'Horror']
const L = ['en', 'en', 'en', 'fr', 'ko', 'ja', 'es']
const movies = {}, watched = {}, last = {}, rate = {}
for (let i = 1; i <= 60; i++) { movies['m' + i] = { id: String(i), type: 'movie', title: 'Movie ' + i }; }
const lib = { libraryMovies: {}, watchlistMovies: {}, watchedMovies: {}, lastWatched: {}, movieRatings: {} }
for (let i = 1; i <= 60; i++) { const id = String(i); lib.libraryMovies[id] = { id, type: 'movie', title: 'Movie ' + i }; lib.watchlistMovies[id] = true; if (i <= 48) { lib.watchedMovies[id] = true; lib.lastWatched[id] = Date.UTC(2016 + (i % 10), i % 12, 3) } if (i % 3 === 0) lib.movieRatings[id] = 1 + (i % 5) }
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 375, height: 812 } })
await ctx.route(/image\.tmdb|supabase\.co/, (r) => r.url().includes('supabase') ? r.fulfill({ json: {} }) : r.abort())
let calls = 0
await ctx.route(/api\.themoviedb\.org/, (r) => {
  const p = new URL(r.request().url()).pathname.replace('/3', ''); const m = /^\/movie\/(\d+)$/.exec(p)
  if (m) { calls++; const i = Number(m[1]); return r.fulfill({ json: { id: i, title: 'Movie ' + i, genres: [{ name: G[i % 8] }, ...(i % 3 ? [{ name: G[(i * 7) % 8] }] : [])], release_date: `${1960 + ((i * 13) % 64)}-05-01`, original_language: L[i % 7], production_countries: [{ iso_3166_1: ['US', 'FR', 'KR', 'GB'][i % 4] }], runtime: 90 + (i % 50), vote_average: 5.5 + (i % 30) / 10, vote_count: 100 } }) }
  return r.fulfill({ json: { results: [], genres: [] } })
})
await ctx.addInitScript((lib) => { localStorage.setItem('tw-onboarded', '1'); localStorage.setItem('the-watcher-library-v1', JSON.stringify({ state: lib, version: 0 })) }, lib)
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
await p.goto('http://localhost:8080/#/profile'); await p.waitForTimeout(1200); await p.screenshot({ path: OUT + '70-profile-stats-entry.png' })
await p.locator('.stats-entry').click(); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '71-stats-learning.png' })
await p.waitForTimeout(3500); console.log('tmdb calls:', calls)
await p.screenshot({ path: OUT + '72-stats.png', fullPage: false })
await p.evaluate(() => document.querySelector('.scroll-area').scrollTo(0, 650)); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '73-stats-2.png' })
await p.evaluate(() => document.querySelector('.scroll-area').scrollTo(0, 1500)); await p.waitForTimeout(300); await p.screenshot({ path: OUT + '74-stats-3.png' })
await p.reload(); await p.waitForTimeout(1500); console.log('cached (no new calls):', calls)
console.log('genre rows:', await p.locator('.share-row').count(), 'errors', errs); await b.close()
