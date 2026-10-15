import { useState } from 'react'

/** Image with shimmer placeholder + graceful fallback. */
export function SmartImage({
  src,
  alt,
  className,
  style,
}: {
  src?: string
  alt: string
  className?: string
  style?: React.CSSProperties
}) {
  const [loaded, setLoaded] = useState(false)
  const [broken, setBroken] = useState(false)
  return (
    <span className={`smart-img ${className ?? ''}`} style={style}>
      {!loaded && <span className="smart-img-skeleton" />}
      {src && !broken && (
        <img
          src={src}
          alt={alt}
          loading="lazy"
          onLoad={() => setLoaded(true)}
          onError={() => (setLoaded(true), setBroken(true))}
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
    </span>
  )
}

export function Skeleton({
  w,
  h,
  r = 8,
  style,
}: {
  w?: number | string
  h?: number | string
  r?: number
  style?: React.CSSProperties
}) {
  return <span className="skeleton" style={{ width: w, height: h, borderRadius: r, ...style }} />
}
