import { useEffect, useRef } from 'react'
import { useLibrary, type CustomList } from '../store/useLibrary'
import { useSync } from './sync'
import { resolveItem } from './lists'
import { linkList, unlinkList, type SnapItem } from '../data/communities'

/** What a community sees of a list: its items with titles and posters. */
export function snapshotItems(list: CustomList, lib: Pick<ReturnType<typeof useLibrary.getState>, 'libraryShows' | 'libraryMovies'>): SnapItem[] {
  const out: SnapItem[] = []
  for (const ref of list.items.slice(0, 500)) {
    const it = resolveItem(ref, lib, list.meta)
    if (!it) continue
    const x: SnapItem = { r: ref, t: it.title }
    if (it.sub) x.s = it.sub
    if (it.poster) x.p = it.poster
    if (it.year) x.y = it.year
    out.push(x)
  }
  return out
}

const KEY = 'tw-clsync'
function readPushed(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}
function writePushed(v: Record<string, string>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
const hash = (s: string) => {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return `${s.length}:${h}`
}

export async function pushListTo(cid: string, list: CustomList) {
  const lib = useLibrary.getState()
  return linkList(cid, { id: list.id, name: list.name, kind: list.kind ?? 'mixed', ranked: !!list.ranked, cover: list.cover, items: snapshotItems(list, lib) })
}

/** Remove a list from every community it's linked to (e.g. before deleting it). */
export async function unlinkEverywhere(list: CustomList) {
  await Promise.all((list.communities ?? []).map((cid) => unlinkList(cid, list.id)))
}

/**
 * While signed in, keep each linked list's community copy up to date with the
 * list in the library (debounced, only when something changed).
 */
export function useCommunityListSync() {
  const status = useSync((s) => s.status)
  const ready = useSync((s) => s.syncReady)
  const lists = useLibrary((s) => s.lists)
  const running = useRef(false)

  useEffect(() => {
    if (status !== 'signedIn' || !ready) return
    const linked = lists.filter((l) => l.communities?.length)
    if (linked.length === 0) return
    const t = setTimeout(async () => {
      if (running.current) return
      running.current = true
      try {
        const pushed = readPushed()
        const lib = useLibrary.getState()
        for (const l of linked) {
          const sig = hash(JSON.stringify([l.name, l.kind, l.ranked, l.cover ?? '', snapshotItems(l, lib)]))
          for (const cid of l.communities!) {
            const k = `${cid}/${l.id}`
            if (pushed[k] === sig) continue
            const r = await pushListTo(cid, l)
            if (r.ok) pushed[k] = sig
            else if (r.code === 'not_a_member' || r.code === 'not_allowed') {
              // No longer allowed there (left, or list un-ranked): drop the link.
              const cur = useLibrary.getState().lists.find((x) => x.id === l.id)
              if (cur) useLibrary.getState().setListCommunities(l.id, (cur.communities ?? []).filter((c) => c !== cid))
              delete pushed[k]
            }
          }
        }
        writePushed(pushed)
      } finally {
        running.current = false
      }
    }, 2500)
    return () => clearTimeout(t)
  }, [status, ready, lists])
}

export function forgetPushed(cid: string, listId: string) {
  const p = readPushed()
  delete p[`${cid}/${listId}`]
  writePushed(p)
}
