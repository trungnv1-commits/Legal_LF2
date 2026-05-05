import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { SkipToContent } from '../SkipToContent'
import { ErrorBoundary } from '../ErrorBoundary'

export function AppLayout() {
  return (
    <div className="flex h-screen bg-surface">
      <SkipToContent />
      <Sidebar />
      <main id="main-content" className="flex-1 overflow-y-auto p-6" role="main">
        <ErrorBoundary>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  )
}
