import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/auth.store'
import api from '../services/api'
import { Buildings } from '@phosphor-icons/react'

const CID = '21672960606-1ksk32rpsm8sga0enpt44ul3bhnbhrm5.apps.googleusercontent.com'

const DEVS = [
  { email: 'trangph@apero.vn', label: 'TrangPH', sec: 'SEC1', desc: 'User - MyPT - MyCDT', color: 'bg-blue-50 border-blue-200 text-blue-700' },
  { email: 'oainv@apero.vn', label: 'OaiNV', sec: 'SEC2', desc: 'Trainer - AllPT - CDTParent', color: 'bg-amber-50 border-amber-200 text-amber-700' },
  { email: 'giangpnt@apero.vn', label: 'GiangPNT', sec: 'SEC3', desc: 'Manager - AllPT - MyCDT', color: 'bg-green-50 border-green-200 text-green-700' },
  { email: 'hoangdnh@apero.vn', label: 'HoangDNH', sec: 'SEC4', desc: 'Admin - AllPT - AllCDT', color: 'bg-red-50 border-red-200 text-red-700' },
]

declare global { interface Window { google: any } }

export function LoginPage() {
  const nav = useNavigate()
  const setAuth = useAuthStore((s) => s.setAuth)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [dev, setDev] = useState(false)
  const gRef = useRef<HTMLDivElement>(null)

  const done = (d: any) => {
    const { token, user: u } = d
    const isAdminUser = u.empsec === 'SEC4' || u.role_legal === 'Approver' || u.role_legal === 'Checker'
    setAuth(token, {
      emp_code: u.emp_code, emp_name: u.emp_name,
      role: isAdminUser ? 'ADMIN' : 'PRODUCT_MANAGER',
      empsec: u.empsec, pt_allowed: u.pt_allowed, cdt_allowed: u.cdt_allowed,
      krf_level: u.krf_level, cdt_1: u.cdt_1, role_legal: u.role_legal, google_email: u.google_email,
    })
    nav('/legal')
  }

  useEffect(() => {
    const init = () => {
      if (!window.google || !gRef.current) return
      window.google.accounts.id.initialize({
        client_id: CID,
        callback: async (r: any) => {
          setBusy(true); setErr('')
          try { const res = await api.post('/api/auth/login', { google_token: r.credential }); done(res.data.data) }
          catch (e: any) { setErr(e?.response?.data?.message === 'Employee not found' ? 'Account not registered.' : (e?.response?.data?.message || 'Login failed')) }
          finally { setBusy(false) }
        },
      })
      window.google.accounts.id.renderButton(gRef.current, { theme: 'outline', size: 'large', width: 320, text: 'signin_with', shape: 'pill' })
    }
    if (window.google) init()
    else { const t = setInterval(() => { if (window.google) { clearInterval(t); init() } }, 100); return () => clearInterval(t) }
  }, [])

  const devLogin = async (email: string) => {
    setBusy(true); setErr('')
    try { const r = await api.post('/api/auth/login', { email }); done(r.data.data) }
    catch (e: any) { setErr(e?.response?.data?.message || 'Login failed') }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen flex">
      {/* Left Hero - Blue gradient */}
      <div className="hidden lg:flex lg:w-[45%] bg-gradient-to-br from-blue-500 via-blue-600 to-blue-700 relative overflow-hidden flex-col justify-between p-10 text-white">
        <div className="absolute top-[-20%] right-[-10%] w-[500px] h-[500px] bg-blue-400/20 rounded-full blur-3xl" />
        <div className="absolute bottom-[-15%] left-[-5%] w-[400px] h-[400px] bg-blue-300/15 rounded-full blur-3xl" />

        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-20">
            <div className="w-10 h-10 rounded-xl bg-white/15 backdrop-blur flex items-center justify-center">
              <Buildings size={24} weight="duotone" className="text-white" />
            </div>
            <span className="text-lg font-bold">Legal Workflow</span>
          </div>

          <h1 className="text-4xl font-bold leading-tight mb-4">
            Legal Task<br />Management System
          </h1>
          <p className="text-blue-100 text-base leading-relaxed max-w-sm">
            Streamline copyright checks, trademark reviews, policy compliance, and contract approvals.
          </p>
        </div>

        <div className="relative z-10">
          <div className="flex gap-8 mb-8">
            <div className="text-center">
              <p className="text-3xl font-bold">4</p>
              <p className="text-xs text-blue-200 mt-1">Task Types</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">6</p>
              <p className="text-xs text-blue-200 mt-1">Statuses</p>
            </div>
            <div className="text-center">
              <p className="text-3xl font-bold">Auto</p>
              <p className="text-xs text-blue-200 mt-1">AI Review</p>
            </div>
          </div>
          <p className="text-xs text-blue-300">&copy; 2026 Apero &middot; Legal Workflow v2.0</p>
        </div>
      </div>

      {/* Right Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-surface">
        <div className="w-full max-w-md">
          {/* Mobile logo */}
          <div className="lg:hidden text-center mb-8">
            <div className="inline-flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center">
                <Buildings size={24} weight="duotone" className="text-white" />
              </div>
              <span className="text-lg font-bold text-gray-900">Legal Workflow</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-gray-900 mb-1">Sign In</h2>
          <p className="text-sm text-gray-500 mb-8">Enter your credentials to access the system</p>

          {err && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl">
              <p className="text-sm text-red-700">{err}</p>
            </div>
          )}

          <div className="flex justify-center mb-6"><div ref={gRef} className="min-h-[44px]" /></div>

          {busy && (
            <div className="flex items-center justify-center gap-2 mb-4">
              <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm text-gray-500">Authenticating...</span>
            </div>
          )}

          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
            <div className="relative flex justify-center">
              <button onClick={() => setDev(!dev)} className="px-3 py-1 bg-surface text-xs text-gray-400 hover:text-gray-600 transition-colors duration-150">
                Test Accounts
              </button>
            </div>
          </div>

          {dev && (
            <div className="grid grid-cols-2 gap-3">
              {DEVS.map((u) => (
                <button key={u.email} onClick={() => devLogin(u.email)} disabled={busy}
                  data-testid={`login-${u.email.split('@')[0]}`}
                  className={`p-3 rounded-xl border text-left transition-all duration-150 disabled:opacity-40 hover:shadow-md ${u.color}`}>
                  <p className="text-sm font-semibold">{u.label}</p>
                  <p className="text-[11px] opacity-70">{u.email}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
