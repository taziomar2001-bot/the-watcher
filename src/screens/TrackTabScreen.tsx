import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SectionHeader } from '../ui/primitives'
import { PosterGrid, type GridItem } from '../ui/PosterGrid'
import { useScrollMemory } from '../hooks/useScrollMemory'
import { ContentSwitcher } from '../ui/ContentSwitcher'
import { WORDS, sectionsOf, useTrackEntries, type TrackEntry } from '../logic/tracks'
import type { TrackKind } from '../store/useLibrary'

export const BooksScreen = () => <TrackTabScreen kind="book" />
export const GamesScreen = () => <TrackTabScreen kind="game" />

const toGrid = (list: TrackEntry[]): GridItem[] =>
  list.map((e) => ({ id: e.id, poster: e.t.item.poster, title: e.t.item.title, color: e.color ?? 'orange' }))

/**
 * Content tab for books / games, laid out like TV Shows: what you're on now,
 * what's next, and what's coming. Finished and stopped titles live under
 * Profile → Books / Games.
 */
function TrackTabScreen({ kind }: { kind: TrackKind }) {
  const nav = useNavigate()
  const w = WORDS[kind]
  const entries = useTrackEntries(kind)
  const scrollRef = useScrollMemory<HTMLDivElement>(kind === 'book' ? 'books' : 'games')
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const topRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('active')

  const sections = useMemo(() => {
    const s = sectionsOf(entries)
    return [
      { key: 'active', chip: w.active, title: kind === 'book' ? 'Currently Reading' : 'Currently Playing', items: toGrid(s.active) },
      { key: 'backlog', chip: w.backlog, title: w.backlog, items: toGrid(s.backlog) },
      { key: 'soon', chip: 'Coming Soon', title: 'Coming Soon', items: toGrid(s.soon) },
    ]
  }, [entries, w, kind])
  const inLibrary = entries.filter((e) => e.t.followed || e.t.state).length

  const stickyH = () => topRef.current?.getBoundingClientRect().height ?? 96
  const jumpTo = (key: string) => {
    const el = scrollRef.current
    const sec = sectionRefs.current[key]
    if (!el || !sec) return
    const top = sec.getBoundingClientRect().top - el.getBoundingClientRect().top + el.scrollTop - stickyH()
    el.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    setActive(key)
  }
  const onScroll = () => {
    const el = scrollRef.current
    if (!el) return
    const elTop = el.getBoundingClientRect().top
    let cur = sections[0].key
    for (const s of sections) {
      const sec = sectionRefs.current[s.key]
      if (sec && sec.getBoundingClientRect().top - elTop <= stickyH() + 12) cur = s.key
    }
    setActive(cur)
  }

  return (
    <div className="scroll-area route-fade" ref={scrollRef} onScroll={onScroll}>
      <div className="sticky-top" ref={topRef}>
        <div className="app-header">
          <div>
            <ContentSwitcher current={kind === 'book' ? 'books' : 'games'} />
            <div className="sub">{inLibrary.toLocaleString()} in your library</div>
          </div>
        </div>
        <div className="cat-nav">
          {sections.map((s) => (
            <button key={s.key} className={`cat-chip ${active === s.key ? 'active' : ''}`} onClick={() => jumpTo(s.key)}>
              {s.chip}
            </button>
          ))}
        </div>
      </div>

      {inLibrary === 0 ? (
        <div className="empty">
          <div className="empty-title">No {w.many} yet</div>
          <div className="empty-sub">Follow {w.many} from Discover to start tracking</div>
          <button className="sync-btn primary pressable" style={{ marginTop: 14 }} onClick={() => nav('/discover', { state: { kind } })}>
            Discover {w.many}
          </button>
        </div>
      ) : (
        sections.map((sec) => (
          <div
            key={sec.key}
            ref={(el) => {
              sectionRefs.current[sec.key] = el
            }}
            style={{ marginBottom: 6, scrollMarginTop: 54 }}
          >
            <SectionHeader title={sec.title} count={sec.items.length} />
            {sec.items.length > 0 ? (
              <PosterGrid items={sec.items} onOpen={(id) => nav(`/${kind}/${id}`)} />
            ) : (
              <div className="page-pad" style={{ paddingBottom: 12 }}>
                <span style={{ color: 'var(--text-mute)', fontSize: 13 }}>Nothing here right now</span>
              </div>
            )}
          </div>
        ))
      )}
      <div style={{ height: 40 }} />
    </div>
  )
}
