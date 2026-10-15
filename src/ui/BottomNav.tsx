import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { GridIcon, CalendarIcon, SearchIcon, PeopleIcon, PersonIcon } from '../components/Icons'
import { isContentPath, lastContentPath, nextContentPath } from '../logic/content'

const items = [
  { to: '/content', label: 'Content', Icon: GridIcon },
  { to: '/upcoming', label: 'Upcoming', Icon: CalendarIcon },
  { to: '/discover', label: 'Discover', Icon: SearchIcon },
  { to: '/communities', label: 'Communities', Icon: PeopleIcon },
  { to: '/profile', label: 'Profile', Icon: PersonIcon },
]

export function BottomNav() {
  const { pathname } = useLocation()
  const nav = useNavigate()
  return (
    <nav className="bottom-nav">
      {items.map(({ to, label, Icon }) => {
        const isContent = to === '/content'
        const active = isContent ? isContentPath(pathname) : pathname === to || pathname.startsWith(to + '/')
        return (
          <NavLink
            key={to}
            to={isContent ? lastContentPath() : to}
            className={`nav-item ${active ? 'active' : ''}`}
            onClick={(e) => {
              // Already on a content tab: step to the next kind (Books → Movies → TV Shows → Games → …).
              if (!isContent || !isContentPath(pathname)) return
              e.preventDefault()
              nav(nextContentPath(pathname), { replace: true })
            }}
          >
            <Icon size={24} strokeWidth={active ? 2.1 : 1.7} />
            <span className="nav-label">{label}</span>
          </NavLink>
        )
      })}
    </nav>
  )
}
