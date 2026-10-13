import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api, setCurrentUserId, storage } from './api'
import { User } from './types'
import { clearSession } from './session'

interface AuthState {
  user: User | null
  loading: boolean
  // লগিন ফাংশনে এখন credentials (অবজেক্ট) অথবা userId (নাম্বার) পাস করা যাবে
  login: (payload: any) => Promise<void> 
  logout: () => void
  /** replace the signed-in user's details (after they edit their profile) */
  setMe: (u: User) => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
  setMe: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = storage.get('token')
    const storedLocalId = storage.get('anwar_user_id')

    if (token) {
      // রিমোট মোড: টোকেন থাকলে ইউজারের তথ্য ফেচ করবে
      let cancelled = false
      let timer = 0
      const loadMe = (attempt: number) => {
        api.get<User>('/organizations/users/me')
          .then(u => {
            if (cancelled) return
            setCurrentUserId(u.id)
            setUser(u)
          })
          .catch(() => {
            // An expired / invalid token (401): api.ts has already removed it and is going
            // to the login page. Anything else - the network dropped, the server is
            // restarting - must NOT sign the user out: carry on as the user saved at
            // login and keep trying for the full profile.
            if (cancelled || !storage.get('token')) return
            let saved: User | null = null
            try { saved = JSON.parse(storage.get('user') || 'null') } catch { /* not JSON */ }
            if (saved?.id) {
              setCurrentUserId(saved.id)
              setUser((u) => u ?? saved)
            }
            timer = window.setTimeout(() => loadMe(attempt + 1), Math.min(30000, 2000 * (attempt + 1)))
          })
          .finally(() => { if (!cancelled) setLoading(false) })
      }
      loadMe(0)
      return () => { cancelled = true; window.clearTimeout(timer) }

    } else if (storedLocalId) {
      // লোকাল মোড: আগের মতো আইডি দিয়ে ফেচ করবে
      const id = Number(storedLocalId)
      setCurrentUserId(id)
      api.get<User>('/organizations/users/me')
        .then(setUser)
        .catch(() => { 
          setCurrentUserId(null)
          storage.remove('anwar_user_id') 
        })
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [])

  const login = async (payload: any) => {
    if (typeof payload === 'number') {
      // লোকাল টেস্টিং মোড (শুধু আইডি দিয়ে লগিন)
      setCurrentUserId(payload)
      const u = await api.get<User>('/organizations/users/me')
      storage.set('anwar_user_id', String(payload))
      setUser(u)
    } else {
      // রিমোট API মোড (ইমেইল এবং পাসওয়ার্ড দিয়ে লগিন)
      const response = await api.post<{ access_token: string, user: User }>('/auth/login', payload)
      storage.set('token', response.access_token)
      storage.set('user', JSON.stringify(response.user)) // ঐচ্ছিক
      setCurrentUserId(response.user.id)
      // the login reply has only id / name / email / role: load the full profile too
      // (SBU, function, department, manager - the forms use them as defaults)
      setUser(await api.get<User>('/organizations/users/me').catch(() => response.user))
    }
  }

  const logout = () => {
    clearSession() // the next person to sign in here starts clean (session.ts)
    setCurrentUserId(null)
    storage.remove('anwar_user_id')
    storage.remove('token')
    storage.remove('user')
    setUser(null)
    window.location.href = '/' // লগআউটের পর হোমপেজে পাঠিয়ে দিবে
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, setMe: setUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}