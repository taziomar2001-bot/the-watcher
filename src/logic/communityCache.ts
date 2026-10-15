import { useSync } from './sync'
import { useCached } from '../utils/cache'
import { myCommunities, type MyCommunity } from '../data/communities'

/** Communities I'm in, shown instantly from the last copy and refreshed quietly. */
export function useMyCommunities() {
  const uid = useSync((s) => (s.status === 'signedIn' ? s.userId : undefined))
  const r = useCached<MyCommunity[] | { error: string }>(uid ? `mine:${uid}` : null, async () => {
    const res = await myCommunities()
    if (res.ok) return res.value
    return res.code === 'not_set_up' ? { error: 'not_set_up' } : undefined
  })
  const list = Array.isArray(r.data) ? r.data : undefined
  const error = r.data && !Array.isArray(r.data) ? r.data.error : r.failed ? 'error' : undefined
  return { list, error, reload: r.reload }
}
