import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import api from '../services/api'
import { SkeletonTable } from '../components/SkeletonLoader'
import { EmptyState } from '../components/EmptyState'

interface Task {
  tsi_id: string
  tsi_code: string
  title: string
  tst_l1_name: string
  status: string
  due_date: string
  submitted_by_name?: string
  assigned_to?: string
  assigned_to_name?: string
}

interface TasksResponse {
  items: Task[]
  total: number
  page: number
  page_size: number
}

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  SUBMITTED: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-blue-800',
  PENDING: 'bg-gray-100 text-gray-800',
  REJECTED: 'bg-red-100 text-red-800',
}

export function MyTasksPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [data, setData] = useState<TasksResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(1)
  const [pageSize] = useState(10)
  const [filterType, setFilterType] = useState(searchParams.get('type_l1') || '')
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') || '')

  useEffect(() => {
    setLoading(true)
    const params: Record<string, string | number> = { page, page_size: pageSize }
    if (filterType) params.type_l1 = filterType
    if (filterStatus) params.status = filterStatus
    if (search) params.search = search

    api
      .get('/api/legal/my-tasks', { params })
      .then((res) => setData(res.data?.data || res.data))
      .catch(() => setData({ items: [], total: 0, page: 1, page_size: pageSize }))
      .finally(() => setLoading(false))
  }, [page, pageSize, filterType, filterStatus, search])

  const totalPages = data ? Math.ceil(data.total / pageSize) : 0

  return (
    <div data-testid="my-tasks-page">
      <h2 className="text-2xl font-bold font-heading mb-6">My Tasks</h2>

      {/* Filter Bar */}
      <div data-testid="filter-bar" className="flex gap-4 mb-4 flex-wrap">
        <select
          data-testid="filter-type"
          className="border rounded px-3 py-2 transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
          value={filterType}
          onChange={(e) => { setFilterType(e.target.value); setPage(1) }}
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          <option value="COPYRIGHT">Copyright</option>
          <option value="TRADEMARK">Trademark</option>
          <option value="POLICY">Policy</option>
          <option value="CONTRACT">Contract</option>
        </select>

        <select
          data-testid="filter-status"
          className="border rounded px-3 py-2 transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
          value={filterStatus}
          onChange={(e) => { setFilterStatus(e.target.value); setPage(1) }}
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="PENDING">Pending</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="COMPLETED">Completed</option>
          <option value="APPROVED">Approved</option>
          <option value="SUBMITTED">Submitted</option>
          <option value="REJECTED">Rejected</option>
        </select>
        <input type="text" placeholder="Search title or code..."
          className="border rounded px-3 py-2 flex-1 min-w-[200px] transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
          value={search} onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          aria-label="Search tasks" />
      </div>

      {/* Table */}
      {loading ? (
        <SkeletonTable rows={5} cols={8} />
      ) : data && data?.items?.length > 0 ? (
        <>
          <table data-testid="tasks-table" className="w-full bg-white rounded-lg shadow">
            <thead>
              <tr className="border-b bg-navy-600 text-white">
                <th className="text-left p-3 font-semibold">Code</th>
                <th className="text-left p-3">Title</th>
                <th className="text-left p-3">Submitted By</th>
                <th className="text-left p-3">Type</th>
                <th className="text-left p-3">Status</th>
                <th className="text-left p-3">Assigned To</th>
                <th className="text-left p-3">Due Date</th>
                <th className="text-left p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((task, i) => (
                <tr
                  key={task.tsi_id}
                  className={"border-b hover:bg-gray-50 cursor-pointer transition-colors duration-150 " + (i % 2 === 0 ? "" : "bg-gray-50/50")}
                  onClick={() => navigate(`/legal/tasks/${task.tsi_id}`)}
                >
                  <td className="p-3 font-mono text-sm">{task.tsi_code}</td>
                  <td className="p-3">{task.title}</td>
                  <td className="p-3 text-sm">{task.submitted_by_name || '-'}</td>
                  <td className="p-3">{task.tst_l1_name}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[task.status] || 'bg-gray-100'}`}>
                      {task.status}
                    </span>
                  </td>
                  <td className="p-3 text-sm">{task.assigned_to_name || task.assigned_to || "-"}</td>
                  <td className={"p-3 " + (task.due_date && new Date(task.due_date) < new Date() ? "text-red-600 font-semibold" : task.due_date && new Date(task.due_date).toDateString() === new Date().toDateString() ? "text-orange-600 font-medium" : "")}>{task.due_date}</td>
                  <td className="p-3">
                    <button
                      className="text-navy-600 hover:text-navy-800 hover:underline text-sm transition-colors duration-150"
                      onClick={(e) => { e.stopPropagation(); navigate(`/legal/tasks/${task.tsi_id}`) }}
                      aria-label={`View task ${task.tsi_code}`}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {totalPages > 1 && (
            <div data-testid="pagination" className="flex justify-center gap-2 mt-4">
              <button
                className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50 transition-colors duration-150"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Previous page"
              >
                Previous
              </button>
              <span className="px-3 py-1" aria-live="polite">
                Page {page} of {totalPages}
              </span>
              <button
                className="px-3 py-1 border rounded disabled:opacity-50 hover:bg-gray-50 transition-colors duration-150"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Next page"
              >
                Next
              </button>
            </div>
          )}
        </>
      ) : (
        <EmptyState
          icon="search"
          title="No tasks found"
          description={search || filterType || filterStatus ? "Try adjusting your filters or search query." : "Create your first task to get started."}
          actionLabel="Create Task"
          onAction={() => navigate('/legal/tasks/new')}
        />
      )}
    </div>
  )
}
