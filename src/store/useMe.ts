import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { getMyProfile, listPendingRequests, type SocialProfile } from '../data/social'

/**
 * The signed-in member's public profile (username, counts…), kept on the
 * device so Profile and Settings render it instantly; refreshed in the
 * background whenever the app opens or something changes.
 */
interface MeState {
  profile: SocialProfile | null
  requests: number
  refresh: () => Promise<void>
  patch: (p: Partial<SocialProfile>) => void
  clear: () => void
}

export const ME_KEY = 'tw-me'

export const useMe = create<MeState>()(
  persist(
    (set, get) => ({
      profile: null,
      requests: 0,
      refresh: async () => {
        const [p, reqs] = await Promise.all([getMyProfile(), listPendingRequests()])
        if (p) set({ profile: p, requests: reqs.length })
      },
      patch: (p) => {
        const cur = get().profile
        if (cur) set({ profile: { ...cur, ...p } })
      },
      clear: () => set({ profile: null, requests: 0 }),
    }),
    { name: ME_KEY, partialize: (s) => ({ profile: s.profile, requests: s.requests }) },
  ),
)

/** The cached profile, but only if it belongs to the account signed in now. */
export function useMyProfile(userId?: string): SocialProfile | null {
  const p = useMe((s) => s.profile)
  return p && userId && p.id === userId ? p : null
}
