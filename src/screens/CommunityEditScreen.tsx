import { KINDS_ON } from '../logic/content'
import { getGame } from '../data/games'
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ImageIcon, PlusIcon, TrashIcon, CheckIcon } from '../components/Icons'
import { SmartImage } from '../components/ui'
import { communityHue, type TopicDraft } from './CommunitiesScreen'
import { RankReorder } from '../ui/RankReorder'
import { TitlePicker } from '../ui/TitlePicker'
import { CommunityLocationField } from '../ui/CommunityLocationField'
import { ChoiceDrawer, FormGroup, FormInput, FormRow } from '../ui/FormRows'
import { RowsSkeleton } from '../ui/Skeletons'
import { useToast } from '../store/useToast'
import { useSync } from '../logic/sync'
import { fileToImage } from '../utils/image'
import { dropCache, readCache, writeCache } from '../utils/cache'
import { getMovie, getShow } from '../data/catalog'
import { contentTypesLabel, validCommunityLocation, type CommunityLocation } from '../logic/communityTaxonomy'
import {
  addCommunityTitles,
  communityTitleOrder,
  communityTitles,
  createCommunity,
  getCommunity,
  setTitleOrder,
  updateCommunity,
  type Community,
  type CommunityContentType,
  type CommunityTitle,
  type TitleOrder,
} from '../data/communities'

type Art = 'avatar' | 'banner'
type Drawer = null | 'content' | 'privacy' | 'order' | 'arrange'

/** Edit a community (owners/admins). */
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
          <RowsSkeleton n={5} h={48} />
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
  return <CommunityForm mode="edit" c={c} initialTitles={titles!} onDone={() => nav(-1)} />
}

/** Start a new community (optionally about a title, from a show/movie page). */
export function CommunityCreateScreen() {
  const nav = useNavigate()
  const topic = (useLocation().state as { topic?: TopicDraft } | null)?.topic
  const initial: CommunityTitle[] = topic?.id
    ? [{ community_id: '', ref: `${topic.type}:${topic.id}`, title: topic.title, poster: topic.poster ?? null, year: topic.year ?? null }]
    : []
  return <CommunityForm mode="create" initialTitles={initial} suggestedName={topic?.title ? `${topic.title} fans` : ''} onDone={() => nav(-1)} onCreated={(id) => nav(`/c/${id}`, { replace: true })} />
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

const CONTENT_OPTIONS: { key: CommunityContentType; label: string; hint: string }[] = [
  { key: 'show' as const, label: 'TV Shows', hint: 'Series, seasons and episodes' },
  { key: 'movie' as const, label: 'Movies', hint: 'Films' },
  { key: 'book' as const, label: 'Books', hint: 'Novels, non-fiction, comics' },
  { key: 'game' as const, label: 'Video Games', hint: 'Any platform' },
].filter((o) => KINDS_ON.includes(o.key))
const ORDER: CommunityContentType[] = ['show', 'movie', 'book', 'game']
const PRIVACY_OPTIONS: { key: 'public' | 'private'; label: string; hint: string }[] = [
  { key: 'public', label: 'Public', hint: 'Anyone can read the news and join. Chat is for members.' },
  { key: 'private', label: 'Private', hint: 'Anyone can find it; you approve who joins and only members see inside.' },
]

function CommunityForm({
  mode,
  c,
  initialTitles,
  suggestedName = '',
  onDone,
  onCreated,
}: {
  mode: 'create' | 'edit'
  c?: Community
  initialTitles: CommunityTitle[]
  suggestedName?: string
  onDone: () => void
  onCreated?: (id: string) => void
}) {
  const toast = useToast((s) => s.show)
  const editing = mode === 'edit' && !!c
  const [titles, setTitles] = useState(initialTitles)
  const [name, setName] = useState(c?.name ?? suggestedName)
  const [description, setDescription] = useState(c?.description ?? '')
  const [visibility, setVisibility] = useState<'public' | 'private'>(c?.visibility ?? 'public')
  const [contentTypes, setContentTypes] = useState<CommunityContentType[]>(
    c?.content_types ?? (initialTitles[0] ? [initialTitles[0].ref.split(':')[0] as CommunityContentType] : ['show', 'movie']),
  )
  const [place, setPlace] = useState<CommunityLocation>(
    c
      ? {
          kind: c.location_kind ?? 'global',
          countryCode: c.location_country_code ?? undefined,
          countryName: c.location_country_name ?? undefined,
          city: c.location_city ?? undefined,
          adminName: c.location_admin_name ?? undefined,
          placeId: c.location_place_id ?? undefined,
        }
      : { kind: 'global' },
  )
  const [avatar, setAvatar] = useState<string | null | undefined>(c?.avatar)
  const [banner, setBanner] = useState<{ full: string | null; thumb: string | null } | undefined>(
    c && (c.banner || c.banner_thumb) ? { full: c.banner ?? null, thumb: c.banner_thumb ?? null } : undefined,
  )
  const [order, setOrder] = useState<TitleOrder>('added')
  const orderAtOpen = useRef<TitleOrder>('added')
  const [refs, setRefs] = useState<string[]>(initialTitles.map((t) => t.ref))
  const startOrder = useRef(initialTitles.map((t) => t.ref).join('|'))
  const [art, setArt] = useState<Art | null>(null)
  const [drawer, setDrawer] = useState<Drawer>(null)
  const [linking, setLinking] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!editing) return
    void communityTitleOrder(c!.id).then((o) => {
      orderAtOpen.current = o
      setOrder(o)
    })
  }, [editing, c])

  const byRef = new Map(titles.map((t) => [t.ref, t]))
  const shown = order === 'custom' ? refs.map((r) => byRef.get(r)).filter((t): t is CommunityTitle => !!t) : titles
  const valid = name.trim().length >= 3 && contentTypes.length > 0 && validCommunityLocation(place)
  const hue = communityHue(c?.id ?? name)
  const bannerSrc = banner?.full || banner?.thumb || undefined

  const locationPatch = {
    content_types: contentTypes,
    location_kind: place.kind,
    location_country_code: place.kind === 'global' ? null : place.countryCode ?? null,
    location_country_name: place.kind === 'global' ? null : place.countryName ?? null,
    location_city: place.kind === 'city' ? place.city ?? null : null,
    location_admin_name: place.kind === 'city' ? place.adminName ?? null : null,
    location_place_id: place.kind === 'city' ? place.placeId ?? null : null,
  }

  const save = async () => {
    if (!valid || saving) return
    setSaving(true)
    if (!editing) {
      const first = titles[0]
      const r = await createCommunity({
        name: name.trim(),
        description: description.trim(),
        visibility,
        contentTypes,
        location: place,
        topic: first ? { type: first.ref.split(':')[0] as CommunityContentType, id: first.ref.split(':')[1], title: first.title, poster: first.poster ?? undefined } : undefined,
      })
      if (!r.ok) {
        setSaving(false)
        return toast(r.code === 'too_many_communities' ? 'You can own up to 10 communities' : 'Couldn’t create the community')
      }
      if (titles.length) await addCommunityTitles(r.value, titles.map((t) => ({ ref: t.ref, title: t.title, poster: t.poster ?? undefined, year: t.year ?? undefined })))
      if (avatar || banner) await updateCommunity(r.value, { avatar: avatar ?? null, banner: banner?.full ?? null, banner_thumb: banner?.thumb ?? null })
      if (order === 'custom' && titles.length > 1) await setTitleOrder(r.value, 'custom', refs)
      setSaving(false)
      return onCreated?.(r.value)
    }
    const patch: Parameters<typeof updateCommunity>[1] = { name: name.trim(), description: description.trim(), visibility, ...locationPatch }
    if (avatar !== c!.avatar) patch.avatar = avatar ?? null
    if ((banner?.full ?? null) !== (c!.banner ?? null)) {
      patch.banner = banner?.full ?? null
      patch.banner_thumb = banner?.thumb ?? null
    }
    const r = await updateCommunity(c!.id, patch)
    if (r.ok && titles.length > 1) {
      const changed = order === 'custom' ? refs.join('|') !== startOrder.current || orderAtOpen.current !== 'custom' : orderAtOpen.current !== 'added'
      if (changed) {
        const o = await setTitleOrder(c!.id, order, order === 'custom' ? refs : undefined)
        if (!o.ok) toast('Couldn’t save the title order')
      }
    }
    setSaving(false)
    if (!r.ok) return toast('Couldn’t save changes — check your connection')
    // The community page shows its cached copy first: update it to the saved values.
    const key = `c:${useSync.getState().userId}:${c!.id}`
    const cached = readCache<{ community: Community; me: unknown }>(key)
    if (cached && 'community' in cached) writeCache(key, { ...cached, community: { ...cached.community, ...patch } })
    dropCache(`ct:${c!.id}`)
    toast('Saved')
    onDone()
  }

  const action = (
    <button className="header-action pressable" disabled={!valid || saving} onClick={() => void save()}>
      {saving ? (editing ? 'Saving…' : 'Creating…') : editing ? 'Save' : 'Create'}
    </button>
  )

  return (
    <Page title={editing ? 'Edit community' : 'New community'} onBack={onDone} right={action}>
      <div className="page-pad cf">
        {/* Look */}
        <div className="cf-look">
          <button type="button" className="cf-banner pressable" style={{ background: `linear-gradient(135deg, ${hue}, color-mix(in srgb, ${hue} 35%, #0e1318))` }} onClick={() => setArt('banner')} aria-label="Change banner">
            {bannerSrc && <img src={bannerSrc} alt="" />}
            <span className="cf-edit-chip">
              <ImageIcon size={13} /> {bannerSrc ? 'Edit' : 'Add banner'}
            </span>
          </button>
          <button type="button" className="cf-avatar pressable" style={avatar ? undefined : { background: hue }} onClick={() => setArt('avatar')} aria-label="Change picture">
            {avatar ? <img src={avatar} alt="" /> : <span>{name.trim()[0]?.toUpperCase() ?? '?'}</span>}
            <span className="cf-avatar-badge">
              <ImageIcon size={11} />
            </span>
          </button>
        </div>

        <FormGroup>
          <FormInput label="Name" value={name} onChange={setName} maxLength={60} placeholder="e.g. Severance fans" />
          <FormInput label="Description" value={description} onChange={setDescription} maxLength={500} placeholder="What’s it about? (optional)" multiline />
        </FormGroup>
        {name.trim().length > 0 && name.trim().length < 3 && <div className="fg-foot warn">Names need at least 3 characters.</div>}

        <FormGroup title="Details">
          <FormRow label="Content" value={contentTypes.length >= CONTENT_OPTIONS.length ? 'Everything' : contentTypes.length === 2 && contentTypes.includes('show') && contentTypes.includes('movie') ? 'TV Shows & Movies' : contentTypesLabel(contentTypes)} onClick={() => setDrawer('content')} />
          <CommunityLocationField value={place} onChange={(v) => setPlace(v ?? { kind: 'global' })} />
          <FormRow label="Privacy" value={visibility === 'public' ? 'Public' : 'Private'} onClick={() => setDrawer('privacy')} />
        </FormGroup>

        <FormGroup title="Titles" footer={editing ? 'Linked titles stay linked; you can add more.' : 'Optional. You can add more later; once created, linked titles stay linked.'}>
          {shown.map((t) => (
            <div key={t.ref} className="fg-title-row">
              {t.poster ? <SmartImage src={t.poster} alt="" className="fg-title-poster" /> : <span className="fg-title-poster blank">{t.title.slice(0, 2).toUpperCase()}</span>}
              <span className="fg-title-name">{t.title}</span>
              {!editing && (
                <button
                  type="button"
                  className="fg-title-x pressable"
                  aria-label={`Remove ${t.title}`}
                  onClick={() => {
                    setTitles((ts) => ts.filter((x) => x.ref !== t.ref))
                    setRefs((rs) => rs.filter((r) => r !== t.ref))
                  }}
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          {titles.length < 25 && (
            <button type="button" className="fg-row add pressable" onClick={() => setLinking(true)}>
              <PlusIcon size={16} /> <span className="fg-row-label">Link a title</span>
            </button>
          )}
          {titles.length > 1 && <FormRow label="Order" value={order === 'custom' ? 'Custom' : 'Order added'} onClick={() => setDrawer('order')} />}
        </FormGroup>

        {!editing && (
          <button className="welcome-primary pressable cf-submit" disabled={!valid || saving} onClick={() => void save()}>
            {saving ? 'Creating…' : 'Create community'}
          </button>
        )}
        <div style={{ height: 24 }} />
      </div>

      {drawer === 'content' && (
        <ChoiceDrawer title="Content" multi options={CONTENT_OPTIONS} value={contentTypes} onChange={(v) => setContentTypes([...v].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)))} onClose={() => setDrawer(null)} note={CONTENT_OPTIONS.length > 2 ? 'Pick one or more.' : 'Pick one or both.'} />
      )}
      {drawer === 'privacy' && (
        <ChoiceDrawer title="Privacy" options={PRIVACY_OPTIONS} value={[visibility]} onChange={(v) => setVisibility(v[0])} onClose={() => setDrawer(null)} />
      )}
      {drawer === 'order' && (
        <ChoiceDrawer
          title="Order of titles"
          options={[
            { key: 'added' as const, label: 'Order added', hint: 'Oldest link first' },
            { key: 'custom' as const, label: 'Custom', hint: 'Arrange them yourself' },
          ]}
          value={[order]}
          onChange={(v) => {
            setOrder(v[0])
            if (v[0] === 'custom') setTimeout(() => setDrawer('arrange'), 0)
          }}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer === 'arrange' &&
        createPortal(
          <div className="sheet-backdrop" onClick={() => setDrawer(null)}>
            <div className="sheet" onClick={(e) => e.stopPropagation()}>
              <div className="sheet-handle" />
              <div className="sheet-title">Arrange titles</div>
              <RankReorder rows={refs.map((r) => ({ ref: r, title: byRef.get(r)?.title ?? r, poster: byRef.get(r)?.poster ?? undefined }))} onReorder={setRefs} />
              <button type="button" className="sync-btn primary pressable fg-done" onClick={() => setDrawer(null)}>
                Done
              </button>
            </div>
          </div>,
          document.body,
        )}
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
            if (titles.some((t) => t.ref === ref)) {
              if (editing) return toast('Linked titles stay linked')
              setTitles((ts) => ts.filter((t) => t.ref !== ref))
              setRefs((rs) => rs.filter((r) => r !== ref))
              return
            }
            const t: CommunityTitle = { community_id: c?.id ?? '', ref, title: meta.t, poster: meta.p ?? null, year: meta.y ?? null }
            if (editing) {
              const r = await addCommunityTitles(c!.id, [{ ref, title: meta.t, poster: meta.p, year: meta.y }])
              if (!r.ok) return toast('Couldn’t link that title')
              toast(`Linked ${meta.t}`)
            }
            setTitles((ts) => [...ts, t])
            setRefs((rs) => [...rs, ref])
          }}
          onClose={() => setLinking(false)}
        />
      )}
    </Page>
  )
}

/**
 * Change the picture or the banner: use one of the linked titles' art (shown
 * only when asked for), upload a photo, or remove it.
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
        const m = await (type === 'show' ? getShow(id) : type === 'movie' ? getMovie(id) : type === 'game' ? getGame(id) : Promise.resolve(undefined)).catch(() => undefined)
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
            <div className="fg-card">
              {titles.length > 0 && (
                <button type="button" className="fg-row pressable" onClick={() => setStep('titles')}>
                  <ImageIcon size={16} />
                  <span className="fg-row-label">Use a linked title’s {kind === 'avatar' ? 'poster' : 'backdrop'}</span>
                  <ChevronRight size={16} className="fg-row-chev" />
                </button>
              )}
              <button type="button" className="fg-row pressable" onClick={() => input.current?.click()}>
                <PlusIcon size={16} />
                <span className="fg-row-label">Upload a photo</span>
              </button>
              {current && (
                <button type="button" className="fg-row danger pressable" onClick={() => onPick({ full: null })}>
                  <TrashIcon size={16} />
                  <span className="fg-row-label">Remove {label}</span>
                </button>
              )}
            </div>
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
