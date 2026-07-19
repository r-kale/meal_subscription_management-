import { NavLink, Outlet } from 'react-router-dom'
import { useApp } from '../state/AppContext'

const TABS = [
  { to: '/', icon: '🏠', label: 'Home' },
  { to: '/attendance', icon: '✅', label: 'Attendance' },
  { to: '/customers', icon: '👥', label: 'Customers' },
  { to: '/reports', icon: '📊', label: 'Reports' },
  { to: '/settings', icon: '⚙️', label: 'More' },
]

export function AppShell() {
  const { session } = useApp()
  return (
    <div className="app-shell">
      {session.isDemo && (
        <div className="demo-banner" data-testid="demo-banner">
          DEMO MODE — data stays on this device only
        </div>
      )}
      <Outlet />
      <nav className="tabbar">
        {TABS.map((t) => (
          <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
            <span className="icon">{t.icon}</span>
            {t.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}
