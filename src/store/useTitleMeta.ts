import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getTitleMeta, type TitleMeta } from '../data/tmdb'
import { USE_TMDB } from '../data/catalog'

/**
 * Catalog facts about titles in the library (genres, year, language…), cached
 * on this device only. It's public TMDB data, not personal data, so it is
 * never synced — each device fills it once, in the background, from TMDB.
 */
interface MetaState {
  meta: Record<string, TitleMeta> // key: "show:ID" | "movie:ID"
  running: boolean
  done: number
  total: number
  addMany: (entries: Record<string, TitleMeta>) => void
}

export const useTitleMeta = create<MetaState>()(
  persist(
    (set) => ({
      meta: {},
      running: false,
      done: 0,
      total: 0,
      addMany: (entries) => set((s) => ({ meta: { ...s.meta, ...entries } })),
    }),
    { name: 'tw-title-meta', partialize: (s) => ({ meta: s.meta }) },
  ),
)

let runId = 0

/** Fetch facts for every key that doesn't have them yet. Safe to call repeatedly. */
export async function enrichTitles(keys: string[]) {
  if (!USE_TMDB) return
  const st = useTitleMeta.getState()
  const missing = keys.filter((k) => !st.meta[k])
  if (missing.length === 0 || st.running) return
  const my = ++runId
  useTitleMeta.setState({ running: true, done: 0, total: missing.length })
  let pending: Record<string, TitleMeta> = {}
  let done = 0
  const flush = () => {
    if (Object.keys(pending).length) useTitleMeta.getState().addMany(pending)
    pending = {}
    useTitleMeta.setState({ done })
  }
  let i = 0
  const worker = async () => {
    while (i < missing.length && my === runId) {
      const key = missing[i++]
      const [type, id] = key.split(':') as ['show' | 'movie', string]
      const m = await getTitleMeta(type, id)
      if (m) pending[key] = m
      done++
      if (done % 25 === 0) flush()
    }
  }
  try {
    await Promise.all(Array.from({ length: 6 }, worker))
  } finally {
    flush()
    if (my === runId) useTitleMeta.setState({ running: false })
  }
}

export function stopEnrichment() {
  runId++
  useTitleMeta.setState({ running: false })
}
