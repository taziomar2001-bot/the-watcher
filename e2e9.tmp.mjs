import { chromium } from 'playwright'
const OUT = '/tmp/claude-0/-home-claude/ff69cf3f-0294-5ec9-8cae-38035667e611/scratchpad/shots/'
const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })
const ctx = await b.newContext({ viewport: { width: 320, height: 640 } })
await ctx.route(/image\.tmdb|supabase\.co/, (r) => r.url().includes('supabase') ? r.fulfill({ json: {} }) : r.abort())
await ctx.route(/api\.themoviedb\.org/, (r) => {
  const u = new URL(r.request().url()); const p = u.pathname.replace('/3', '')
  if (p.startsWith('/genre/')) return r.fulfill({ json: { genres: [{ id: 28, name: 'Action' }, { id: 35, name: 'Comedy' }, { id: 99, name: 'Documentary' }, { id: 10751, name: 'Family' }] } })
  if (p === '/movie/603') return r.fulfill({ json: { id: 603, title: 'The Matrix Reloaded Extended Edition', overview: 'x', genres: [{ id: 28, name: 'Action' }], release_date: '1999-03-31', runtime: 136, vote_average: 8.2, vote_count: 26543, credits: { crew: [{ job: 'Director', name: 'The Wachowskis' }], cast: [] } } })
  if (p === '/tv/1396') return r.fulfill({ json: { id: 1396, name: 'Breaking Bad', overview: 'x', genres: [], status: 'Ended', networks: [{ name: 'AMC' }], first_air_date: '2008-01-20', vote_average: 8.9, vote_count: 15234, number_of_episodes: 1, seasons: [{ season_number: 1 }] } })
  if (p === '/tv/1396/season/1') return r.fulfill({ json: { name: 'Season 1', episodes: [{ season_number: 1, episode_number: 1, name: 'Pilot', air_date: '2008-01-20', runtime: 58, vote_average: 8.4, vote_count: 312 }] } })
  return r.fulfill({ json: { results: Array.from({ length: 8 }, (_, i) => ({ id: i + 1, title: 'A Rather Long Movie Title ' + i, name: 'Show ' + i, genre_ids: [], vote_average: 7, vote_count: 10, release_date: '2020-01-01' })), total_pages: 1, genres: [] } })
})
await ctx.addInitScript(() => localStorage.setItem('tw-onboarded', '1'))
const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(e.message))
const routes = ['/tv', '/movies', '/upcoming', '/discover', '/communities', '/profile', '/settings', '/profile/stats', '/discover/random', '/discover/match', '/show/1396', '/movie/603', '/leaderboard', '/library/shows']
for (const r of routes) {
  await p.goto('http://localhost:8080/#' + r); await p.waitForTimeout(900)
  const over = await p.evaluate(() => {
    const W = window.innerWidth; const bad = []
    document.querySelectorAll('.app-shell *').forEach((el) => { const rc = el.getBoundingClientRect(); if (rc.width && rc.right > W + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.hscroll') && !el.closest('.cat-nav')) bad.push((el.className || el.tagName).toString().slice(0, 40) + ':' + Math.round(rc.right)) })
    return [...new Set(bad)].slice(0, 5)
  })
  console.log(r.padEnd(18), over.length ? 'OVERFLOW ' + over.join(' | ') : 'ok')
  await p.screenshot({ path: OUT + 'w320' + r.replace(/\//g, '_') + '.png' })
}
console.log('errors', errs); await b.close()
