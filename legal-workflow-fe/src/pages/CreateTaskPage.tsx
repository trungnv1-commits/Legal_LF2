import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'

const TST_L1_OPTIONS = [
  { value: 'TST-001', label: 'Copyright Check (LF210)' },
  { value: 'TST-010', label: 'Trademark Check (LF220)' },
  { value: 'TST-021', label: 'Policy Review (LF230)' },
  { value: 'TST-034', label: 'Contract Review (LF240)' },
]

const FILTER_FIELDS: Record<string, { filter_type: string; label: string; placeholder: string; required?: boolean }[]> = {
  'TST-001': [
    { filter_type: 'PT', label: 'Product Code *', placeholder: 'vd: APB648', required: true },
    { filter_type: 'PT_NAME', label: 'Product Name *', placeholder: 'vd: Caller ID Spam Call', required: true },
  ],
  'TST-010': [
    { filter_type: 'PT', label: 'Product Code', placeholder: 'vd: APB648' },
    { filter_type: 'LE', label: 'Legal Entity', placeholder: 'vd: APERO-SG' },
    { filter_type: 'CTY', label: 'Country', placeholder: 'vd: US, VN' },
    { filter_type: 'TUT', label: 'Urgency', placeholder: 'NORMAL / URGENT' },
  ],
  'TST-021': [
    { filter_type: 'PT', label: 'Product Code', placeholder: 'vd: APB648' },
    { filter_type: 'LE', label: 'Legal Entity', placeholder: 'vd: APERO-SG' },
    { filter_type: 'TUT', label: 'Urgency', placeholder: 'NORMAL / URGENT' },
  ],
  'TST-034': [
    { filter_type: 'PT', label: 'Product Code', placeholder: 'vd: APB648' },
    { filter_type: 'LE', label: 'Legal Entity', placeholder: 'vd: APERO-VN' },
    { filter_type: 'CTY', label: 'Country', placeholder: 'vd: VN, SG' },
    { filter_type: 'TLT', label: 'Transaction Type', placeholder: 'DOMESTIC / CROSS_BORDER' },
    { filter_type: 'TUT', label: 'Urgency', placeholder: 'NORMAL / URGENT' },
  ],
}


const FILTER_OPTIONS: Record<string, string[]> = {
  PT: ['APB648', 'APB102', 'APB205', 'APB301', 'APB410', 'APB520'],
  LE: ['APERO-VN', 'APERO-SG', 'APERO-US', 'APERO-JP'],
  CTY: ['VN', 'SG', 'US', 'JP', 'KR', 'TH', 'ID'],
  CDT: ['HQ1', 'AST', 'SAP', 'TDA', 'TAD', 'TAM', 'TTE'],
  TUT: ['NORMAL', 'URGENT'],
  TLT: ['DOMESTIC', 'CROSS_BORDER'],
}

export function CreateTaskPage() {
  const navigate = useNavigate()
  const [tstId, setTstId] = useState('')
  const [title, setTitle] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [filterValues, setFilterValues] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)
    try {
      // Validate required filters
      const currentFilters = FILTER_FIELDS[tstId] || []
      for (const f of currentFilters) {
        if (f.required && !filterValues[f.filter_type]?.trim()) {
          setError(`${f.label.replace(' *', '')} is required`)
          setSubmitting(false)
          return
        }
      }
      const filters = Object.entries(filterValues)
        .filter(([, v]) => v.trim() !== '')
        .map(([filter_type, filter_code]) => ({ filter_type, filter_code: filter_code.trim() }))
      const payload = { tst_id: tstId, title, priority: 'MEDIUM', due_date: dueDate || undefined, filters }
      const res = await api.post('/api/legal/task/', payload)
      const tsiId = res.data?.data?.tsi_id
      setSuccess('Task created: ' + tsiId)
      if (tsiId) setTimeout(() => navigate('/legal/tasks/' + tsiId), 1500)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { detail?: string }; status?: number } }
        setError('Error: ' + JSON.stringify(axErr.response?.data?.detail || axErr.response?.status))
      } else {
        setError(err instanceof Error ? err.message : 'Failed')
      }
    } finally { setSubmitting(false) }
  }

  const filterFields = tstId ? FILTER_FIELDS[tstId] || [] : []

  return (
    <div data-testid="create-task-page">
      <h2 className="text-2xl font-bold font-heading mb-6">Create Task</h2>
      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 max-w-2xl">
        {error && <div data-testid="error-message" className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>}
        {success && <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{success}</div>}

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Task Type</label>
          <select data-testid="select-tst-l1" className="w-full border rounded px-3 py-2 transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600" value={tstId}
            onChange={(e) => {
              const v = e.target.value; setTstId(v); setFilterValues({})
              // Auto deadline T+1 for LF210, LF220, LF240
              if (v === 'TST-001' || v === 'TST-010' || v === 'TST-034') {
                const d = new Date(); d.setDate(d.getDate() + 1)
                setDueDate(d.toISOString().split('T')[0])
              } else if (v === 'TST-021') {
                const d = new Date(); d.setDate(d.getDate() + 2)
                setDueDate(d.toISOString().split('T')[0])
              } else { setDueDate('') }
            }} required>
            <option value="">Select Type...</option>
            {TST_L1_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
          <input data-testid="input-title" type="text" className="w-full border rounded px-3 py-2 transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600"
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="vd: CopyrightReview - Caller ID App" required />
        </div>



        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
          <input type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            readOnly={tstId !== 'TST-034'}
            className={"w-full border rounded px-3 py-2 transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600 " + (tstId === 'TST-034' ? '' : 'bg-gray-50 text-gray-600')} />
          {tstId && tstId !== 'TST-034' && <p className="text-xs text-gray-400 mt-1">Auto-set based on task type</p>}
        </div>

        {filterFields.length > 0 && (
          <div data-testid="dynamic-fields" className="mb-4 border-t pt-4">
            <h3 className="text-sm font-semibold text-gray-600 mb-3">Filters</h3>
            {filterFields.map((f) => (
              <div key={f.filter_type} className="mb-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label} <span className="text-gray-400">({f.filter_type})</span>
                </label>
                <input type="text" list={`list-${f.filter_type}`}
                  className={`w-full border rounded px-3 py-2 transition-colors duration-150 focus:border-navy-600 focus:ring-1 focus:ring-navy-600 ${f.required ? 'border-navy-300 bg-navy-50' : ''}`}
                  value={filterValues[f.filter_type] || ''}
                  onChange={(e) => setFilterValues(prev => ({...prev, [f.filter_type]: e.target.value}))}
                  placeholder={f.placeholder}
                  required={f.required} />
                <datalist id={`list-${f.filter_type}`}>
                  {(FILTER_OPTIONS[f.filter_type] || []).map((opt: string) => <option key={opt} value={opt} />)}
                </datalist>
              </div>
            ))}
          </div>
        )}

        <button data-testid="submit-button" type="submit" disabled={submitting}
          className="w-full px-4 py-2 bg-amber-cta-600 text-white rounded hover:bg-amber-cta-700 disabled:opacity-50 font-medium transition-colors duration-150">
          {submitting ? 'Creating...' : 'Create Task'}
        </button>
      </form>
    </div>
  )
}
