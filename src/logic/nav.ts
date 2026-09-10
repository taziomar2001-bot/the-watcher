import { useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

// ---------------------------------------------------------------------------
// Hierarchical back navigation.
//
// React Router keeps an integer `idx` on window.history.state for every entry
// in the stack. We record which pathname lives at each index as the user moves
// around, so a "Back" control can decide, deterministically:
//   - if the entry directly BELOW the current one is the hierarchical parent,
//     pop it (nav(-1)) — this keeps the history stack clean so the browser /
//     OS back gesture lands on the same place as the button; and
//   - otherwise navigate to the parent explicitly (a push), so Back still goes
//     UP the content hierarchy rather than to the chronologically previous page.
//
// Combined with lateral moves using { replace: true } (e.g. swiping between
// episodes), this makes the stack mirror the content hierarchy, so buttons and
// gestures agree everywhere.
// ---------------------------------------------------------------------------

const byIdx: Record<number, string> = {}

function currentIdx(): number {
  const st = window.history.state as { idx?: number } | null
  return st && typeof st.idx === 'number' ? st.idx : 0
}

/** Mount once (inside the Router) to keep the index→pathname map current. */
export function useNavTracker() {
  const loc = useLocation()
  useEffect(() => {
    byIdx[currentIdx()] = loc.pathname
  }, [loc])
}

/**
 * Returns goUp(parentPath): navigate to the hierarchical parent. Pops when the
 * parent is the entry immediately below (clean, gesture-consistent); otherwise
 * pushes the parent route so Back is always hierarchical, never chronological.
 */
export function useUpNavigation() {
  const nav = useNavigate()
  return (parentPath: string) => {
    if (byIdx[currentIdx() - 1] === parentPath) nav(-1)
    else nav(parentPath)
  }
}
