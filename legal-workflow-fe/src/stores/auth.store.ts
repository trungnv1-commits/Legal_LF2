import { create } from 'zustand'

export interface User {
  emp_code: string
  role: string
  emp_name: string
  // SEC permission fields
  empsec?: string
  pt_allowed?: string
  cdt_allowed?: string
  krf_level?: number
  cdt_1?: string
  role_legal?: string
  google_email?: string
}

interface AuthState {
  token: string | null
  user: User | null
  setAuth: (token: string, user: User) => void
  clearAuth: () => void
}

// Restore from localStorage on init, validate JWT not expired
function isTokenValid(token: string | null): boolean {
  if (!token) return false
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    if (payload.exp && payload.exp * 1000 < Date.now()) {
      localStorage.removeItem('lww_token')
      localStorage.removeItem('lww_user')
      return false
    }
    return true
  } catch { return false }
}
const savedToken = localStorage.getItem('lww_token')
const validToken = isTokenValid(savedToken) ? savedToken : null
const savedUser = validToken ? (() => {
  try { const s = localStorage.getItem('lww_user'); return s ? JSON.parse(s) : null } catch { return null }
})() : null

export const useAuthStore = create<AuthState>((set) => ({
  token: validToken,
  user: savedUser,
  setAuth: (token, user) => {
    localStorage.setItem('lww_token', token)
    localStorage.setItem('lww_user', JSON.stringify(user))
    set({ token, user })
  },
  clearAuth: () => {
    localStorage.removeItem('lww_token')
    localStorage.removeItem('lww_user')
    set({ token: null, user: null })
  },
}))
