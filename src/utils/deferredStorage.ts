import type { PersistStorage, StorageValue } from 'zustand/middleware'

// Saving the whole library to this device on every tap (stringify + write of
// a large JSON) blocks the UI. Instead keep the latest state in memory and
// write it shortly after changes settle — and immediately whenever the app is
// hidden or closed, so nothing is lost.

const pending = new Map<string, unknown>()
const timers = new Map<string, ReturnType<typeof setTimeout>>()

function write(name: string) {
  clearTimeout(timers.get(name))
  timers.delete(name)
  if (!pending.has(name)) return
  const value = pending.get(name)
  pending.delete(name)
  try {
    localStorage.setItem(name, JSON.stringify(value))
  } catch {
    /* quota / private mode: the in-memory state is still correct */
  }
}

/** Drop a not-yet-written value (e.g. when the account is cleared from this device). */
const blocked = new Set<string>()
export function discardPending(name: string) {
  // Until the page reloads, nothing re-saves this key behind the caller's back.
  blocked.add(name)
  pending.delete(name)
  clearTimeout(timers.get(name))
  timers.delete(name)
}

export function flushAll() {
  for (const name of [...pending.keys()]) write(name)
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', flushAll)
  window.addEventListener('beforeunload', flushAll)
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && flushAll())
}

export function deferredStorage<S>(delay = 400): PersistStorage<S> {
  return {
    getItem: (name) => {
      // A not-yet-written value is the freshest one.
      if (pending.has(name)) return pending.get(name) as StorageValue<S>
      try {
        const raw = localStorage.getItem(name)
        return raw ? (JSON.parse(raw) as StorageValue<S>) : null
      } catch {
        return null
      }
    },
    setItem: (name, value) => {
      if (blocked.has(name)) return
      pending.set(name, value)
      clearTimeout(timers.get(name))
      timers.set(name, setTimeout(() => write(name), delay))
    },
    removeItem: (name) => {
      pending.delete(name)
      clearTimeout(timers.get(name))
      try {
        localStorage.removeItem(name)
      } catch {
        /* ignore */
      }
    },
  }
}
