import { useEffect, useState } from 'react'
import { api } from './api'

// Privileged roles (can see all tasks, edit, approve) come from the server
// (/privileged-roles, edited in the Admin Panel). Pages used to read the
// browser-only demo list in store.ts, so Admin Panel changes had no effect.
let cache: Promise<string[]> | null = null

function loadRoles(): Promise<string[]> {
  if (!cache) {
    cache = api.get<string[]>('/privileged-roles').catch(() => {
      cache = null // try again next time
      return ['admin']
    })
  }
  return cache
}

/** Call after the Admin Panel changes the list so other pages pick it up. */
export function clearPrivilegedCache() {
  cache = null
}

export function useIsPrivileged(role: string | undefined): boolean {
  const [roles, setRoles] = useState<string[] | null>(null)
  useEffect(() => {
    let alive = true
    loadRoles().then((r) => { if (alive) setRoles(r) })
    return () => { alive = false }
  }, [])
  if (!role) return false
  if (role === 'admin') return true
  return roles ? roles.includes(role) : false
}
