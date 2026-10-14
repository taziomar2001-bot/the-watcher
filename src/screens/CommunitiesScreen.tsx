import { PeopleIcon } from '../components/Icons'

/** Communities arrive in Wave 5. Until then, an honest placeholder — no sample groups. */
export function CommunitiesScreen() {
  return (
    <div className="scroll-area route-fade">
      <div className="app-header">
        <div>
          <h1>Communities</h1>
          <div className="sub">Groups for the shows and films you love</div>
        </div>
      </div>
      <div className="empty" style={{ paddingTop: 48 }}>
        <div className="soon-icon">
          <PeopleIcon size={30} />
        </div>
        <div className="empty-title">Coming soon</div>
        <div className="empty-sub">
          Join or create communities with announcements, group chat and moderators. In the meantime, find friends from the search bar in Discover.
        </div>
      </div>
    </div>
  )
}
