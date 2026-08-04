import { useLayoutEffect, useRef } from 'react'

// Remembers each list screen's scroll offset (module scope survives route
// changes) so returning from a detail page lands you exactly where you were,
// instead of jumping back to the top.
const cache = new Map<string, number>()

/**
 * Attach the returned ref to a scrolling element. On mount it restores the last
 * saved offset for `key` (retrying briefly while async content grows), and it
 * records the offset as you scroll. User input during the restore window cancels
 * it, so we never fight a deliberate scroll.
 */
export function useScrollMemory<T extends HTMLElement>(key: string) {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const saved = cache.get(key) ?? 0
    let cancelled = false
    let saveRaf = 0

    if (saved > 0) {
      el.scrollTop = saved // immediate for synchronous content
      let tries = 0
      const restore = () => {
        if (cancelled) return
        el.scrollTop = saved
        // Keep retrying while the list is still growing (async data/images).
        if (Math.abs(el.scrollTop - saved) > 2 && tries++ < 40) requestAnimationFrame(restore)
      }
      requestAnimationFrame(restore)
    }

    const onScroll = () => {
      cancelAnimationFrame(saveRaf)
      saveRaf = requestAnimationFrame(() => cache.set(key, el.scrollTop))
    }
    const stop = () => {
      cancelled = true
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    el.addEventListener('touchstart', stop, { passive: true })
    el.addEventListener('wheel', stop, { passive: true })
    el.addEventListener('pointerdown', stop, { passive: true })
    return () => {
      cancelled = true
      cancelAnimationFrame(saveRaf)
      el.removeEventListener('scroll', onScroll)
      el.removeEventListener('touchstart', stop)
      el.removeEventListener('wheel', stop)
      el.removeEventListener('pointerdown', stop)
    }
  }, [key])
  return ref
}
