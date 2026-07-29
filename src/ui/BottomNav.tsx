import { NavLink } from 'react-router-dom'
import { TvIcon, ClapperboardIcon, CalendarIcon, SearchIcon, PersonIcon } from '../components/Icons'

const items = [
  { to: '/tv', label: 'Shows', Icon: TvIcon },
  { to: '/movies', label: 'Movies', Icon: ClapperboardIcon },
  { to: '/upcoming', label: 'Upcoming', Icon: CalendarIcon },
  { to: '/discover', label: 'Discover', Icon: SearchIcon },
  { to: '/profile', label: 'Profile', Icon: PersonIcon },
]

export function BottomNav() {
  return (
    <nav className="bottom-nav">
      {items.map(({ to, label, Icon }) => (
        <NavLink key={to} to={to} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
          {({ isActive }) => (
            <>
              <Icon size={24} strokeWidth={isActive ? 2.1 : 1.7} />
              <span className="nav-label">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
