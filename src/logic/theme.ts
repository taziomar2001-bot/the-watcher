import { create } from 'zustand'

export type ThemePref = 'system' | 'light' | 'dark'
const KEY = 'tw-theme'
const mq = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

/** Resolve and apply: sets <html data-theme> and the browser/status-bar colour. */
function apply(pref: ThemePref) {
  const theme = pref === 'system' ? (mq?.matches ? 'light' : 'dark') : pref
  document.documentElement.dataset.theme = theme
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#ffffff' : '#000000')
  return theme
}

interface ThemeState {
  pref: ThemePref
  theme: 'light' | 'dark'
  setPref: (p: ThemePref) => void
}

export const useTheme = create<ThemeState>((set) => {
  const pref = readPref()
  return {
    pref,
    theme: typeof document !== 'undefined' ? (apply(pref) as 'light' | 'dark') : 'dark',
    setPref: (p) => {
      try {
        localStorage.setItem(KEY, p)
      } catch {
        /* ignore */
      }
      set({ pref: p, theme: apply(p) as 'light' | 'dark' })
    },
  }
})

// Follow the device when set to "system".
mq?.addEventListener?.('change', () => {
  const { pref } = useTheme.getState()
  if (pref === 'system') useTheme.setState({ theme: apply('system') as 'light' | 'dark' })
})
