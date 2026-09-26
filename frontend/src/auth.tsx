import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { api, setCurrentUserId, storage } from './api'
import { User } from './types'

interface AuthState {
  user: User | null
  loading: boolean
  // লগিন ফাংশনে এখন credentials (অবজেক্ট) অথবা userId (নাম্বার) পাস করা যাবে
  login: (payload: any) => Promise<void> 
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: async () => {},
  logout: () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const token = storage.get('token')
    const storedLocalId = storage.get('anwar_user_id')

    if (token) {
      // রিমোট মোড: টোকেন থাকলে ইউজারের তথ্য ফেচ করবে
      api.get<User>('/organizations/users/me')
        .then(u => {
          setCurrentUserId(u.id)
          setUser(u)
        })
        .catch(() => {
          // টোকেন ইনভ্যালিড হলে ক্লিয়ার করে দিবে
          logout()
        })
        .finally(() => setLoading(false))

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
      setUser(response.user)
    }
  }

  const logout = () => {
    setCurrentUserId(null)
    storage.remove('anwar_user_id')
    storage.remove('token')
    storage.remove('user')
    setUser(null)
    window.location.href = '/' // লগআউটের পর হোমপেজে পাঠিয়ে দিবে
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}