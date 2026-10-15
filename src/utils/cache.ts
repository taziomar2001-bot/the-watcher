import { useCallback, useEffect, useRef, useState } from 'react'

// Stale-while-revalidate for network screens: show the last copy instantly
// (memory, then this device's storage), refresh in the background, and only
// swap when the data actually changed — so pages don't jump around while
// loading. Cleared with the account on sign-out.

const mem = new Map<string, unknown>()
const PREFIX = 'tw-cache:'

export function readCache<T>(key: string): T | undefined {
  if (mem.has(key)) return mem.get(key) as T
  try {
    const raw = localStorage.getItem(PREFIX + key)
    if (raw) {
      const v = JSON.parse(raw) as T
      mem.set(key, v)
      return v
    }
  } catch {
    /* unavailable or corrupt */
  }
  return undefined
}

// The device copy is a convenience: keep it small so it can never crowd out
// the library itself in storage (≤ 30 entries, ≤ 150 KB each).
const MAX_ENTRIES = 30
const MAX_BYTES = 150_000
const INDEX = PREFIX + '__index'

export function writeCache<T>(key: string, value: T, persist = true) {
  mem.set(key, value)
  if (!persist) return
  try {
    const raw = JSON.stringify(value)
    if (raw.length > MAX_BYTES) {
      localStorage.removeItem(PREFIX + key)
      return
    }
    const index = (JSON.parse(localStorage.getItem(INDEX) ?? '[]') as string[]).filter((k) => k !== key)
    index.push(key)
    while (index.length > MAX_ENTRIES) localStorage.removeItem(PREFIX + index.shift()!)
    localStorage.setItem(INDEX, JSON.stringify(index))
    localStorage.setItem(PREFIX + key, raw)
  } catch {
    /* quota or private mode: memory copy still works */
  }
}

export function dropCache(prefix: string) {
  for (const k of [...mem.keys()]) if (k.startsWith(prefix)) mem.delete(k)
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i)
      if (k?.startsWith(PREFIX + prefix)) localStorage.removeItem(k)
    }
  } catch {
    /* ignore */
  }
}

/**
 * `load` returns the fresh value, or `undefined` on failure (keeps the cached
 * copy). `data` is undefined only on a cold first load.
 */
export function useCached<T>(key: string | null, load: () => Promise<T | undefined>, opts: { persist?: boolean; keepPrevious?: boolean } = {}) {
  const [data, setData] = useState<T | undefined>(() => (key ? readCache<T>(key) : undefined))
  const [failed, setFailed] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const loadRef = useRef(load)
  loadRef.current = load
  const keyRef = useRef(key)
  keyRef.current = key
  const persist = opts.persist !== false

  const reload = useCallback(async () => {
    if (!key) return
    setRefreshing(true)
    try {
      const v = await loadRef.current()
      if (keyRef.current !== key) {
        // A newer key took over while this was loading: just remember it.
        if (v !== undefined) writeCache(key, v, persist)
        return
      }
      if (v === undefined) {
        setFailed(true)
        return
      }
      setFailed(false)
      const prev = readCache<T>(key)
      if (JSON.stringify(prev) !== JSON.stringify(v)) {
        writeCache(key, v, persist)
        setData(v)
      } else setData(v)
    } catch {
      setFailed(true)
    } finally {
      setRefreshing(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, persist])

  const keep = !!opts.keepPrevious
  useEffect(() => {
    const cached = key ? readCache<T>(key) : undefined
    // keepPrevious: while a new search loads, keep showing the last results.
    if (cached !== undefined || !keep) setData(cached)
    setFailed(false)
    void reload()
  }, [key, reload, keep])

  /** Optimistic local edit that's also kept in the cache. */
  const mutate = useCallback(
    (fn: (v: T | undefined) => T) => {
      setData((cur) => {
        const next = fn(cur)
        if (key) writeCache(key, next, persist)
        return next
      })
    },
    [key, persist],
  )

  return { data, failed: failed && data === undefined, stale: failed, refreshing, reload, mutate }
}
