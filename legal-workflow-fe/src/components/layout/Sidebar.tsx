import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../stores/auth.store'
import {
  SquaresFour,
  ClipboardText,
  Plus,
  Wrench,
  Funnel,
  Clock,
  ChartBar,
  Gear,
  SignOut,
  Buildings,
} from '@phosphor-icons/react'

const commonMenuItems = [
  { path: '/legal', label: 'Dashboard', icon: SquaresFour },
  { path: '/legal/tasks', label: 'My Tasks', icon: ClipboardText },
  { path: '/legal/tasks/new', label: 'Create Task', icon: Plus },
]

const adminMenuItems = [
  { path: '/legal/config/tst', label: 'Config TST', icon: Wrench },
  { path: '/legal/config/filters', label: 'Filters', icon: Funnel },
  { path: '/legal/reports/sla', label: 'SLA Report', icon: Clock },
  { path: '/legal/reports/workload', label: 'Workload', icon: ChartBar },
  { path: '/legal/settings', label: 'Settings', icon: Gear },
]

export function Sidebar() {
  const { user, clearAuth } = useAuthStore()
  const empsec = user?.empsec || 'SEC1'
  const isAdmin = empsec === 'SEC4' || user?.role === 'ADMIN'
  const displayName = user?.emp_name || 'User'
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  return (
    <aside className="w-56 bg-white border-r border-gray-200 h-screen sticky top-0 flex flex-col" data-testid="sidebar">
      {/* Logo */}
      <div className="px-4 py-4 flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
          <Buildings size={18} weight="duotone" className="text-white" />
        </div>
        <h1 className="text-base font-bold text-gray-900 tracking-tight">Legal Workflow</h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-2 overflow-y-auto" aria-label="Main navigation">
        <ul className="space-y-1">
          {[...commonMenuItems, ...(isAdmin ? adminMenuItems : [])].map((item) => {
            const Icon = item.icon
            return (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === '/legal'}
                  className={({ isActive }) =>
                    `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                      isActive
                        ? 'bg-blue-50 text-blue-600 border-l-3 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`
                  }
                  data-testid={`menu-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  aria-label={item.label}
                >
                  <Icon size={20} weight="regular" className="shrink-0" aria-hidden="true" />
                  <span>{item.label}</span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-gray-200">
        {user && (
          <div className="flex items-center gap-2.5 mb-3 px-1">
            <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-gray-900 truncate">{displayName}</p>
              <p className="text-xs text-blue-600">{user.role_legal || 'User'}</p>
            </div>
          </div>
        )}
        <button
          onClick={() => { clearAuth(); window.location.href = '/login' }}
          className="w-full flex items-center gap-2 text-left px-3 py-2 rounded-lg text-sm text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition-colors duration-150"
          data-testid="btn-switch-user"
          aria-label="Switch user or logout"
        >
          <SignOut size={18} weight="regular" aria-hidden="true" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  )
}

const menuItems = [...commonMenuItems, ...adminMenuItems]
export { menuItems }
