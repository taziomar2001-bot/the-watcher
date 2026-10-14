import { useNavigate } from 'react-router-dom'
import { ChevronLeft } from '../components/Icons'

/** A failed load: say so plainly and offer a retry (instead of an endless skeleton). */
export function ErrorState({ onRetry, title = 'Couldn’t load this', sub = 'Check your connection and try again.', page }: { onRetry?: () => void; title?: string; sub?: string; page?: boolean }) {
  const nav = useNavigate()
  const body = (
    <div className="empty error-state" role="alert">
      <div className="empty-title">{title}</div>
      <div className="empty-sub">{sub}</div>
      {onRetry && (
        <button className="sync-btn primary pressable" style={{ marginTop: 14 }} onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
  if (!page) return body
  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <button className="pressable" onClick={() => nav(-1)} aria-label="Back" style={{ color: 'var(--text-dim)' }}>
          <ChevronLeft size={26} />
        </button>
      </div>
      {body}
    </div>
  )
}
