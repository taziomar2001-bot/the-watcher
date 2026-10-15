import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, FilterIcon } from '../components/Icons'
import { discoverCommunities, type Community, type CommunityDiscoveryFilters } from '../data/communities'
import { CommunityCard, CardSkeletons } from './CommunitiesScreen'
import { CommunityFilterSheet } from '../ui/CommunityFilterSheet'
import { SearchField } from '../ui/primitives'
import { useSync } from '../logic/sync'

export function CommunitiesDiscoverScreen() {
  const nav = useNavigate()
  const signedIn = useSync((s) => s.status === 'signedIn')
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [filters, setFilters] = useState<CommunityDiscoveryFilters>({})
  const [filterOpen, setFilterOpen] = useState(false)
  const [items, setItems] = useState<Community[]>([])
  const [hasMore, setHasMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [page, setPage] = useState(0)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250)
    return () => window.clearTimeout(timer)
  }, [search])

  useEffect(() => {
    if (!signedIn) {
      setItems([])
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError(undefined)
    void discoverCommunities(debouncedSearch, filters, page * 24).then((result) => {
      if (!alive) return
      if (!result.ok) {
        setError(result.code)
      } else {
        setItems((previous) => page === 0 ? result.value.items : [...previous, ...result.value.items])
        setHasMore(result.value.hasMore)
      }
      setLoading(false)
    })
    return () => { alive = false }
  }, [signedIn, debouncedSearch, filters, page])

  const updateSearch = (value: string) => {
    setSearch(value)
    setPage(0)
  }
  return (
    <div className="scroll-area route-fade">
      <div className="app-header community-discover-header">
        <button className="icon-round pressable" onClick={() => nav('/communities')} aria-label="Back to your communities">
          <ChevronLeft size={22} />
        </button>
        <div className="community-discover-heading">
          <h1>Discover</h1>
          <div className="sub">Find a community for you</div>
        </div>
      </div>
      <div className="page-pad community-search-controls">
        <SearchField value={search} onChange={updateSearch} placeholder="Search all communities" />
        <button className={`icon-round pressable ${filters.contentType || filters.location ? 'has-filters' : ''}`}
          onClick={() => setFilterOpen(true)} aria-label="Filter communities"><FilterIcon size={20} /></button>
      </div>
      <div className="page-pad">
        {!signedIn ? <div className="empty"><div className="empty-title">Sign in to discover communities</div></div> :
          error ? <div className="empty"><div className="empty-title">Couldn’t load communities</div><div className="empty-sub">{error === 'not_set_up' ? 'Run the community SQL steps in Supabase.' : 'Check your connection and try again.'}</div></div> :
            <>
              {items.map((c) => <CommunityCard key={c.id} c={c} />)}
              {loading && <CardSkeletons n={page === 0 ? 3 : 1} />}
              {!loading && items.length === 0 && <div className="empty"><div className="empty-title">No communities found</div><div className="empty-sub">Try a different search or filter.</div></div>}
              {!loading && hasMore && <button className="sync-btn ghost full pressable community-load-more" onClick={() => setPage((p) => p + 1)}>Show more</button>}
            </>}
      </div>
      {filterOpen && <CommunityFilterSheet filters={filters} onApply={(next) => {
        setFilters(next)
        setPage(0)
        setFilterOpen(false)
      }} onClose={() => setFilterOpen(false)} />}
    </div>
  )
}
