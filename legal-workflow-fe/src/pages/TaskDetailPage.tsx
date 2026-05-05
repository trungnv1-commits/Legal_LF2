import { useEffect, useState, useCallback, useRef } from 'react'
import { CheckCircle, XCircle, PaperPlaneTilt, Circle, Sparkle, ArrowLeft } from '@phosphor-icons/react'
import { SkeletonDetail } from '../components/SkeletonLoader'
import { useAuthStore } from '../stores/auth.store'
import { useParams, useNavigate } from 'react-router-dom'
import api from '../services/api'

/* Interfaces */

interface AIReviewResult {
  verdict: string
  score: number
  summary: string
  checklist: { item: string; status: string; note: string }[]
  docs_reviewed: string[]
  model: string
}

interface ProgressNode {
  tsi_id: string
  tst_id: string
  tst_name: string
  tst_level: number
  status: string
  comment?: string
  ai_review?: AIReviewResult | null
  children?: ProgressNode[]
}

interface Document {
  id?: string
  tdi_id?: string
  tsi_id?: string
  file_name: string
  file_url?: string
  link_url?: string
  version?: number
  uploaded_by?: string
  uploaded_at?: string
}

interface EventLog {
  id?: string
  created_at?: string
  event_type?: string
  emp_id?: string
  event_data?: string
}

interface Filter {
  filter_type?: string
  filter_code?: string
}

interface TaskInstance {
  tsi_id?: string
  tsi_code?: string
  title?: string
  status?: string
  priority?: string
  due_date?: string
  assigned_to?: string
  created_at?: string
}

interface TaskDetail {
  tsi: TaskInstance
  progress: ProgressNode[]
  documents: Document[]
  events: EventLog[]
  assignments: unknown[]
  filters: Filter[]
}

/* Constants */

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: 'bg-green-100 text-green-800',
  APPROVED: 'bg-emerald-100 text-emerald-800',
  SUBMITTED: 'bg-amber-100 text-amber-800',
  IN_PROGRESS: 'bg-blue-100 text-navy-800',
  PENDING: 'bg-gray-100 text-gray-800',
  REJECTED: 'bg-red-100 text-red-800',
}

const EVENT_COLORS: Record<string, string> = {
  APPROVE: 'bg-green-100 text-green-800',
  REJECT: 'bg-red-100 text-red-800',
  COMMENT: 'bg-blue-100 text-navy-800',
  UPLOAD: 'bg-purple-100 text-purple-800',
  CREATE: 'bg-gray-100 text-gray-800',
  UPDATE: 'bg-yellow-100 text-yellow-800',
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8100'

function resolveFileUrl(url: string | undefined, forDownload = false): string {
  if (!url) return ''
  const suffix = forDownload ? '?dl=1' : ''
  // GCS gs:// URIs are not browser-accessible; extract path and use API endpoint
  if (url.startsWith('gs://')) {
    const match = url.match(/^gs:\/\/[^/]+\/(.+)$/)
    if (match) {
      const parts = match[1].split('/')
      if (parts.length >= 2) {
        const tsiId = parts[0]
        const filename = parts.slice(1).join('/')
        return API_BASE + `/api/legal/task/${tsiId}/file/${filename}` + suffix
      }
    }
    return ''
  }
  if (url.startsWith('http')) return url + suffix
  if (url.startsWith('/api/')) return API_BASE + url + suffix
  return url
}

function downloadFile(url: string, filename: string): void {
  const dlUrl = url.includes('?dl=') ? url : url + '?dl=1'
  const a = document.createElement('a')
  a.href = dlUrl
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

const ACCEPTED_FILE_TYPES = '.pdf,.docx,.xlsx,.pptx,.png,.jpg,.csv'

/* Helpers */

function StatusIcon({ status }: { status: string }) {
  const size = 20
  switch (status) {
    case 'COMPLETED':
    case 'APPROVED':
      return <CheckCircle size={size} weight="fill" className="text-green-600 shrink-0" aria-label="Approved" />
    case 'SUBMITTED':
      return <PaperPlaneTilt size={size} weight="fill" className="text-amber-600 shrink-0" aria-label="Submitted" />
    case 'IN_PROGRESS':
      return <Circle size={size} weight="fill" className="text-navy-600 shrink-0" aria-label="In Progress" />
    case 'REJECTED':
      return <XCircle size={size} weight="fill" className="text-red-600 shrink-0" aria-label="Rejected" />
    default:
      return <Circle size={size} weight="regular" className="text-gray-400 shrink-0" aria-label="Pending" />
  }
}

function findActiveL3(nodes: ProgressNode[]): ProgressNode | null {
  for (const l1 of nodes) {
    for (const l2 of l1.children || []) {
      for (const l3 of l2.children || []) {
        if (l3.status === 'IN_PROGRESS' || l3.status === 'PENDING' || l3.status === 'REJECTED') {
          return l3
        }
      }
    }
  }
  return null
}

/* Component */

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const authUser = useAuthStore((s) => s.user)
  const isAdmin = authUser?.role === 'ADMIN'

  const [task, setTask] = useState<TaskDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reviewState, setReviewState] = useState<Record<string, { action: string; comment: string }>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [showEventLog, setShowEventLog] = useState(false)
  const [showUpload, setShowUpload] = useState(false)
  const [uploadFileName, setUploadFileName] = useState('')
  const [uploadFileUrl, setUploadFileUrl] = useState('')
  const [uploadLinkUrl, setUploadLinkUrl] = useState('')
  const [actionMsg, setActionMsg] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState(false)
  const [aiReviewingId, setAiReviewingId] = useState<string | null>(null)
  const [expandedAiReview, setExpandedAiReview] = useState<Record<string, boolean>>({})
  const [aiCheckResult, setAiCheckResult] = useState<AIReviewResult | null>(null)
  const [aiChecking, setAiChecking] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lf240Meta, setLf240Meta] = useState<Record<string, string>>({})
  const [savingMeta, setSavingMeta] = useState(false)
  const [isEditingMeta, setIsEditingMeta] = useState(false)
  const [sendingNotify, setSendingNotify] = useState(false)
  const [tmCheckForm, setTmCheckForm] = useState({appName: "", subtitle: "", platform: "ios", shortDesc: "", iconUrl: ""})
  const [tmCheckStatus, setTmCheckStatus] = useState<string>("")
  const [tmTrace, setTmTrace] = useState<any[]>([])
  const [showTrace, setShowTrace] = useState(false)
  const [tmPollElapsed, setTmPollElapsed] = useState<number>(0)
  const [tmPollStartedAt, setTmPollStartedAt] = useState<number | null>(null)
  const [tmCheckError, setTmCheckError] = useState<string>("")
  const [tmFailureReason, setTmFailureReason] = useState<string>("")
  const [tmCooldownActive, setTmCooldownActive] = useState<boolean>(false)
  const [tmUpstreamDurationSec, setTmUpstreamDurationSec] = useState<number | null>(null)
  const [tmCheckResult, setTmCheckResult] = useState<any>(null)
  const [tmCheckSubmitting, setTmCheckSubmitting] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [showSendBackModal, setShowSendBackModal] = useState(false)
  const [sendBackNote, setSendBackNote] = useState('')
  const [assignableEmps, setAssignableEmps] = useState<{emp_code: string; emp_name: string}[]>([])
  const [reassigning, setReassigning] = useState(false)

  const fetchTask = useCallback(async () => {
    if (!id) return
    setLoading(true)
    setError(null)
    try {
      const res = await api.get(`/api/legal/task/${id}`)
      let data = res.data?.data || res.data
      if (data?.tsi?.my_parent_task) {
        let rootId = data.tsi.my_parent_task
        let safety = 10
        while (rootId && safety-- > 0) {
          const parentRes = await api.get(`/api/legal/task/${rootId}`)
          const parentData = parentRes.data?.data || parentRes.data
          if (parentData?.tsi?.my_parent_task) {
            rootId = parentData.tsi.my_parent_task
          } else {
            data = parentData
            break
          }
        }
      }
      setTask(data)
      // Load metadata for LF240
      try {
        const metaRes = await api.get(`/api/legal/task/${data.tsi?.tsi_id || id}/metadata`)
        const metaData = metaRes.data?.data
        if (metaData && typeof metaData === 'object') {
          setLf240Meta(metaData)
          // Lock to read-only if any field has data
          const hasData = Object.values(metaData).some((v: unknown) => v && String(v).trim())
          setIsEditingMeta(!hasData)
        } else {
          setIsEditingMeta(true) // no metadata yet -> editable
        }
      } catch { setIsEditingMeta(true) /* no metadata yet */ }
      // Load assignable employees for reassignment
      try {
        const empRes = await api.get('/api/legal/emp/assignable')
        const empData = empRes.data?.data || empRes.data
        if (Array.isArray(empData)) {
          setAssignableEmps(empData.map((e: any) => ({ emp_code: e.emp_name, emp_name: e.display || e.emp_name })))
        }
      } catch { /* emp list might not be available */ }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { detail?: string }; status?: number } }
        setError('Error: ' + JSON.stringify(axErr.response?.data?.detail || axErr.response?.status))
      } else {
        setError(err instanceof Error ? err.message : 'Failed to load task')
      }
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => { fetchTask() }, [fetchTask])

  const tsi = task?.tsi
  const progress = task?.progress || []
  const documents = task?.documents || []
  const events = task?.events || []
  const filters = task?.filters || []
  const activeL3 = findActiveL3(progress)
  const hasDocuments = documents.length > 0
  const isLF240 = progress.some(l1 => l1.tst_id?.startsWith('TST-034') || l1.tst_name?.toLowerCase().includes('contract'))
  const isLF220 = progress.some(l1 => l1.tst_id?.startsWith('TST-010') || l1.tst_name?.toLowerCase().includes('trademark'))

  useEffect(() => { if (task?.tsi?.tsi_id && isLF220) loadTmResult() }, [task?.tsi?.tsi_id, isLF220])

  // Auto-poll /status when tmCheckStatus is "processing" or "pending" — stops on completed/failed
  useEffect(() => {
    if (!task?.tsi?.tsi_id || !isLF220) return
    const activeProcessing = tmCheckStatus && tmCheckStatus !== "completed" && tmCheckStatus !== "failed"
    if (!activeProcessing) { setTmPollStartedAt(null); setTmPollElapsed(0); return }
    if (tmPollStartedAt === null) setTmPollStartedAt(Date.now())

    let cancelled = false
    const tick = setInterval(() => setTmPollElapsed(Math.floor((Date.now() - (tmPollStartedAt || Date.now())) / 1000)), 1000)

    const poll = async () => {
      try {
        const res = await api.get(`/api/legal/task/${task.tsi?.tsi_id}/trademark-check/status`)
        const d = res.data?.data
        if (cancelled) return
        if (d?.status) setTmCheckStatus(d.status)
        if (d?.result) setTmCheckResult(d.result)
        if (d?.error) setTmCheckError(d.error)
      } catch { /* silent */ }
    }
    const pollInterval = setInterval(poll, 15000) // 15s
    const firstDelay = setTimeout(poll, 5000)     // initial poll after 5s

    return () => { cancelled = true; clearInterval(tick); clearInterval(pollInterval); clearTimeout(firstDelay) }
  }, [task?.tsi?.tsi_id, isLF220, tmCheckStatus, tmPollStartedAt])
  const isInProgress = tsi?.status === 'IN_PROGRESS'

  const handleInlineAction = async (node: ProgressNode) => {
    const state = reviewState[node.tsi_id]
    if (!state?.action) return
    if (state.action === 'REJECTED' && !state.comment?.trim()) {
      setActionMsg('Comment is required when rejecting a step')
      return
    }
    setSavingId(node.tsi_id)
    setActionMsg(null)
    try {
      if (state.action === 'APPROVED') {
        await api.post(`/api/legal/task/${node.tsi_id}/approve`)
      } else if (state.action === 'REJECTED') {
        await api.post(`/api/legal/task/${node.tsi_id}/reject`, { reason: state.comment || 'Rejected by admin' })
      }
      setActionMsg(`Step ${node.tst_name} ${state.action.toLowerCase()} successfully`)
      setReviewState((prev) => { const copy = { ...prev }; delete copy[node.tsi_id]; return copy })
      const _scrollY = window.scrollY
    await fetchTask()
    requestAnimationFrame(() => window.scrollTo(0, _scrollY))
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('Error: ' + (axErr.response?.data?.message || 'Action failed'))
      } else { setActionMsg('Error: Action failed') }
    } finally { setSavingId(null) }
  }

  const handleUserSubmit = async () => {
    if (!activeL3) return
    setActionLoading(true)
    setActionMsg(null)
    try {
      await api.post(`/api/legal/task/${activeL3.tsi_id}/approve`)
      setActionMsg('Step submitted to review')
      try { await api.post(`/api/legal/task/${activeL3.tsi_id}/ai-review`) } catch { /* optional */ }
      const _sy1 = window.scrollY
      await fetchTask()
      requestAnimationFrame(() => window.scrollTo(0, _sy1))
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('Error: ' + (axErr.response?.data?.message || 'Submit failed'))
      } else { setActionMsg('Error: Submit failed') }
    } finally { setActionLoading(false) }
  }

  const handleResubmit = async () => {
    if (!activeL3) return
    setActionLoading(true)
    setActionMsg(null)
    try {
      await api.post(`/api/legal/task/${activeL3.tsi_id}/approve`)
      setActionMsg('Step re-submitted')
      try { await api.post(`/api/legal/task/${activeL3.tsi_id}/ai-review`) } catch { /* optional */ }
      const _sy2 = window.scrollY
      await fetchTask()
      requestAnimationFrame(() => window.scrollTo(0, _sy2))
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('Error: ' + (axErr.response?.data?.message || 'Resubmit failed'))
      } else { setActionMsg('Error: Resubmit failed') }
    } finally { setActionLoading(false) }
  }

  const handleSendBack = async () => {
    if (!task) return
    setShowSendBackModal(false)
    setSendingNotify(true); setActionMsg(null)
    try {
      const rej: {name: string; comment: string}[] = []
      for (const l1 of (task.progress || []))
        for (const l2 of (l1.children || []))
          for (const l3 of (l2.children || []))
            if (l3.status === 'REJECTED') rej.push({ name: l3.tst_name, comment: l3.comment || 'Rejected' })
      await api.post(`/api/legal/task/${task.tsi?.tsi_id}/send-back`, { tsi_id: task.tsi?.tsi_id, rejected_steps: rej })
      setActionMsg('Feedback sent to submitter')
    } catch { setActionMsg('Error sending feedback') }
    finally { setSendingNotify(false) }
  }

  const handleNotifyReviewer = async () => {
    if (!task) return
    setSendingNotify(true); setActionMsg(null)
    try {
      await api.post(`/api/legal/task/${task.tsi?.tsi_id}/notify-reviewer`)
      setActionMsg('Notification sent to reviewer')
    } catch { setActionMsg('Error sending notification') }
    finally { setSendingNotify(false) }
  }

  const normalizeIconUrl = (url: string): string => {
    const driveMatch = url.match(/drive\.google\.com\/file\/d\/([^/]+)/)
    if (driveMatch) return `https://drive.google.com/uc?export=view&id=${driveMatch[1]}`
    return url
  }

  const validateIconUrl = (url: string): string | null => {
    if (!url.trim()) return null
    if (!url.startsWith("https://")) return "Icon URL phai dung HTTPS"
    if (url.includes("drive.google.com/file/") && url.includes("/view")) {
      return "Link Drive /view khong phai direct image. He thong se tu dong convert khi submit."
    }
    if (!/\.(png|svg)(\?|$)/i.test(url)) return "URL nen ket thuc bang .png hoac .svg"
    return null
  }

  const handleTmSubmit = async () => {
    if (!task || !tmCheckForm.appName.trim()) { setActionMsg("App Name required"); return }
    setTmCheckSubmitting(true); setActionMsg(null)
    try {
      const payload: Record<string, unknown> = {
        appNames: [{ appName: tmCheckForm.appName.trim(), subtitle: tmCheckForm.subtitle.trim() || undefined }],
        platform: tmCheckForm.platform,
      }
      if (tmCheckForm.shortDesc.trim()) payload.shortDescs = [tmCheckForm.shortDesc.trim()]
      if (tmCheckForm.iconUrl.trim()) payload.iconUrls = [normalizeIconUrl(tmCheckForm.iconUrl.trim())]
      await api.post(`/api/legal/task/${task.tsi?.tsi_id}/trademark-check/submit`, payload)
      setTmCheckStatus("processing")
      setTmCheckResult(null)
      setActionMsg("Trademark check submitted. Poll status below.")
    } catch (e: unknown) {
      const axe = e as { response?: { data?: { message?: string } }; message?: string }
      setActionMsg("Error: " + (axe?.response?.data?.message || axe?.message))
    } finally { setTmCheckSubmitting(false) }
  }

  const handleTmReset = () => {
    setTmCheckStatus("")
    setTmCheckResult(null)
    setTmCheckError("")
    setTmFailureReason("")
    setTmCooldownActive(false)
    setTmUpstreamDurationSec(null)
    setTmTrace([])
    setShowTrace(false)
    setActionMsg(null)
  }

  const handleTmCheckStatus = async () => {
    if (!task) return
    setTmCheckSubmitting(true); setActionMsg(null)
    try {
      const res = await api.get(`/api/legal/task/${task.tsi?.tsi_id}/trademark-check/status`)
      const d = res.data?.data
      setTmCheckStatus(d?.status || "")
      if (d?.error) setTmCheckError(d.error)
      if (typeof d?.failure_reason === "string") setTmFailureReason(d.failure_reason)
      if (typeof d?.cooldown_active === "boolean") setTmCooldownActive(d.cooldown_active)
      if (typeof d?.upstream_duration_sec === "number") setTmUpstreamDurationSec(d.upstream_duration_sec)
      if (d?.status === "completed") { setTmCheckResult(d.result); setActionMsg("Trademark check completed") }
      else if (d?.status === "failed") setActionMsg("Check failed: " + (d.error || ""))
      else setActionMsg("Status: " + (d?.status || ""))
    } catch (e: unknown) {
      const axe = e as { message?: string }
      setActionMsg("Error: " + axe?.message)
    } finally { setTmCheckSubmitting(false) }
  }



  const loadTmResult = async () => {
    if (!task) return
    try {
      const res = await api.get(`/api/legal/task/${task.tsi?.tsi_id}/trademark-check/result`)
      const d = res.data?.data
      if (d?.status) setTmCheckStatus(d.status)
      if (d?.result) setTmCheckResult(d.result)
      if (d?.error) setTmCheckError(d.error)
    } catch { /* no data yet */ }
  }

  const loadTmTrace = async () => {
    if (!task) return
    try {
      const res = await api.get(`/api/legal/task/${task.tsi?.tsi_id}/trademark-check/trace`)
      const d = res.data?.data
      if (Array.isArray(d?.trace)) setTmTrace(d.trace)
    } catch { /* no trace yet */ }
  }

  const handleUpload = async () => {
    if (!activeL3) return

    // Check if we have a real file selected or just a URL
    const selectedFile = fileInputRef.current?.files?.[0]

    if (selectedFile) {
      // Real file upload via multipart form
      setActionLoading(true)
      setActionMsg(null)
      try {
        const formData = new FormData()
        formData.append('file', selectedFile)
        formData.append('tdt_id', 'TDT-001')
        if (uploadLinkUrl.trim()) formData.append('link_url', uploadLinkUrl.trim())
        await api.post(`/api/legal/task/${activeL3.tsi_id}/upload-file`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' },
        })
        setActionMsg('File uploaded successfully')
        setUploadFileName('')
        setUploadFileUrl('')
        setUploadLinkUrl('')
        setShowUpload(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
        await fetchTask()
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'response' in err) {
          const axErr = err as { response?: { data?: { message?: string } } }
          setActionMsg('Error: ' + (axErr.response?.data?.message || 'Upload failed'))
        } else { setActionMsg('Error: Upload failed') }
      } finally { setActionLoading(false) }
    } else if (uploadLinkUrl.trim() || uploadFileUrl.trim()) {
      // URL-based upload
      setActionLoading(true)
      setActionMsg(null)
      try {
        await api.post(`/api/legal/task/${activeL3.tsi_id}/document`, {
          tdt_id: 'TDT-001',
          file_name: uploadFileName.trim() || 'document',
          file_url: uploadFileUrl.trim() || uploadLinkUrl.trim(),
          link_url: uploadLinkUrl.trim() || uploadFileUrl.trim(),
        })
        setActionMsg('Document link saved')
        setUploadFileName('')
        setUploadFileUrl('')
        setUploadLinkUrl('')
        setShowUpload(false)
        await fetchTask()
      } catch (err: unknown) {
        if (err && typeof err === 'object' && 'response' in err) {
          const axErr = err as { response?: { data?: { message?: string } } }
          setActionMsg('Error: ' + (axErr.response?.data?.message || 'Upload failed'))
        } else { setActionMsg('Error: Upload failed') }
      } finally { setActionLoading(false) }
    } else {
      setActionMsg('Please select a file or enter a Link URL')
    }
  }

  const handleDeleteDoc = async (doc: Document) => {
    const docId = doc.tdi_id || doc.id
    const docTsiId = doc.tsi_id || activeL3?.tsi_id
    if (!docId || !docTsiId) return
    if (!window.confirm(`Delete "${doc.file_name}"?`)) return
    setActionMsg(null)
    try {
      await api.delete(`/api/legal/task/${docTsiId}/document/${docId}`)
      setActionMsg('Document deleted')
      await fetchTask()
    } catch { setActionMsg('Error: Delete failed') }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setUploadFileName(file.name)
      setUploadFileUrl(`uploads/${file.name}`)
    }
  }

  const handleAiCheck = async () => {
    if (!activeL3) return
    setAiChecking(true)
    setAiCheckResult(null)
    setActionMsg(null)
    try {
      const res = await api.post(`/api/legal/task/${activeL3.tsi_id}/ai-review`)
      setAiCheckResult(res.data?.data || res.data)
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('AI Check Error: ' + (axErr.response?.data?.message || 'Failed'))
      } else { setActionMsg('AI Check Error: Failed') }
    } finally { setAiChecking(false) }
  }

  const triggerAiReview = async (tsiId: string) => {
    setAiReviewingId(tsiId)
    setActionMsg(null)
    try {
      await api.post(`/api/legal/task/${tsiId}/ai-review`)
      setActionMsg('AI review completed')
      await fetchTask()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('AI Review Error: ' + (axErr.response?.data?.message || 'Failed'))
      } else { setActionMsg('AI Review Error: Failed') }
    } finally { setAiReviewingId(null) }
  }

  const handleSaveMeta = async () => {
    if (!id) return
    setSavingMeta(true)
    setActionMsg(null)
    try {
      await api.put(`/api/legal/task/${id}/metadata`, lf240Meta)
      setActionMsg('Thông tin bổ sung đã lưu')
      setIsEditingMeta(false) // Lock after save
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('Error: ' + (axErr.response?.data?.message || 'Save failed'))
      } else { setActionMsg('Error: Save failed') }
    } finally { setSavingMeta(false) }
  }

  const handleReassign = async (newEmpCode: string) => {
    if (!id || !newEmpCode) return
    setReassigning(true)
    setActionMsg(null)
    try {
      await api.put(`/api/legal/task/${id}/reassign`, { new_emp_code: newEmpCode })
      setActionMsg('Task đã được chuyển giao')
      await fetchTask()
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'response' in err) {
        const axErr = err as { response?: { data?: { message?: string } } }
        setActionMsg('Error: ' + (axErr.response?.data?.message || 'Reassign failed'))
      } else { setActionMsg('Error: Reassign failed') }
    } finally { setReassigning(false) }
  }

  if (loading) return <div data-testid="loading-state" className="p-8"><SkeletonDetail /></div>

  if (error || !task) return (
    <div className="p-8">
      <button className="mb-4 text-navy-600 hover:underline text-sm transition-colors duration-150 flex items-center gap-1" onClick={() => navigate(-1)} aria-label="Go back"><ArrowLeft size={16} weight="bold" aria-hidden="true" /> Back</button>
      <div className="bg-navy-50 text-red-700 p-4 rounded">{error || 'Task not found'}</div>
    </div>
  )

  return (
    <div data-testid="task-detail-page" className="space-y-6">
      {/* 1. Back button */}
      <button className="text-navy-600 hover:underline text-sm transition-colors duration-150 flex items-center gap-1" onClick={() => navigate(-1)}>
        &larr; Back to Tasks
      </button>

      {/* 2. Status banners */}
      {tsi?.status === 'COMPLETED' && (
        <div className="bg-green-50 border border-green-200 text-green-800 p-4 rounded-lg text-center font-medium">
          This task has been completed
        </div>
      )}

      {/* 3. Action message feedback */}
      {actionMsg && (
        <div className={`p-3 rounded text-sm ${actionMsg.startsWith('Error') ? 'bg-navy-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
          {actionMsg}
          <button className="ml-3 text-xs underline" onClick={() => setActionMsg(null)} aria-label="Dismiss message">dismiss</button>
        </div>
      )}

      {/* 4. Task Info Header */}
      <div data-testid="task-info-header" className="bg-white rounded-lg shadow p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold font-heading">{tsi?.title || 'Untitled Task'}</h2>
            <p className="text-sm text-gray-500 font-mono mt-1">{tsi?.tsi_code || tsi?.tsi_id}</p>
          </div>
          <span className={`px-3 py-1 rounded text-sm font-medium ${STATUS_COLORS[tsi?.status || ''] || 'bg-gray-100'}`}>
            {tsi?.status}
          </span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div><span className="text-gray-500">Priority:</span> <span className="font-medium">{tsi?.priority || '-'}</span></div>
          <div><span className="text-gray-500">Due Date:</span> <span className="font-medium">{tsi?.due_date || '-'}</span></div>
          <div>
            <span className="text-gray-500">Assigned To:</span>{' '}
            {isAdmin && assignableEmps.length > 0 ? (
              <select className="border rounded px-2 py-1 text-sm font-medium" value={tsi?.assigned_to || ''}
                onChange={(e) => handleReassign(e.target.value)} disabled={reassigning}>
                <option value="">-- Select --</option>
                {assignableEmps.map(emp => (
                  <option key={emp.emp_code} value={emp.emp_code}>{emp.emp_name}</option>
                ))}
              </select>
            ) : (
              <span className="font-medium">{tsi?.assigned_to || '-'}</span>
            )}
            {reassigning && <span className="text-xs text-gray-400 ml-2">Đang chuyển...</span>}
          </div>
          <div><span className="text-gray-500">Created At:</span> <span className="font-medium">{tsi?.created_at ? new Date(tsi.created_at).toLocaleDateString() : '-'}</span></div>
        </div>
        {filters.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-4">
            {filters.map((f, i) => (
              <span key={i} className="bg-indigo-50 text-indigo-700 px-2 py-1 rounded text-xs font-medium">
                {f.filter_type}: {f.filter_code}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* 5. Progress Tree */}
      <div data-testid="progress-tree-section" className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold font-heading mb-2">Progress Tree</h3>
        {(() => {
          let approved=0, rejected=0, pending=0, total=0
          for (const l1 of progress) for (const l2 of (l1.children||[])) for (const l3 of (l2.children||[])) {
            total++
            if (l3.status==='APPROVED'||l3.status==='COMPLETED') approved++
            else if (l3.status==='REJECTED') rejected++
            else pending++
          }
          if (total===0) return null
          return (
            <div className="flex gap-3 mb-4 text-xs">
              <span className="px-2 py-1 bg-green-100 text-green-800 rounded">{approved} Approved</span>
              <span className="px-2 py-1 bg-red-100 text-red-800 rounded">{rejected} Rejected</span>
              <span className="px-2 py-1 bg-gray-100 text-gray-800 rounded">{pending} Pending</span>
              <span className="text-gray-400">Total: {total} steps</span>
            </div>
          )
        })()}
        {progress.map((l1) => (
          <div key={l1.tsi_id} className="mb-6">
            <div className="flex items-center gap-2 mb-2">
              <StatusIcon status={l1.status} />
              <span className="font-semibold text-base">{l1.tst_name}</span>
              <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l1.status] || 'bg-gray-100'}`}>{l1.status}</span>
            </div>
            {(l1.children || []).map((l2) => (
              <div key={l2.tsi_id} className="ml-6 mb-4 border-l-4 border-navy-300 pl-4">
                <div className="flex items-center gap-2 mb-2">
                  <StatusIcon status={l2.status} />
                  <span className="font-medium text-sm">{l2.tst_name}</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l2.status] || 'bg-gray-100'}`}>{l2.status}</span>
                </div>
                {(l2.children || []).length > 0 && (
                  <div className="ml-4 overflow-x-auto">
                    <table className="w-full text-sm border rounded table-fixed">
                      <thead>
                        <tr className="bg-gray-50 border-b">
                          <th className="text-left p-2 w-8">#</th>
                          <th className="text-left p-2" style={{width:'50%'}}>Step</th>
                          <th className="text-left p-2 w-28">Status</th>
                          <th className="text-left p-2" style={{width:'25%'}}>Comment</th>
                          <th className="text-left p-2 w-16">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(l2.children || []).map((l3, idx) => {
                          const isDone = ['APPROVED', 'COMPLETED', 'REJECTED', 'SUBMITTED'].includes(l3.status)
                          // Bug2 fix: only editable if all previous steps in same L2 are done
                          const prevSteps = (l2.children || []).slice(0, idx)
                          const allPrevDone = prevSteps.every((ps: any) => ['APPROVED','COMPLETED','REJECTED','SUBMITTED'].includes(ps.status))
                          const isEditable = !isDone && allPrevDone && isAdmin
                          const rs = reviewState[l3.tsi_id] || { action: '', comment: '' }
                          return (
                            <>
                              <tr key={l3.tsi_id} className="border-b hover:bg-gray-50">
                                <td className="p-2 text-gray-500">{idx + 1}</td>
                                <td className="p-2"><StatusIcon status={l3.status} />{l3.tst_name}</td>
                                <td className="p-2">
                                  {isDone ? (
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l3.status] || 'bg-gray-100'}`}>{l3.status}</span>
                                  ) : !isDone ? (
                                    <select className="border rounded px-2 py-1 text-xs" value={rs.action}
                                      onChange={(e) => setReviewState((prev) => ({ ...prev, [l3.tsi_id]: { ...prev[l3.tsi_id], action: e.target.value, comment: prev[l3.tsi_id]?.comment || '' } }))}>
                                      <option value="">-- Select --</option>
                                      <option value="APPROVED">Approved</option>
                                      <option value="REJECTED">Reject</option>
                                    </select>
                                  ) : (
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[l3.status] || 'bg-gray-100'}`}>{l3.status}</span>
                                  )}
                                </td>
                                <td className="p-2 text-xs text-gray-600">
                                  {isDone ? (<span>{l3.comment || '-'}</span>) : isEditable ? (
                                    <input type="text" className="border rounded px-2 py-1 text-xs w-full" placeholder="Comment..."
                                      value={rs.comment} onChange={(e) => setReviewState((prev) => ({ ...prev, [l3.tsi_id]: { ...prev[l3.tsi_id], action: prev[l3.tsi_id]?.action || '', comment: e.target.value } }))} />
                                  ) : '-'}
                                </td>
                                {isAdmin && (
                                  <td className="p-2">
                                    {isEditable && rs.action && (
                                      <button className="bg-navy-600 text-white px-3 py-1 rounded text-xs hover:bg-navy-700 transition-colors duration-150 disabled:opacity-50"
                                        disabled={savingId === l3.tsi_id} onClick={() => handleInlineAction(l3)}>
                                        {savingId === l3.tsi_id ? 'Saving...' : 'Save'}
                                      </button>
                                    )}
                                  </td>
                                )}
                              </tr>
                              {l3.ai_review && (
                                <tr key={`${l3.tsi_id}-ai`} className="border-b">
                                  <td colSpan={5} className="p-2">
                                    <button className={`text-xs px-2 py-1 rounded font-medium ${l3.ai_review.verdict === 'PASS' ? 'bg-green-100 text-green-800' : l3.ai_review.verdict === 'PASS_WITH_NOTES' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}
                                      onClick={() => setExpandedAiReview((prev) => ({ ...prev, [l3.tsi_id]: !prev[l3.tsi_id] }))}>
                                      <Sparkle size={16} weight="fill" className="inline mr-1 text-indigo-600" aria-hidden="true" />AI: {l3.ai_review.verdict} (Score: {l3.ai_review.score}){expandedAiReview[l3.tsi_id] ? ' ▲' : ' ▼'}
                                    </button>
                                    {expandedAiReview[l3.tsi_id] && (
                                      <div className="mt-2 bg-gray-50 rounded p-3 text-xs space-y-2">
                                        <p><strong>Summary:</strong> {l3.ai_review.summary}</p>
                                        {l3.ai_review.checklist?.length > 0 && (
                                          <div>
                                            <strong>Checklist:</strong>
                                            <ul className="mt-1 space-y-1">
                                              {l3.ai_review.checklist.map((c, ci) => (
                                                <li key={ci} className="flex items-start gap-1">
                                                  <span>{c.status === 'pass' ? <CheckCircle size={16} weight="fill" className="text-green-600 inline" aria-label="Pass" /> : <XCircle size={16} weight="fill" className="text-red-600 inline" aria-label="Fail" />}</span>
                                                  <span>{c.item}{c.note && <span className="text-gray-500 ml-1">— {c.note}</span>}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                        {l3.ai_review.docs_reviewed?.length > 0 && (
                                          <p><strong>Docs reviewed:</strong> {l3.ai_review.docs_reviewed.join(', ')}</p>
                                        )}
                                        <p className="text-gray-400">Model: {l3.ai_review.model}</p>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                              {isAdmin && l3.status === 'SUBMITTED' && !l3.ai_review && (
                                <tr key={`${l3.tsi_id}-ai-btn`} className="border-b">
                                  <td colSpan={5} className="p-2">
                                    <button className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded hover:bg-indigo-200 disabled:opacity-50"
                                      disabled={aiReviewingId === l3.tsi_id} onClick={() => triggerAiReview(l3.tsi_id)}>
                                      {aiReviewingId === l3.tsi_id ? 'Running AI Review...' : 'Run AI Review'}
                                    </button>
                                  </td>
                                </tr>
                              )}
                            </>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>


      {/* Send Back Modal */}
      {showSendBackModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowSendBackModal(false)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl mx-4 max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="bg-navy-900 text-white px-6 py-4 rounded-t-xl flex justify-between items-center">
              <h3 className="font-semibold text-lg">Send Back to Submitter</h3>
              <button onClick={() => setShowSendBackModal(false)} className="text-white/80 hover:text-white text-xl">&times;</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="text-sm">
                <p className="text-gray-500">Task</p>
                <p className="font-semibold">{tsi?.tsi_code} - {tsi?.title}</p>
              <div className="text-sm mt-2">
                <p className="text-gray-500">Submitter</p>
                <p className="font-medium">{(tsi as any)?.requested_by || '-'}</p>
              </div>
              </div>
              <div>
                <p className="text-sm font-medium text-navy-900 mb-2">Rejected Steps:</p>
                <table className="w-full text-sm border rounded">
                  <thead><tr className="bg-navy-50"><th className="text-left p-2 border-b">#</th><th className="text-left p-2 border-b">Step</th><th className="text-left p-2 border-b">Comment</th></tr></thead>
                  <tbody>
                    {(() => {
                      const rej: {name: string; comment: string}[] = []
                      for (const l1 of (progress || []))
                        for (const l2 of (l1.children || []))
                          for (const l3 of (l2.children || []))
                            if (l3.status === 'REJECTED') rej.push({ name: l3.tst_name, comment: l3.comment || 'Rejected' })
                      return rej.map((r, i) => (
                        <tr key={i} className="border-b"><td className="p-2 text-gray-500">{i+1}</td><td className="p-2">{r.name}</td><td className="p-2 text-gray-600">{r.comment}</td></tr>
                      ))
                    })()}
                  </tbody>
                </table>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Additional Note (optional)</label>
                <textarea className="w-full border rounded-lg px-3 py-2 text-sm" rows={3} placeholder="Add a note for the submitter..."
                  value={sendBackNote} onChange={(e) => setSendBackNote(e.target.value)} />
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button onClick={() => setShowSendBackModal(false)} className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm">Cancel</button>
                <button onClick={handleSendBack} disabled={sendingNotify}
                  className="px-5 py-2 bg-navy-900 text-white rounded-lg hover:bg-navy-800 font-medium text-sm disabled:opacity-50">
                  {sendingNotify ? 'Sending...' : 'Confirm & Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Send Back */}
      {isAdmin && progress.some((l1: any) => (l1.children || []).some((l2: any) => (l2.children || []).some((l3: any) => l3.status === 'REJECTED'))) && (
        <div className='flex justify-end mb-4'>
          <button onClick={() => setShowSendBackModal(true)} disabled={sendingNotify}
            className='px-5 py-2.5 bg-navy-900 text-white rounded-lg hover:bg-navy-800 font-medium text-sm shadow disabled:opacity-50'>
            {sendingNotify ? 'Sending...' : 'Send Back to Submitter'}
          </button>
        </div>
      )}

      {/* 5.5 LF240 Additional Fields */}
      {isLF240 && isInProgress && (
        <div data-testid="lf240-fields" className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold font-heading">Thông tin bổ sung — Hợp đồng đối tác</h3>
            {!isEditingMeta && (
              <button className="px-3 py-1 border border-navy-600 text-navy-600 rounded text-sm hover:bg-navy-50"
                onClick={() => setIsEditingMeta(true)}>
                Edit
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              { key: 'requester_phone' as const, label: 'SĐT người đề xuất', type: 'tel', placeholder: '+84-xxx-xxx-xxx', required: true },
              { key: 'manager_email' as const, label: 'Email quản lý người đề xuất', type: 'email', placeholder: 'manager@apero.vn', required: true },
              { key: 'partner_phone' as const, label: 'SĐT đối tác', type: 'tel', placeholder: '+84-xxx-xxx-xxx', required: false },
              { key: 'partner_contact_email' as const, label: 'Mail liên hệ đối tác', type: 'email', placeholder: 'contact@partner.com', required: true },
              { key: 'partner_contract_email' as const, label: 'Mail ký hợp đồng đối tác', type: 'email', placeholder: 'contract@partner.com', required: false },
              { key: 'pe_code' as const, label: 'Mã PE', type: 'text', placeholder: 'PE-2026-001', required: true },
            ].map(f => (
              <div key={f.key}>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {f.label} {f.required && <span className="text-red-500">*</span>}
                </label>
                {isEditingMeta ? (
                  <div className={f.key === 'pe_code' ? 'flex gap-2 items-center' : ''}>
                    <input type={f.type} className={"border rounded px-3 py-2 text-sm " + (f.key === 'pe_code' ? 'flex-1' : 'w-full')} placeholder={f.placeholder}
                      value={lf240Meta[f.key] || ''}
                      onChange={(e) => setLf240Meta(prev => ({...prev, [f.key]: e.target.value}))} />
                    {f.key === 'pe_code' && (
                      <label className="px-3 py-2 bg-navy-600 text-white rounded text-xs cursor-pointer hover:bg-navy-700 whitespace-nowrap flex items-center gap-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                        Upload PE
                        <input type="file" className="hidden" accept=".pdf,.jpg,.jpeg,.png"
                          onChange={async (e) => {
                            const file = e.target.files?.[0]
                            if (!file || !activeL3) return
                            try {
                              const fd = new FormData()
                              fd.append('file', file)
                              fd.append('tdt_id', 'TDT-PE')
                              await api.post('/api/legal/task/' + activeL3.tsi_id + '/upload-file', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
                              setActionMsg('PE uploaded: ' + file.name)
                              await fetchTask()
                            } catch { setActionMsg('Upload PE failed') }
                          }} />
                      </label>
                    )}
                  </div>
                ) : (
                  <div className="border-b py-2 text-sm text-gray-800 min-h-[36px]">
                    {lf240Meta[f.key] || <span className="text-gray-400 italic">Chưa nhập</span>}
                  </div>
                )}
              </div>
            ))}
<div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mục đích ký kết / ban hành <span className="text-red-500">*</span>
              </label>
              {isEditingMeta ? (
                <textarea className="w-full border rounded px-3 py-2 text-sm" rows={3} placeholder="Mô tả mục đích ký kết hợp đồng..."
                  value={lf240Meta.purpose || ''}
                  onChange={(e) => setLf240Meta(prev => ({...prev, purpose: e.target.value}))} />
              ) : (
                <div className="border-b py-2 text-sm text-gray-800 min-h-[60px] whitespace-pre-wrap">
                  {lf240Meta.purpose || <span className="text-gray-400 italic">Chưa nhập</span>}
                </div>
              )}
            </div>
          </div>
          {isEditingMeta && (
            <div className="mt-4 flex gap-2">
              <button className="px-4 py-2 bg-navy-600 text-white rounded hover:bg-navy-700 text-sm transition-colors duration-150 font-medium disabled:opacity-50"
                disabled={savingMeta} onClick={handleSaveMeta}>
                {savingMeta ? 'Đang lưu...' : 'Save'}
              </button>
              {Object.values(lf240Meta).some(v => v && v.trim()) && (
                <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors duration-150"
                  onClick={() => setIsEditingMeta(false)}>
                  Huỷ
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Trademark Check (LF220) */}
      {isLF220 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold font-heading">Trademark Check</h3>
            {(tmCheckStatus === "completed" || tmCheckStatus === "failed") && (
              <button onClick={handleTmReset} className="text-xs px-3 py-1 border border-navy-600 text-navy-600 rounded hover:bg-navy-50">
                Submit new check
              </button>
            )}
          </div>

          {!tmCheckResult && !tmCheckStatus && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">App Name *</label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm focus:border-navy-600 focus:ring-1 focus:ring-navy-600" placeholder="MyApp" value={tmCheckForm.appName} onChange={(e) => setTmCheckForm(p => ({...p, appName: e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subtitle</label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="AI Photo Editor" value={tmCheckForm.subtitle} onChange={(e) => setTmCheckForm(p => ({...p, subtitle: e.target.value}))} />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                <select className="w-full border rounded px-3 py-2 text-sm" value={tmCheckForm.platform} onChange={(e) => setTmCheckForm(p => ({...p, platform: e.target.value}))}>
                  <option value="ios">iOS</option>
                  <option value="android">Android</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Icon URL</label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="https://.../icon.png" value={tmCheckForm.iconUrl} onChange={(e) => setTmCheckForm(p => ({...p, iconUrl: e.target.value}))} />
                {tmCheckForm.iconUrl && validateIconUrl(tmCheckForm.iconUrl) && (
                  <p className="text-xs text-amber-600 mt-1">WARN: {validateIconUrl(tmCheckForm.iconUrl)}</p>
                )}
                <p className="text-xs text-gray-400 mt-1">Phai la link HTTPS truc tiep, ket thuc .png hoac .svg. Drive /view link se tu dong convert.</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Short Description</label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="AI photo editor" value={tmCheckForm.shortDesc} onChange={(e) => setTmCheckForm(p => ({...p, shortDesc: e.target.value}))} />
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-3 items-center">
            {!tmCheckStatus && (
              <button onClick={handleTmSubmit} disabled={tmCheckSubmitting} className="px-4 py-2 bg-amber-cta-600 text-white rounded hover:bg-amber-cta-700 font-medium text-sm disabled:opacity-50">
                {tmCheckSubmitting ? "Submitting..." : "Run Trademark Check"}
              </button>
            )}
            {tmCheckStatus && tmCheckStatus !== "completed" && tmCheckStatus !== "failed" && (
              <>
                <span className="inline-flex items-center gap-2 text-sm text-amber-600 font-medium">
                  <span className="inline-block w-2 h-2 rounded-full bg-amber-500 animate-pulse" aria-hidden="true" />
                  Auto-polling: {tmCheckStatus} ({Math.floor(tmPollElapsed / 60)}:{String(tmPollElapsed % 60).padStart(2, "0")} / ~7-10 min)
                </span>
                <button onClick={handleTmCheckStatus} disabled={tmCheckSubmitting}
                  className="px-3 py-1.5 text-xs border border-navy-600 text-navy-700 rounded hover:bg-navy-50 disabled:opacity-50">
                  {tmCheckSubmitting ? "Checking..." : "Check now"}
                </button>
              </>
            )}
            {tmCheckStatus === "completed" && (
              <span className="text-sm text-green-600 font-medium flex items-center gap-1">
                <CheckCircle size={16} weight="fill" /> Completed
              </span>
            )}
            {tmCheckStatus === "failed" && (
              <span className="text-sm text-red-600 font-medium flex items-center gap-1">
                <XCircle size={16} weight="fill" /> Failed
              </span>
            )}
          </div>

          {/* Failed or completed-with-empty-result */}
          {(tmCheckStatus === "failed" || (tmCheckStatus === "completed" && (!tmCheckResult || !Array.isArray(tmCheckResult.results) || tmCheckResult.results.length === 0))) && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <div className="flex items-start gap-2">
                <XCircle size={20} weight="fill" className="text-red-600 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-semibold text-red-900 text-sm">Trademark check that bai</p>
                  <p className="text-xs text-red-800 mt-1">
                    Agent-Legal khong hoan thanh duoc report. Nguyen nhan co the:
                  </p>
                  <ul className="text-xs text-red-800 list-disc pl-5 mt-1 space-y-1">
                    <li>VietnamIP upstream fail (SSL cert verify, circuit breaker open)</li>
                    <li>LangGraph recursion limit reached (workflow loop)</li>
                    <li>Icon URL khong truy cap duoc (Drive /view link, private URL)</li>
                    <li>App Name qua dac biet (chua ky tu dau : /, v.v.)</li>
                  </ul>
                  {tmFailureReason && (
                    <div className="mt-2 flex flex-wrap gap-2 text-xs">
                      <span className="px-2 py-1 bg-red-200 text-red-900 rounded font-semibold">
                        Reason: {tmFailureReason.replace(/_/g, " ")}
                      </span>
                      {tmUpstreamDurationSec !== null && (
                        <span className="px-2 py-1 bg-gray-200 text-gray-800 rounded">
                          Upstream: {tmUpstreamDurationSec.toFixed(1)}s
                        </span>
                      )}
                      {tmCooldownActive && (
                        <span className="px-2 py-1 bg-amber-200 text-amber-900 rounded font-semibold">
                          Cooldown active (10 min)
                        </span>
                      )}
                    </div>
                  )}
                  {tmCheckError && (
                    <div className="mt-2 p-2 bg-red-100 rounded text-xs font-mono text-red-900 break-all">
                      <strong>Upstream error:</strong> {tmCheckError.replace(/^Upstream error:\s*/i, "")}
                    </div>
                  )}
                  <div className="mt-3 flex gap-2 flex-wrap">
                    <button onClick={handleTmReset} className="text-xs px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700">
                      Submit lai voi input khac
                    </button>
                    <button onClick={loadTmResult} className="text-xs px-3 py-1 border border-red-600 text-red-700 rounded hover:bg-red-50">
                      Refresh data
                    </button>
                    <button onClick={() => { setShowTrace(!showTrace); if (!showTrace) loadTmTrace() }}
                      className="text-xs px-3 py-1 border border-navy-600 text-navy-700 rounded hover:bg-navy-50">
                      {showTrace ? "Hide" : "Show"} Agent Trace ({tmTrace.length})
                    </button>
                  </div>

                  {showTrace && (
                    <div className="mt-3 bg-white border border-gray-200 rounded-lg p-3 max-h-96 overflow-y-auto">
                      <h5 className="text-xs font-semibold text-gray-700 mb-2">
                        TrademarkCheckAgent Execution Trace
                      </h5>
                      {tmTrace.length === 0 ? (
                        <p className="text-xs text-gray-500 italic">No trace events. Click Refresh or re-submit.</p>
                      ) : (
                        <ol className="space-y-1 text-xs font-mono">
                          {tmTrace.map((t, i) => {
                            const statusColor =
                              t.status === "failed" || t.status === "override_to_failed" ? "text-red-600" :
                              t.status === "completed" || t.status === "valid" || t.status === "hit" ? "text-green-600" :
                              t.status === "started" || t.status === "in_progress" ? "text-amber-600" :
                              "text-gray-600"
                            const tsStr = t.ts ? new Date(t.ts * 1000).toLocaleTimeString("en-GB") : "-"
                            return (
                              <li key={i} className="border-l-2 border-gray-200 pl-2 py-1 hover:bg-gray-50">
                                <div className="flex items-start gap-2">
                                  <span className="text-gray-400 shrink-0">{tsStr}</span>
                                  <span className="font-semibold text-navy-700 shrink-0">{t.step}</span>
                                  <span className={statusColor + " shrink-0"}>{t.status}</span>
                                </div>
                                {t.details && Object.keys(t.details).length > 0 && (
                                  <div className="ml-14 mt-0.5 text-gray-600 whitespace-pre-wrap break-all">
                                    {JSON.stringify(t.details, null, 0)}
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ol>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Full report with summary */}
          {tmCheckResult && Array.isArray(tmCheckResult.results) && tmCheckResult.results.length > 0 && (
            <div className="mt-6 space-y-4">
              {(() => {
                const results = tmCheckResult.results as Record<string, unknown>[]
                const high = results.filter(r => r.overallRisk === "High").length
                const med = results.filter(r => r.overallRisk === "Medium").length
                const low = results.filter(r => r.overallRisk === "Low").length
                return (
                  <div className="flex items-center justify-between bg-gray-50 border rounded-lg p-4">
                    <h4 className="text-base font-semibold">Report ({results.length} checks)</h4>
                    <div className="flex gap-2 text-xs">
                      <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full font-medium">{high} High</span>
                      <span className="px-3 py-1 bg-amber-100 text-amber-800 rounded-full font-medium">{med} Medium</span>
                      <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full font-medium">{low} Low</span>
                    </div>
                  </div>
                )
              })()}
              {(tmCheckResult.results as Record<string, unknown>[]).map((r, i: number) => (
                <div key={i} className="border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-xs text-gray-500 uppercase">{String(r.field)}</div>
                      <div className="font-semibold">{String(r.label)}</div>
                    </div>
                    <span className={"px-3 py-1 rounded-full text-xs font-semibold " + (r.overallRisk === "High" ? "bg-red-100 text-red-800" : r.overallRisk === "Medium" ? "bg-amber-100 text-amber-800" : "bg-green-100 text-green-800")}>
                      {String(r.overallRisk)} ({String(r.overallConfidence)}%)
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-2">{String(r.overallReasoning || "")}</p>
                  {Array.isArray(r.sourceRisks) && r.sourceRisks.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Sources</div>
                      <div className="space-y-1">
                        {(r.sourceRisks as Record<string, unknown>[]).map((s, si: number) => (
                          <div key={si} className="text-xs flex items-start gap-2">
                            <span className={"px-2 py-0.5 rounded font-medium " + (s.riskLevel === "High" ? "bg-red-100 text-red-700" : s.riskLevel === "Medium" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700")}>
                              {String(s.source)}: {String(s.riskLevel)}
                            </span>
                            <span className="text-gray-600 flex-1">{String(s.reasoning || "")}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {Array.isArray(r.recommendations) && r.recommendations.length > 0 && (
                    <div className="mt-3">
                      <div className="text-xs font-semibold text-gray-500 mb-1">Recommendations</div>
                      <ul className="text-xs text-gray-700 list-disc pl-5 space-y-1">
                        {(r.recommendations as string[]).map((rec: string, ri: number) => <li key={ri}>{rec}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      
      {/* 6. Documents Table */}
      {/* Document Preview */}
      {documents.some((d: any) => (d.file_name || "").match(/\.(pdf|jpg|jpeg|png)$/i)) && (
        <div className="bg-white rounded-lg shadow p-6">
          <button className="text-lg font-semibold font-heading flex items-center gap-2" onClick={() => setShowPreview(!showPreview)}>Document Preview <span className="text-sm">{showPreview ? '▲' : '▼'}</span></button>
          {showPreview && (
            <div className="mt-3">
              <select className="border rounded px-3 py-2 text-sm w-full max-w-md mb-4" value={lf240Meta._previewIdx || '0'} onChange={(e) => setLf240Meta(prev => ({...prev, _previewIdx: e.target.value}))}>
                {documents.filter((d: any) => (d.file_name || "").match(/\.(pdf|jpg|jpeg|png)$/i)).map((d: any, i: number) => (
                  <option key={i} value={String(i)}>{d.file_name}</option>
                ))}
              </select>
              {(() => {
                const pDocs = documents.filter((d: any) => (d.file_name || "").match(/\.(pdf|jpg|jpeg|png)$/i))
                const pIdx = parseInt(lf240Meta._previewIdx || '0')
                const doc = pDocs[pIdx]
                if (!doc) return null
                const url = resolveFileUrl(doc.file_url)
                const isPdf = (doc.file_name || "").toLowerCase().endsWith('.pdf')
                return (<div className="border rounded-lg overflow-hidden">{isPdf ? <iframe src={url} className="w-full h-[600px]" title={doc.file_name} /> : <img src={url} alt={doc.file_name} className="max-w-full max-h-[600px] mx-auto" />}</div>)
              })()}
            </div>
          )}
        </div>
      )}
      <div data-testid="documents-section" className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-semibold font-heading mb-4">Documents ({documents.length})</h3>
        {documents.length > 0 ? (
          <table className="w-full text-sm border rounded table-fixed">
            <thead>
              <tr className="bg-gray-50 border-b">
                <th className="text-left p-2">File Name</th>
                <th className="text-left p-2">Version</th>
                <th className="text-left p-2">Uploaded By</th>
                <th className="text-left p-2">Uploaded At</th>
                <th className="text-left p-2">Action</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc, i) => (
                <tr key={doc.tdi_id || doc.id || i} className="border-b">
                  <td className="p-2">{doc.file_name}</td>
                  <td className="p-2">{doc.version || 1}</td>
                  <td className="p-2 text-xs">{doc.uploaded_by || '-'}</td>
                  <td className="p-2 text-xs">{doc.uploaded_at ? new Date(doc.uploaded_at).toLocaleString() : '-'}</td>
                  <td className="p-2 flex items-center gap-2">
                    {(doc.link_url || doc.file_url) && (
                      <>
                        {(doc.link_url || doc.file_url) && (
                          <a href={doc.link_url || resolveFileUrl(doc.file_url)} target="_blank" rel="noopener noreferrer" className="text-navy-600 hover:underline text-xs">View</a>
                        )}
                        {doc.file_url && (
                          <button onClick={() => downloadFile(resolveFileUrl(doc.file_url, true), doc.file_name)} className="text-green-600 hover:underline text-xs">Download</button>
                        )}
                      </>
                    )}
                    {tsi?.status !== 'COMPLETED' && (
                      <button className="text-red-500 hover:text-red-700 text-xs ml-2" onClick={() => handleDeleteDoc(doc)} title="Delete document" aria-label="Delete document">✕</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : <p className="text-gray-400 text-sm">No documents uploaded yet.</p>}
      </div>

      {/* 8. Actions (all roles) */}
      {tsi?.status !== 'COMPLETED' && activeL3 && (
        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <h3 className="text-lg font-semibold font-heading">Actions</h3>
          <div className="text-sm bg-navy-50 text-navy-800 px-3 py-2 rounded">
            Active Step: <strong>{activeL3.tst_name}</strong> ({activeL3.status})
          </div>

      {!hasDocuments && (
            <div className="text-sm bg-amber-50 text-amber-800 px-3 py-2 rounded">
              No documents uploaded. Please upload at least one document before submitting.
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-medium" onClick={() => setShowUpload(!showUpload)}>
              Upload Document
            </button>
            <button className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 text-sm font-medium disabled:opacity-50"
              disabled={aiChecking || !hasDocuments} onClick={handleAiCheck}>
              {aiChecking ? 'Checking...' : 'AI Check'}
            </button>
            {activeL3.status === 'REJECTED' ? (
              <button className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium disabled:opacity-50"
                disabled={actionLoading} onClick={handleResubmit}>
                {actionLoading ? 'Re-submitting...' : 'Re-submit'}
              </button>
            ) : (
              <button className="px-4 py-2 bg-navy-600 text-white rounded hover:bg-navy-700 text-sm transition-colors duration-150 font-medium disabled:opacity-50"
                disabled={actionLoading} onClick={handleUserSubmit}>
                {actionLoading ? 'Submitting...' : 'Submit to Review'}
              </button>

            )}
          </div>
          {/* Notify Reviewer - shown after Submit */}
          {(activeL3?.status === 'SUBMITTED' || activeL3?.status === 'PENDING_REVIEW') && (
            <div className="mt-3">
              <button onClick={handleNotifyReviewer} disabled={sendingNotify}
                className="px-4 py-2 bg-orange-500 text-white rounded hover:bg-orange-600 text-sm font-medium disabled:opacity-50">
                {sendingNotify ? 'Sending...' : 'Notify Reviewer'}
              </button>
            </div>
          )}

          {aiCheckResult && (
            <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm">AI Check Result</span>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${aiCheckResult.verdict === 'PASS' ? 'bg-green-100 text-green-800' : aiCheckResult.verdict === 'PASS_WITH_NOTES' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}`}>
                    {aiCheckResult.verdict} (Score: {aiCheckResult.score})
                  </span>
                </div>
                <button className="text-gray-400 hover:text-gray-600 text-sm" onClick={() => setAiCheckResult(null)} aria-label="Close AI check result">✕ Close</button>
              </div>
              <p className="text-sm text-gray-700">{aiCheckResult.summary}</p>
              {aiCheckResult.checklist?.length > 0 && (
                <div className="text-sm">
                  <strong>Checklist:</strong>
                  <ul className="mt-1 space-y-1">
                    {aiCheckResult.checklist.map((c, ci) => (
                      <li key={ci} className="flex items-start gap-1">
                        <span>{c.status === 'pass' ? <CheckCircle size={16} weight="fill" className="text-green-600 inline" aria-label="Pass" /> : <XCircle size={16} weight="fill" className="text-red-600 inline" aria-label="Fail" />}</span>
                        <span>{c.item}{c.note && <span className="text-gray-500 ml-1">— {c.note}</span>}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="text-xs text-gray-400">Model: {aiCheckResult.model}</p>
            </div>
          )}

          {showUpload && (
            <div className="border-2 border-dashed border-navy-300 rounded-xl p-6 bg-navy-50/50 space-y-4">
              <div className="flex flex-col items-center justify-center cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                <svg className="w-16 h-16 text-navy-500 mb-2" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z"/>
                </svg>
                <p className="text-sm font-medium text-navy-700">Click to select file</p>
                <p className="text-xs text-gray-500">({ACCEPTED_FILE_TYPES})</p>
              </div>
              <input ref={fileInputRef} type="file" accept={ACCEPTED_FILE_TYPES} className="hidden" onChange={handleFileSelect} />
              {uploadFileName && <p className="text-center text-sm text-green-600 font-medium">Selected: {uploadFileName}</p>}
              <div>
                <label className="block text-xs text-gray-600 mb-1">Link URL (Google Slides, Docs, etc.) - for View</label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="https://docs.google.com/presentation/d/..."
                  value={uploadLinkUrl} onChange={(e) => setUploadLinkUrl(e.target.value)} />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1">File Name</label>
                <input type="text" className="w-full border rounded px-3 py-2 text-sm" placeholder="document.pdf"
                  value={uploadFileName} onChange={(e) => setUploadFileName(e.target.value)} />
              </div>
              <div className="flex gap-2">
                <button className="px-4 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-700 font-medium disabled:opacity-50"
                  disabled={actionLoading || !uploadFileName.trim()} onClick={handleUpload}>
                  {actionLoading ? 'Uploading...' : 'Submit'}
                </button>
                <button className="px-4 py-2 bg-gray-200 text-gray-700 rounded text-sm hover:bg-gray-300 transition-colors duration-150"
                  onClick={() => { setShowUpload(false); setUploadFileName(''); setUploadFileUrl(''); setUploadLinkUrl('') }}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

{/* 7. Event Log (collapsible) — moved to bottom */}
      <div data-testid="event-log-section" className="bg-white rounded-lg shadow p-6">
        <button className="text-lg font-semibold font-heading flex items-center gap-2" onClick={() => setShowEventLog(!showEventLog)}>
          Event Log ({events.length}) <span className="text-sm">{showEventLog ? '▲' : '▼'}</span>
        </button>
        {showEventLog && (
          <div className="mt-4 space-y-3">
            {events.length > 0 ? events.map((ev, i) => (
              <div key={ev.id || i} className="flex items-start gap-3 border-l-4 border-gray-200 pl-3 py-1">
                <span className={`px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap ${EVENT_COLORS[ev.event_type || ''] || 'bg-gray-100 text-gray-800'}`}>{ev.event_type}</span>
                <div className="text-xs text-gray-600 flex-1">
                  <span className="font-medium">{ev.emp_id || 'SYSTEM'}</span>
                  {ev.event_data && <span className="ml-2 text-gray-500">{ev.event_data.length > 100 ? ev.event_data.slice(0, 100) + '...' : ev.event_data}</span>}
                </div>
                <span className="text-xs text-gray-400 whitespace-nowrap">{ev.created_at ? new Date(ev.created_at).toLocaleString() : '-'}</span>
              </div>
            )) : <p className="text-gray-400 text-sm">No events recorded.</p>}
          </div>
        )}
      </div>
    </div>
  )
}