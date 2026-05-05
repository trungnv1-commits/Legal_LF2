import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { SkeletonCard } from '../components/SkeletonLoader'
import { EmptyState } from '../components/EmptyState'
import { ClipboardText, Clock, CheckCircle, XCircle, Copyright, Trademark, Scales, FileText as FileTextIcon, ArrowRight } from '@phosphor-icons/react'

interface DashboardData {
  summary: { pending: number; in_progress: number; completed: number; overdue: number }
  by_type: { copyright: number; trademark: number; policy: number; contract: number }
  recent_tasks?: { tsi_id: string; tsi_code: string; title: string; type: string; status: string; created_at: string }[]
}

export function DashboardPage() {
  const navigate = useNavigate()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api.get('/api/legal/dashboard')
      .then((res) => { const d = res.data?.data || res.data; setData(d?.summary ? d : null) })
      .catch((err) => setError(err.message || 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return (
    <div data-testid="dashboard-page">
      <div className="animate-pulse bg-gray-200 rounded h-8 w-40 mb-6" />
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
      </div>
    </div>
  )

  if (error) return <div data-testid="dashboard-page"><div data-testid="error-state" className="text-red-500">Error: {error}</div></div>

  const goTasks = (q: string) => navigate("/legal/tasks?" + q)

  return (
    <div data-testid="dashboard-page">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold font-heading">Dashboard</h2>
        <span className="text-sm text-gray-500">Total: <strong>{(data?.summary?.pending ?? 0) + (data?.summary?.in_progress ?? 0) + (data?.summary?.completed ?? 0)}</strong> tasks</span>
      </div>

      {/* Summary Cards - Apero HR style: icon in colored box */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <div data-testid="card-pending" onClick={() => goTasks("status=PENDING")}
          className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 cursor-pointer p-5 group"
          role="button" tabIndex={0} aria-label="View pending tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("status=PENDING")}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Pending</p>
              <p className="text-3xl font-bold font-heading mt-1">{data?.summary?.pending ?? 0}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center">
              <Clock size={22} weight="duotone" className="text-amber-500" />
            </div>
          </div>
          <p className="text-xs text-navy-600 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">View tasks <ArrowRight size={12} weight="bold" /></p>
        </div>

        <div data-testid="card-in_progress" onClick={() => goTasks("status=IN_PROGRESS")}
          className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 cursor-pointer p-5 group"
          role="button" tabIndex={0} aria-label="View in-progress tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("status=IN_PROGRESS")}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">In Progress</p>
              <p className="text-3xl font-bold font-heading mt-1">{data?.summary?.in_progress ?? 0}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
              <ClipboardText size={22} weight="duotone" className="text-blue-500" />
            </div>
          </div>
          <p className="text-xs text-navy-600 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">View tasks <ArrowRight size={12} weight="bold" /></p>
        </div>

        <div data-testid="card-completed" onClick={() => goTasks("status=COMPLETED")}
          className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 cursor-pointer p-5 group"
          role="button" tabIndex={0} aria-label="View completed tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("status=COMPLETED")}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Completed</p>
              <p className="text-3xl font-bold font-heading mt-1">{data?.summary?.completed ?? 0}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-green-50 flex items-center justify-center">
              <CheckCircle size={22} weight="duotone" className="text-green-500" />
            </div>
          </div>
          <p className="text-xs text-navy-600 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">View tasks <ArrowRight size={12} weight="bold" /></p>
        </div>

        <div data-testid="card-overdue" onClick={() => goTasks("status=OVERDUE")}
          className="bg-white rounded-xl border border-gray-200 hover:shadow-lg transition-all duration-200 cursor-pointer p-5 group"
          role="button" tabIndex={0} aria-label="View overdue tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("status=OVERDUE")}>
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm font-medium text-gray-500">Overdue</p>
              <p className="text-3xl font-bold font-heading mt-1">{data?.summary?.overdue ?? 0}</p>
            </div>
            <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
              <XCircle size={22} weight="duotone" className="text-red-500" />
            </div>
          </div>
          <p className="text-xs text-navy-600 mt-3 opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-center gap-1">View tasks <ArrowRight size={12} weight="bold" /></p>
        </div>
      </div>

      {/* By Type - icon in colored box */}
      <div data-testid="by-type-section">
        <h3 className="text-lg font-semibold font-heading mb-4">By Type</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div onClick={() => goTasks("type_l1=COPYRIGHT")} className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer p-4 group" role="button" tabIndex={0} aria-label="View copyright tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("type_l1=COPYRIGHT")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-purple-50 flex items-center justify-center">
                <Copyright size={20} weight="duotone" className="text-purple-500" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Copyright</h4>
                <p className="text-xl font-bold font-heading">{data?.by_type?.copyright ?? 0}</p>
              </div>
            </div>
          </div>
          <div onClick={() => goTasks("type_l1=TRADEMARK")} className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer p-4 group" role="button" tabIndex={0} aria-label="View trademark tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("type_l1=TRADEMARK")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                <Trademark size={20} weight="duotone" className="text-indigo-500" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Trademark</h4>
                <p className="text-xl font-bold font-heading">{data?.by_type?.trademark ?? 0}</p>
              </div>
            </div>
          </div>
          <div onClick={() => goTasks("type_l1=POLICY")} className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer p-4 group" role="button" tabIndex={0} aria-label="View policy tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("type_l1=POLICY")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-teal-50 flex items-center justify-center">
                <Scales size={20} weight="duotone" className="text-teal-500" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Policy</h4>
                <p className="text-xl font-bold font-heading">{data?.by_type?.policy ?? 0}</p>
              </div>
            </div>
          </div>
          <div onClick={() => goTasks("type_l1=CONTRACT")} className="bg-white rounded-xl border border-gray-200 hover:shadow-md transition-all duration-200 cursor-pointer p-4 group" role="button" tabIndex={0} aria-label="View contract tasks" onKeyDown={(e) => e.key === 'Enter' && goTasks("type_l1=CONTRACT")}>
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-orange-50 flex items-center justify-center">
                <FileTextIcon size={20} weight="duotone" className="text-orange-500" />
              </div>
              <div>
                <h4 className="text-sm font-medium text-gray-500">Contract</h4>
                <p className="text-xl font-bold font-heading">{data?.by_type?.contract ?? 0}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Tasks - cleaner table style */}
      {data?.recent_tasks && data.recent_tasks.length > 0 ? (
        <div className="mt-8">
          <h3 className="text-lg font-semibold font-heading mb-4">Recent Tasks</h3>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="bg-gray-50 border-b border-gray-200"><th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Code</th><th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Title</th><th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th><th className="text-left p-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th></tr></thead>
              <tbody>
                {data.recent_tasks.map((t) => (
                  <tr key={t.tsi_id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors duration-150" onClick={() => navigate('/legal/tasks/' + t.tsi_id)}>
                    <td className="p-3 font-mono text-xs text-gray-600">{t.tsi_code}</td>
                    <td className="p-3 font-medium text-gray-800">{t.title}</td>
                    <td className="p-3 text-gray-500">{t.type}</td>
                    <td className="p-3"><span className={'px-2.5 py-0.5 rounded-full text-xs font-medium ' + (t.status === 'APPROVED' ? 'bg-green-100 text-green-800' : t.status === 'REJECTED' ? 'bg-red-100 text-red-800' : t.status === 'SUBMITTED' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-800')}>{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : !loading && (
        <div className="mt-8">
          <EmptyState icon="tasks" title="No recent tasks" description="Tasks will appear here once created." actionLabel="Create Task" onAction={() => navigate('/legal/tasks/new')} />
        </div>
      )}
    </div>
  )
}
