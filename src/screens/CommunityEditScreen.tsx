import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImageIcon, PlusIcon, TrashIcon, CheckIcon } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { communityHue } from './CommunitiesScreen'
import { RankReorder } from '../ui/RankReorder'
import { TitlePicker } from '../ui/TitlePicker'
import { CommunityContentField } from '../ui/CommunityContentField'
import { CommunityLocationField } from '../ui/CommunityLocationField'
import { RowsSkeleton } from '../ui/Skeletons'
import { useToast } from '../store/useToast'
import { useSync } from '../logic/sync'
import { fileToImage } from '../utils/image'
import { dropCache, readCache, writeCache } from '../utils/cache'
import { getMovie, getShow } from '../data/catalog'
import { validCommunityLocation, type CommunityLocation } from '../logic/communityTaxonomy'
import {
  addCommunityTitles,
  communityTitleOrder,
  communityTitles,
  getCommunity,
  setTitleOrder,
  updateCommunity,
  type Community,
  type CommunityContentType,
  type CommunityTitle,
  type TitleOrder,
} from '../data/communities'

type Art = 'avatar' | 'banner'

/** Edit a community on its own page: look, details, category, titles, privacy. */
export function CommunityEditScreen() {
  const nav = useNavigate()
  const { id = '' } = useParams()
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [c, setC] = useState<Community | null | undefined>()
  const [mod, setMod] = useState(false)
  const [titles, setTitles] = useState<CommunityTitle[] | undefined>()

  useEffect(() => {
    if (!signedIn) return
    let alive = true
    void getCommunity(id).then(async (r) => {
      if (!alive) return
      if (!r.ok) return setC(null)
      setC(r.value.community)
      setMod(r.value.me?.status === 'active' && r.value.me.role !== 'member')
      const t = await communityTitles(r.value.community)
      if (alive) setTitles(t)
    })
    return () => {
      alive = false
    }
  }, [id, signedIn])

  if (c === undefined || (c && titles === undefined))
    return (
      <Page title="Edit community" onBack={() => nav(-1)}>
        <div className="page-pad">
          <div className="skeleton" style={{ display: 'block', height: 150, borderRadius: 18, marginBottom: 18 }} />
          <RowsSkeleton n={5} h={52} />
        </div>
      </Page>
    )
  if (!c || !mod)
    return (
      <Page title="Edit community" onBack={() => nav(-1)}>
        <div className="empty">
          <div className="empty-title">{c ? 'Only owners and admins can edit this community' : 'Community not found'}</div>
        </div>
      </Page>
    )
  return <EditForm c={c} initialTitles={titles!} onDone={() => nav(-1)} />
}

function Page({ title, onBack, right, children }: { title: string; onBack: () => void; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="scroll-area route-fade">
      <div className="app-header edit-header">
        <button className="pressable" onClick={onBack} aria-label="Back">
          <ChevronLeft size={26} />
        </button>
        <h1>{title}</h1>
        <span className="edit-header-right">{right}</span>
      </div>
      {children}
    </div>
  )
}

function EditForm({ c, initialTitles, onDone }: { c: Community; initialTitles: CommunityTitle[]; onDone: () => void }) {
  const toast = useToast((s) => s.show)
  const [titles, setTitles] = useState(initialTitles)
  const [name, setName] = useState(c.name)
  const [description, setDescription] = useState(c.description)
  const [visibility, setVisibility] = useState(c.visibility)
  const [contentTypes, setContentTypes] = useState<CommunityContentType[]>(c.content_types ?? ['show', 'movie'])
  const [place, setPlace] = useState<CommunityLocation>({
    kind: c.location_kind ?? 'global',
    countryCode: c.location_country_code ?? undefined,
    countryName: c.location_country_name ?? undefined,
    city: c.location_city ?? undefined,
    adminName: c.location_admin_name ?? undefined,
    placeId: c.location_place_id ?? undefined,
  })
  const [avatar, setAvatar] = useState<string | null | undefined>(c.avatar)
  const [banner, setBanner] = useState<{ full: string | null; thumb: string | null } | undefined>(
    c.banner || c.banner_thumb ? { full: c.banner ?? null, thumb: c.banner_thumb ?? null } : undefined,
  )
  const [order, setOrder] = useState<TitleOrder | undefined>()
  const orderAtOpen = useRef<TitleOrder | undefined>(undefined)
  const [refs, setRefs] = useState<string[]>(initialTitles.map((t) => t.ref))
  const startOrder = useRef(initialTitles.map((t) => t.ref).join('|'))
  const [art, setArt] = useState<Art | null>(null)
  const [linking, setLinking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    void communityTitleOrder(c.id).then((o) => {
      orderAtOpen.current = o
      setOrder(o)
    })
  }, [c.id])

  const byRef = new Map(titles.map((t) => [t.ref, t]))
  const valid = name.trim().length >= 3 && contentTypes.length > 0 && validCommunityLocation(place)
  const hue = communityHue(c.id)
  const bannerSrc = banner?.full || banner?.thumb || undefined

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    const patch: Parameters<typeof updateCommunity>[1] = {
      name: name.trim(),
      description: description.trim(),
      visibility,
      content_types: contentTypes,
      location_kind: place.kind,
      location_country_code: place.kind === 'global' ? null : place.countryCode ?? null,
      location_country_name: place.kind === 'global' ? null : place.countryName ?? null,
      location_city: place.kind === 'city' ? place.city ?? null : null,
      location_admin_name: place.kind === 'city' ? place.adminName ?? null : null,
      location_place_id: place.kind === 'city' ? place.placeId ?? null : null,
    }
    if (avatar !== c.avatar) patch.avatar = avatar ?? null
    if ((banner?.full ?? null) !== (c.banner ?? null)) {
      patch.banner = banner?.full ?? null
      patch.banner_thumb = banner?.thumb ?? null
    }
    const r = await updateCommunity(c.id, patch)
    if (r.ok && order && titles.length > 1) {
      const changed = order === 'custom' ? refs.join('|') !== startOrder.current || orderAtOpen.current !== 'custom' : orderAtOpen.current !== 'added'
      if (changed) {
        const o = await setTitleOrder(c.id, order, order === 'custom' ? refs : undefined)
        if (!o.ok) toast(o.code === 'not_set_up' ? 'Title order needs 010_community_title_order.sql' : 'Couldn’t save the title order')
      }
    }
    setSaving(false)
    if (!r.ok) return toast('Couldn’t save changes — check your connection')
    // The community page shows its cached copy first: update it to the saved values.
    const key = `c:${useSync.getState().userId}:${c.id}`
    const cached = readCache<{ community: Community; me: unknown }>(key)
    if (cached && 'community' in cached) writeCache(key, { ...cached, community: { ...cached.community, ...patch } })
    dropCache(`ct:${c.id}`)
    toast('Saved')
    onDone()
  }

  return (
    <Page
      title="Edit community"
      onBack={onDone}
      right={
        <button className="follow-btn primary pressable" disabled={!valid || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      }
    >
      <div className="page-pad edit-page">
        {/* Look */}
        <section className="edit-section">
          <div className="edit-look">
            <button type="button" className="edit-look-banner pressable" style={{ background: `linear-gradient(135deg, ${hue}, color-mix(in srgb, ${hue} 35%, #0e1318))` }} onClick={() => setArt('banner')} aria-label="Change banner">
              {bannerSrc && <img src={bannerSrc} alt="" />}
              <span className="edit-look-chip">
                <ImageIcon size={14} /> {bannerSrc ? 'Banner' : 'Add banner'}
              </span>
            </button>
            <button type="button" className="edit-look-avatar pressable" style={avatar ? undefined : { background: hue }} onClick={() => setArt('avatar')} aria-label="Change picture">
              {avatar ? <img src={avatar} alt="" /> : <span>{name.trim()[0]?.toUpperCase() ?? '?'}</span>}
              <span className="edit-look-pen">
                <ImageIcon size={12} />
              </span>
            </button>
          </div>
        </section>

        {/* Details */}
        <section className="edit-section">
          <label className="field-label" htmlFor="ce-name">
            Name
          </label>
          <input id="ce-name" className="sync-input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          {name.trim().length < 3 && <div className="vis-hint">At least 3 characters.</div>}
          <label className="field-label" htmlFor="ce-desc">
            Description
          </label>
          <textarea id="ce-desc" className="sync-input" rows={3} maxLength={500} placeholder="What’s it about?" value={description} onChange={(e) => setDescription(e.target.value)} />
        </section>

        {/* Category */}
        <section className="edit-section">
          <CommunityContentField value={contentTypes} onChange={setContentTypes} />
          <CommunityLocationField value={place} onChange={setPlace} />
        </section>

        {/* Titles */}
        <section className="edit-section">
          <div className="edit-section-head">
            <span className="field-label">Linked titles</span>
            {titles.length < 25 && (
              <button type="button" className="auth-link" onClick={() => setLinking(true)}>
                <PlusIcon size={14} /> Link a title
              </button>
            )}
          </div>
          {titles.length === 0 ? (
            <div className="vis-hint">No titles yet. Link the shows or movies this community is about.</div>
          ) : (
            <>
              {titles.length > 1 && order && (
                <div className="vis-choice" role="radiogroup" aria-label="Order of titles">
                  <button type="button" role="radio" aria-checked={order === 'added'} className={`vis-opt pressable ${order === 'added' ? 'on' : ''}`} onClick={() => setOrder('added')}>
                    Order added
                  </button>
                  <button type="button" role="radio" aria-checked={order === 'custom'} className={`vis-opt pressable ${order === 'custom' ? 'on' : ''}`} onClick={() => setOrder('custom')}>
                    Custom order
                  </button>
                </div>
              )}
              {order === 'custom' && titles.length > 1 ? (
                <>
                  <div className="vis-hint">Drag the handles to set the order they appear in.</div>
                  <RankReorder rows={refs.map((r) => ({ ref: r, title: byRef.get(r)?.title ?? r, poster: byRef.get(r)?.poster ?? undefined }))} onReorder={setRefs} />
                </>
              ) : (
                <div className="edit-titles">
                  {(order === 'custom' ? refs.map((r) => byRef.get(r)!).filter(Boolean) : titles).map((t) => (
                    <div key={t.ref} className="edit-title-row">
                      {t.poster ? <SmartImage src={t.poster} alt="" className="edit-title-poster" /> : <span className="edit-title-poster blank">{t.title.slice(0, 2).toUpperCase()}</span>}
                      <span className="edit-title-name">{t.title}</span>
                    </div>
                  ))}
                </div>
              )}
              <div className="vis-hint">Linked titles stay linked; you can add more.</div>
            </>
          )}
        </section>

        {/* Privacy */}
        <section className="edit-section">
          <div className="field-label">Privacy</div>
          <div className="vis-choice" role="radiogroup" aria-label="Privacy">
            <button type="button" role="radio" aria-checked={visibility === 'public'} className={`vis-opt pressable ${visibility === 'public' ? 'on' : ''}`} onClick={() => setVisibility('public')}>
              Public
            </button>
            <button type="button" role="radio" aria-checked={visibility === 'private'} className={`vis-opt pressable ${visibility === 'private' ? 'on' : ''}`} onClick={() => setVisibility('private')}>
              Private
            </button>
          </div>
          <div className="vis-hint">
            {visibility === 'public' ? 'Anyone can read the news and join. Chat is for members.' : 'Anyone can find it, but you approve who joins and only members see inside.'}
          </div>
        </section>
        <div style={{ height: 24 }} />
      </div>

      {art && (
        <ArtSheet
          kind={art}
          titles={titles}
          current={art === 'avatar' ? avatar ?? undefined : bannerSrc}
          onClose={() => setArt(null)}
          onPick={(v) => {
            if (art === 'avatar') setAvatar(v.full)
            else setBanner(v.full ? { full: v.full, thumb: v.thumb ?? v.full } : undefined)
            setArt(null)
          }}
        />
      )}
      {linking && (
        <TitlePicker
          kind="mixed"
          title="Link titles"
          isPicked={(ref) => titles.some((t) => t.ref === ref)}
          onToggle={async (ref, meta) => {
            if (titles.some((t) => t.ref === ref)) return toast('Linked titles stay linked')
            const r = await addCommunityTitles(c.id, [{ ref, title: meta.t, poster: meta.p, year: meta.y }])
            if (!r.ok) return toast(r.code === 'not_set_up' ? 'Run 009_titles_lists_comments.sql in Supabase first' : 'Couldn’t link that title')
            const t: CommunityTitle = { community_id: c.id, ref, title: meta.t, poster: meta.p ?? null, year: meta.y ?? null }
            setTitles((ts) => [...ts, t])
            setRefs((rs) => [...rs, ref])
            toast(`Linked ${meta.t}`)
          }}
          onClose={() => setLinking(false)}
        />
      )}
    </Page>
  )
}

/**
 * Change the picture or the banner: upload a photo, use one of the linked
 * titles' art (shown only when asked for), or remove it.
 */
function ArtSheet({
  kind,
  titles,
  current,
  onClose,
  onPick,
}: {
  kind: Art
  titles: CommunityTitle[]
  current?: string
  onClose: () => void
  onPick: (v: { full: string | null; thumb?: string | null }) => void
}) {
  const toast = useToast((s) => s.show)
  const [step, setStep] = useState<'menu' | 'titles'>('menu')
  const [backdrops, setBackdrops] = useState<Record<string, string> | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const posters = titles.filter((t) => t.poster)

  useEffect(() => {
    if (kind !== 'banner' || step !== 'titles' || backdrops) return
    let alive = true
    void Promise.all(
      titles.map(async (t) => {
        const [type, id] = t.ref.split(':')
        const m = await (type === 'show' ? getShow(id) : getMovie(id)).catch(() => undefined)
        return [t.ref, m?.backdrop] as const
      }),
    ).then((pairs) => alive && setBackdrops(Object.fromEntries(pairs.filter((p) => p[1]) as [string, string][])))
    return () => {
      alive = false
    }
  }, [kind, step, titles, backdrops])

  const upload = async (f?: File) => {
    if (!f) return
    try {
      if (kind === 'avatar') onPick({ full: await fileToImage(f, 256, 256) })
      else onPick({ full: await fileToImage(f, 1200, 400, 0.78), thumb: await fileToImage(f, 480, 144, 0.72) })
    } catch {
      toast('Couldn’t read that image')
    }
  }

  const label = kind === 'avatar' ? 'picture' : 'banner'
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet art-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        {step === 'menu' ? (
          <>
            <div className="sheet-title">Community {label}</div>
            {titles.length > 0 && (
              <button className="sheet-row" onClick={() => setStep('titles')}>
                <span>
                  <ImageIcon size={16} /> Use a linked title’s {kind === 'avatar' ? 'poster' : 'backdrop'}
                </span>
                <ChevronRight size={16} />
              </button>
            )}
            <button className="sheet-row" onClick={() => input.current?.click()}>
              <span>
                <PlusIcon size={16} /> Upload a photo
              </span>
            </button>
            {current && (
              <button className="sheet-row danger" onClick={() => onPick({ full: null })}>
                <span>
                  <TrashIcon size={16} /> Remove {label}
                </span>
              </button>
            )}
            <input ref={input} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ''))} />
          </>
        ) : (
          <>
            <div className="art-sheet-head">
              <button className="place-back pressable" onClick={() => setStep('menu')} aria-label="Back">
                <ChevronLeft size={18} /> {kind === 'avatar' ? 'Choose a poster' : 'Choose a backdrop'}
              </button>
            </div>
            <div className={`art-grid ${kind === 'avatar' ? 'posters' : 'wide'}`}>
              {kind === 'avatar' ? (
                posters.length === 0 ? (
                  <div className="vis-hint">None of the linked titles has a poster.</div>
                ) : (
                  posters.map((t) => (
                    <button key={t.ref} className={`art-grid-item pressable ${current === t.poster ? 'on' : ''}`} onClick={() => onPick({ full: t.poster })}>
                      <img src={t.poster!} alt="" />
                      {current === t.poster && (
                        <span className="art-grid-check">
                          <CheckIcon size={14} />
                        </span>
                      )}
                      <span className="art-grid-name">{t.title}</span>
                    </button>
                  ))
                )
              ) : backdrops === null ? (
                Array.from({ length: Math.min(titles.length, 4) }, (_, i) => <div key={i} className="skeleton art-grid-item" />)
              ) : Object.keys(backdrops).length === 0 ? (
                <div className="vis-hint">None of the linked titles has a backdrop.</div>
              ) : (
                titles
                  .filter((t) => backdrops[t.ref])
                  .map((t) => (
                    <button key={t.ref} className={`art-grid-item pressable ${current === backdrops[t.ref] ? 'on' : ''}`} onClick={() => onPick({ full: backdrops[t.ref], thumb: backdrops[t.ref] })}>
                      <img src={backdrops[t.ref]} alt="" />
                      {current === backdrops[t.ref] && (
                        <span className="art-grid-check">
                          <CheckIcon size={14} />
                        </span>
                      )}
                      <span className="art-grid-name">{t.title}</span>
                    </button>
                  ))
              )}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}
