import { useEffect } from 'react'

// ---------------------------------------------------------------------------
// App-wide gestures, attached once in App so every drawer and page gets them
// without per-screen code:
//   1. Drag a drawer down by its top pill to put it away.
//   2. The phone's Back button / back gesture closes the open drawer first,
//      instead of leaving the page underneath it.
//   3. Installed iPhone app (no Safari chrome, so no system back swipe):
//      swipe in from the left edge to go back, like a native app.
// ---------------------------------------------------------------------------

const OPEN = 'body > .sheet-backdrop, body > .dialog-backdrop'
const openDrawers = () => document.querySelectorAll<HTMLElement>(OPEN)
const topDrawer = () => {
  const all = openDrawers()
  return all[all.length - 1] as HTMLElement | undefined
}
/** Closing = the same as tapping outside, so every drawer's own close logic runs. */
const closeTop = () => topDrawer()?.click()

// ---- 1. Drag the pill down -------------------------------------------------

function attachDrawerDrag() {
  let drag: null | {
    id: number
    sheet: HTMLElement
    backdrop: HTMLElement
    y0: number
    dy: number
    samples: { t: number; y: number }[]
  } = null

  const onDown = (e: PointerEvent) => {
    if (e.button !== 0 || drag) return
    const handle = (e.target as Element | null)?.closest?.('.sheet-handle')
    const sheet = handle?.closest<HTMLElement>('.sheet')
    const backdrop = sheet?.parentElement
    if (!handle || !sheet || !backdrop?.matches(OPEN)) return
    e.preventDefault()
    ;(handle as HTMLElement).setPointerCapture?.(e.pointerId)
    sheet.style.animation = 'none'
    sheet.style.transition = 'none'
    backdrop.style.animation = 'none'
    drag = { id: e.pointerId, sheet, backdrop, y0: e.clientY, dy: 0, samples: [{ t: e.timeStamp, y: e.clientY }] }
  }
  const onMove = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const raw = e.clientY - drag.y0
    // Down follows the finger; up resists (a drawer is already fully open).
    drag.dy = raw >= 0 ? raw : -Math.min(14, Math.sqrt(-raw) * 2)
    drag.sheet.style.transform = `translateY(${drag.dy}px)`
    const p = Math.max(0, Math.min(1, drag.dy / drag.sheet.offsetHeight))
    drag.backdrop.style.backgroundColor = `rgba(0,0,0,${(0.55 * (1 - p)).toFixed(3)})`
    drag.samples.push({ t: e.timeStamp, y: e.clientY })
    if (drag.samples.length > 6) drag.samples.shift()
  }
  const onUp = (e: PointerEvent) => {
    if (!drag || e.pointerId !== drag.id) return
    const { sheet, backdrop, dy, samples } = drag
    drag = null
    const a = samples[0]
    const b = samples[samples.length - 1]
    const velocity = b.t > a.t ? (b.y - a.y) / (b.t - a.t) : 0 // px per ms
    const h = sheet.offsetHeight
    const dismiss = e.type === 'pointerup' && (dy > Math.min(140, h * 0.3) || (velocity > 0.45 && dy > 24))
    sheet.style.transition = 'transform 200ms cubic-bezier(.2,.8,.2,1)'
    backdrop.style.transition = 'background-color 200ms ease'
    if (!dismiss) {
      sheet.style.transform = ''
      backdrop.style.backgroundColor = ''
      return
    }
    sheet.style.transform = `translateY(${h + 40}px)`
    backdrop.style.backgroundColor = 'rgba(0,0,0,0)'
    setTimeout(() => {
      backdrop.click()
      // A drawer that refuses to close (e.g. mid-save) slides back up.
      requestAnimationFrame(() => {
        if (!backdrop.isConnected) return
        sheet.style.transform = ''
        backdrop.style.backgroundColor = ''
      })
    }, 170)
  }
  document.addEventListener('pointerdown', onDown)
  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
  document.addEventListener('pointercancel', onUp)
  return () => {
    document.removeEventListener('pointerdown', onDown)
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
    document.removeEventListener('pointercancel', onUp)
  }
}

// ---- 2. Back closes the drawer ---------------------------------------------
// Each open drawer gets one history entry (same URL, same router index). Back
// pops it and closes the drawer; closing a drawer any other way removes its
// entry again, so the history stack never fills up with drawers.

let pushed = 0 // drawer entries currently on the stack
let pushedHref = ''
let ignorePops = 0

const level = () => {
  const st = window.history.state as { twDrawer?: number } | null
  return st?.twDrawer ?? 0
}

function reconcile() {
  const n = openDrawers().length
  if (n > pushed) {
    if (pushed === 0) pushedHref = location.href
    while (pushed < n) {
      pushed++
      window.history.pushState({ ...(window.history.state ?? {}), twDrawer: pushed }, '')
    }
  } else if (n < pushed) {
    // Closed because the app navigated somewhere: leave those entries; they're
    // skipped automatically if Back ever lands on one.
    if (location.href !== pushedHref || level() !== pushed) {
      pushed = n
      return
    }
    const d = pushed - n
    pushed = n
    ignorePops++
    window.history.go(-d)
  }
}

let reconcileTimer: ReturnType<typeof setTimeout> | undefined
const scheduleReconcile = () => {
  clearTimeout(reconcileTimer)
  reconcileTimer = setTimeout(reconcile, 0)
}

/** Run after any drawer's history entry is gone (use before nav(-1) from inside a drawer). */
export function whenDrawersSettled(fn: () => void) {
  const check = (tries: number) => {
    if ((ignorePops === 0 && pushed === openDrawers().length) || tries > 40) fn()
    else setTimeout(() => check(tries + 1), 25)
  }
  setTimeout(() => check(0), 25)
}

function attachBackClosesDrawers() {
  const onPop = () => {
    if (ignorePops > 0) {
      ignorePops--
      return
    }
    const n = openDrawers().length
    const lv = level()
    if (n > lv) {
      pushed = lv
      closeTop()
      setTimeout(reconcile, 60) // still open (refused to close) → re-arm Back
    } else if (lv > 0 && n === 0) {
      window.history.back() // a leftover drawer entry: skip it
    }
  }
  const mo = new MutationObserver(scheduleReconcile)
  mo.observe(document.body, { childList: true })
  window.addEventListener('popstate', onPop)
  return () => {
    mo.disconnect()
    window.removeEventListener('popstate', onPop)
  }
}

// ---- 3. Edge swipe back (installed iPhone app) -----------------------------

const isIosStandalone = () => (navigator as Navigator & { standalone?: boolean }).standalone === true

function currentPage(): HTMLElement | undefined {
  const pages = document.querySelectorAll<HTMLElement>('#root .scroll-area')
  return pages[pages.length - 1]
}
function backButton(page: HTMLElement) {
  return page.querySelector<HTMLElement>('[aria-label^="Back"]')
}

function attachEdgeSwipe() {
  const EDGE = 24
  let s: null | { x0: number; y0: number; t0: number; page: HTMLElement; back: HTMLElement; engaged: boolean; dx: number; lastT: number; lastX: number; v: number } = null

  const onStart = (e: TouchEvent) => {
    if (s || e.touches.length !== 1 || openDrawers().length) return
    const t = e.touches[0]
    if (t.clientX > EDGE) return
    const page = currentPage()
    const back = page && backButton(page)
    if (!page || !back) return
    s = { x0: t.clientX, y0: t.clientY, t0: e.timeStamp, page, back, engaged: false, dx: 0, lastT: e.timeStamp, lastX: t.clientX, v: 0 }
  }
  const onMove = (e: TouchEvent) => {
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x0
    const dy = t.clientY - s.y0
    if (!s.engaged) {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) return void (s = null) // a scroll
      if (dx < 8) return
      s.engaged = true
      s.page.style.transition = 'none'
      s.page.style.animation = 'none'
      s.page.classList.add('edge-swiping')
    }
    e.preventDefault()
    s.dx = Math.max(0, dx)
    if (e.timeStamp > s.lastT) s.v = (t.clientX - s.lastX) / (e.timeStamp - s.lastT)
    s.lastT = e.timeStamp
    s.lastX = t.clientX
    s.page.style.transform = `translateX(${s.dx}px)`
  }
  const onEnd = (e: TouchEvent) => {
    if (!s) return
    const { page, back, engaged, dx, v } = s
    s = null
    if (!engaged) return
    const w = page.offsetWidth
    const go = e.type === 'touchend' && (dx > w * 0.35 || (v > 0.35 && dx > 30))
    page.style.transition = 'transform 180ms cubic-bezier(.2,.8,.2,1)'
    page.style.transform = go ? `translateX(${w}px)` : ''
    setTimeout(() => {
      if (go) back.click()
      requestAnimationFrame(() => {
        page.style.transition = ''
        page.style.transform = ''
        page.style.animation = ''
        page.classList.remove('edge-swiping')
      })
    }, go ? 170 : 190)
  }
  document.addEventListener('touchstart', onStart, { passive: true })
  document.addEventListener('touchmove', onMove, { passive: false })
  document.addEventListener('touchend', onEnd)
  document.addEventListener('touchcancel', onEnd)
  return () => {
    document.removeEventListener('touchstart', onStart)
    document.removeEventListener('touchmove', onMove)
    document.removeEventListener('touchend', onEnd)
    document.removeEventListener('touchcancel', onEnd)
  }
}

/** Mount once inside the router. */
export function useAppGestures() {
  useEffect(() => {
    const off = [attachDrawerDrag(), attachBackClosesDrawers(), isIosStandalone() ? attachEdgeSwipe() : () => {}]
    return () => off.forEach((f) => f())
  }, [])
}
