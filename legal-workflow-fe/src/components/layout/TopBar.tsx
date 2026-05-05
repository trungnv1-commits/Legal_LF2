import { useLocation } from 'react-router-dom'
import { Bell } from '@phosphor-icons/react'
import { useAuthStore } from '../../stores/auth.store'

const PAGE_TITLES: Record<string, string> = {
  '/legal': 'Dashboard',
  '/legal/tasks': 'My Tasks',
  '/legal/tasks/new': 'Create Task',
  '/legal/config/tst': 'Config TST',
  '/legal/config/filters': 'Filters',
  '/legal/reports/sla': 'SLA Report',
  '/legal/reports/workload': 'Workload',
  '/legal/settings': 'Settings',
}

export function TopBar() {
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const displayName = user?.emp_name || 'User'
  const initials = displayName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()

  // Resolve page title
  let pageTitle = PAGE_TITLES[location.pathname] || ''
  if (!pageTitle && location.pathname.startsWith('/legal/tasks/')) {
    pageTitle = 'Task Detail'
  }

  return (
    <header className="flex items-center justify-between px-6 py-3 bg-white border-b border-gray-200 sticky top-0 z-10">
      <h1 className="text-lg font-semibold text-gray-800">{pageTitle}</h1>
      <div className="flex items-center gap-4">
        <button className="relative p-2 text-gray-500 hover:text-navy-600 hover:bg-gray-100 rounded-lg transition-colors duration-150" aria-label="Notifications">
          <Bell size={22} weight="regular" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-full bg-navy-600 flex items-center justify-center text-white text-xs font-bold">
            {initials}
          </div>
          <span className="text-sm font-medium text-gray-700 hidden sm:block">{displayName}</span>
        </div>
      </div>
    </header>
  )
}
