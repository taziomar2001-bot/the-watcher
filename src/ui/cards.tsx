import { SmartImage } from '../components/ui'
import { ProgressDot } from './primitives'
import { ChevronRight, CheckIcon, PlusIcon, ClockIcon } from '../components/Icons'
import type { DotColor } from '../logic/status'

// ---- TV Show card (poster, title, year, seasons, progress) ----
export function ShowCard({
  poster,
  title,
  year,
  seasons,
  color,
  onClick,
}: {
  poster?: string
  title: string
  year?: number
  seasons?: number
  color: DotColor
  onClick?: () => void
}) {
  return (
    <button className="media-card pressable" onClick={onClick}>
      <SmartImage src={poster} alt={title} className="media-card-poster" />
      <div className="media-card-body">
        <div className="media-card-title">{title}</div>
        <div className="media-card-meta">
          {[year, seasons != null ? `${seasons} season${seasons === 1 ? '' : 's'}` : null].filter(Boolean).join('  ·  ')}
        </div>
      </div>
      <div className="media-card-right">
        <ProgressDot color={color} />
      </div>
    </button>
  )
}

// ---- Movie card ----
export function MovieCard({
  poster,
  title,
  year,
  runtime,
  color,
  onClick,
}: {
  poster?: string
  title: string
  year?: number
  runtime?: number
  color: DotColor
  onClick?: () => void
}) {
  return (
    <button className="media-card pressable" onClick={onClick}>
      <SmartImage src={poster} alt={title} className="media-card-poster" />
      <div className="media-card-body">
        <div className="media-card-title">{title}</div>
        <div className="media-card-meta">
          {[year, runtime ? `${runtime} min` : null].filter(Boolean).join('  ·  ')}
        </div>
      </div>
      <div className="media-card-right">
        <ProgressDot color={color} />
      </div>
    </button>
  )
}

// ---- Season card ----
export function SeasonCard({
  artwork,
  name,
  episodeCount,
  color,
  onClick,
}: {
  artwork?: string
  name: string
  episodeCount: number
  color: DotColor
  onClick?: () => void
}) {
  return (
    <button className="media-card pressable" onClick={onClick}>
      <SmartImage src={artwork} alt={name} className="media-card-poster" />
      <div className="media-card-body">
        <div className="media-card-title">{name}</div>
        <div className="media-card-meta">{episodeCount} episode{episodeCount === 1 ? '' : 's'}</div>
      </div>
      <div className="media-card-right">
        <ProgressDot color={color} />
      </div>
    </button>
  )
}

// ---- Episode row ----
export function EpisodeRow({
  still,
  title,
  number,
  airDate,
  watched,
  rating,
  onToggle,
  onClick,
}: {
  still?: string
  title: string
  number: number
  airDate?: string
  watched: boolean
  rating?: number
  onToggle?: () => void
  onClick?: () => void
}) {
  return (
    <div className="episode-row">
      <button className="episode-main pressable" onClick={onClick}>
        <SmartImage src={still} alt={title} className="episode-still" />
        <div className="episode-body">
          <div className="episode-title">
            <span className="episode-num">{number}</span>
            {title}
          </div>
          <div className="episode-meta">
            {airDate ?? 'TBA'}
            {rating != null && <span className="episode-rating"> · {rating}★</span>}
          </div>
        </div>
      </button>
      <button
        className={`episode-check ${watched ? 'done' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggle?.()
        }}
        aria-label={watched ? 'Watched' : 'Mark watched'}
      >
        <CheckIcon size={16} />
      </button>
    </div>
  )
}

// ---- Category card (TV home) ----
export function CategoryCard({
  title,
  count,
  posters,
  onClick,
}: {
  title: string
  count: number
  posters: (string | undefined)[]
  onClick?: () => void
}) {
  return (
    <button className="category-card pressable" onClick={onClick}>
      <div className="category-stack">
        {posters.slice(0, 3).map((p, i) => (
          <SmartImage key={i} src={p} alt="" className="category-stack-poster" style={{ left: i * 26, zIndex: 3 - i }} />
        ))}
        {posters.length === 0 && <div className="category-stack-empty" />}
      </div>
      <div className="category-info">
        <div className="category-title">{title}</div>
        <div className="category-count">{count} {count === 1 ? 'title' : 'titles'}</div>
      </div>
      <ChevronRight size={22} />
    </button>
  )
}

// ---- Poster thumbnail (Discover carousels / grids) ----
export function PosterThumb({
  poster,
  title,
  subtitle,
  color,
  following,
  onAdd,
  onClick,
  width,
}: {
  poster?: string
  title: string
  subtitle?: string
  color?: DotColor
  following?: boolean
  onAdd?: () => void
  onClick?: () => void
  width?: number
}) {
  return (
    <div className="poster-thumb" style={width ? { width } : undefined}>
      <div className="poster-thumb-art" onClick={onClick}>
        <SmartImage src={poster} alt={title} />
        {color && (
          <span className="poster-thumb-dot">
            <ProgressDot color={color} size={11} />
          </span>
        )}
        {onAdd && (
          <button
            className={`poster-thumb-add ${following ? 'added' : ''}`}
            onClick={(e) => {
              e.stopPropagation()
              onAdd()
            }}
            aria-label={following ? 'Following' : 'Follow'}
          >
            {following ? <CheckIcon size={16} /> : <PlusIcon size={16} />}
          </button>
        )}
      </div>
      <div className="poster-thumb-title" onClick={onClick}>
        {title}
      </div>
      {subtitle && <div className="poster-thumb-sub">{subtitle}</div>}
    </div>
  )
}

// ---- Action pill (follow / watched) ----
export function ActionPill({
  label,
  active,
  icon,
  onClick,
  tone = 'default',
}: {
  label: string
  active?: boolean
  icon?: 'plus' | 'check' | 'clock'
  onClick?: () => void
  tone?: 'default' | 'green'
}) {
  return (
    <button className={`action-pill ${active ? 'active' : ''} tone-${tone} pressable`} onClick={onClick}>
      {icon === 'plus' && <PlusIcon size={15} />}
      {icon === 'check' && <CheckIcon size={15} />}
      {icon === 'clock' && <ClockIcon size={15} />}
      {label}
    </button>
  )
}
