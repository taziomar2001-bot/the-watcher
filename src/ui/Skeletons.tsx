/** Fixed-size placeholders so screens keep their layout while data loads. */
export function RowsSkeleton({ n = 5, h = 58, gap = 8 }: { n?: number; h?: number; gap?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} className="skeleton" style={{ height: h, borderRadius: 14, margin: `${gap}px 0` }} />
      ))}
    </div>
  )
}

export function ProfileSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="page-pad">
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '6px 0 16px' }}>
        <span className="skeleton" style={{ width: 72, height: 72, borderRadius: '50%', flex: '0 0 auto' }} />
        <span style={{ flex: 1 }}>
          <span className="skeleton" style={{ display: 'block', width: '50%', height: 18 }} />
          <span className="skeleton" style={{ display: 'block', width: '30%', height: 12, marginTop: 8 }} />
        </span>
      </div>
      <div className="skeleton" style={{ height: 40, borderRadius: 999, marginBottom: 16 }} />
      <RowsSkeleton n={4} h={64} />
    </div>
  )
}
