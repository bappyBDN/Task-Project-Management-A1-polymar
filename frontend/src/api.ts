// API facade. Currently backed by localStorage (see store.ts). Set MODE='remote' to
// talk to the FastAPI backend instead (for the future database connection).
import { store } from './store'
import type { User } from './types'

//const MODE: 'local' | 'remote' = (import.meta as any).env?.VITE_STORAGE_MODE || 'local'
// ✅ নতুন (ডিফল্ট remote)
const MODE: 'local' | 'remote' = (import.meta as any).env?.VITE_STORAGE_MODE || 'remote'
const BASE = '/api'

// Browser storage that never throws. Some browsers block site storage
// (cookies/site data turned off, strict privacy or private modes, storage full);
// there, touching localStorage throws and used to blank the whole app.
// This falls back to memory: the app still works, you just log in again after a reload.
const memoryStore = new Map<string, string>()
export const storage = {
  get(key: string): string | null {
    try { return window.localStorage.getItem(key) } catch { return memoryStore.get(key) ?? null }
  },
  set(key: string, value: string) {
    try { window.localStorage.setItem(key, value) } catch { memoryStore.set(key, value) }
  },
  remove(key: string) {
    try { window.localStorage.removeItem(key) } catch { /* blocked */ }
    memoryStore.delete(key)
  },
}

let currentUserId: number | null = null

export function setCurrentUserId(id: number | null) {
  currentUserId = id
}
export function getCurrentUserId(): number | null {
  return currentUserId
}

async function remote<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  
  // --- নতুন JWT Auth লজিক ---
  const token = storage.get('token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // পুরোনো X-User-Id রাখা হয়েছে ব্যাকওয়ার্ড কম্প্যাটিবিলিটির জন্য
  if (currentUserId !== null) headers['X-User-Id'] = String(currentUserId)
  
  const res = await fetch(`${BASE}${path}`, { headers, ...options })
  
  if (!res.ok) {
    // --- 401 Unauthorized হলে অটো লগআউট ---
    if (res.status === 401) {
      storage.remove('token')
      storage.remove('user')
      window.location.href = '/' // লগিন পেজে রিডাইরেক্ট
    }

    const bodyText = await res.text()
    // Use the server's own message ({"detail": ...}) when there is one.
    // (Before, the throw sat inside this try, so its own catch swallowed it and
    // users always saw raw text such as "502 : <html>...".)
    let detail: string | undefined
    try {
      const d = JSON.parse(bodyText)?.detail
      if (typeof d === 'string') detail = d
      else if (Array.isArray(d)) detail = d.map((x: any) => x?.msg ?? String(x)).join('; ') // FastAPI validation errors
    } catch {
      // not JSON, e.g. an HTML error page - handled below
    }
    const isHtml = /^\s*</.test(bodyText)
    throw new Error(
      detail ||
      (isHtml || !bodyText ? `${res.status} ${res.statusText || 'Request failed'}` : `${res.status}: ${bodyText.slice(0, 200)}`)
    )
  }
  
  if (res.status === 204) return undefined as T
  return res.json() as Promise<T>
}

// ------------------------------------------------------------------ local route table
function local<T>(path: string, options?: { method?: string; body?: unknown }): T {
  const m = options?.method || 'GET'
  const body = options?.body as any
  const sp = path.split('?')[0]

  // GET endpoints
  if (m === 'GET') {
    if (sp === '/organizations/users/me') return store.userById(currentUserId!) as unknown as T
    if (sp === '/organizations/users') return store.users() as unknown as T
    if (sp === '/organizations/companies') return store.companies() as unknown as T
    if (sp === '/organizations/functions') return store.functions() as unknown as T
    if (sp === '/organizations/departments') return store.departments() as unknown as T
    if (sp === '/projects') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      const company_id = q.get('company_id') ? Number(q.get('company_id')) : undefined
      const function_id = q.get('function_id') ? Number(q.get('function_id')) : undefined
      const status = q.get('status') || undefined
      const health = q.get('health') || undefined
      let list = store.projects()
      if (company_id) list = list.filter((p) => p.company_id === company_id)
      if (function_id) list = list.filter((p) => p.function_id === function_id)
      if (status) list = list.filter((p) => p.status === status)
      if (health) list = list.filter((p) => p.health === health)
      return list as unknown as T
    }
    if (sp === '/tasks') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      return store.tasks({
        project_id: q.get('project_id') ? Number(q.get('project_id')) : undefined,
        responsible_id: q.get('responsible_id') ? Number(q.get('responsible_id')) : undefined,
        accountable_id: q.get('accountable_id') ? Number(q.get('accountable_id')) : undefined,
        status: q.get('status') || undefined,
        priority: q.get('priority') || undefined,
        health: q.get('health') || undefined,
        blocker: q.get('blocker') !== null ? q.get('blocker') === 'true' : undefined,
        overdue: q.get('overdue') !== null ? q.get('overdue') === 'true' : undefined,
      }) as unknown as T
    }
    if (sp === '/backlogs') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      return store.backlog(q.get('project_id') ? Number(q.get('project_id')) : undefined, q.get('status') || undefined) as unknown as T
    }
    if (sp === '/delays') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      return store.delays(q.get('task_id') ? Number(q.get('task_id')) : undefined) as unknown as T
    }
    if (sp === '/approvals') return store.approvals() as unknown as T
    if (sp === '/meetings') return store.meetings() as unknown as T
    if (sp === '/decisions') return store.decisions() as unknown as T
    if (sp === '/actions') return store.actions() as unknown as T
    if (sp === '/risks') return store.risks() as unknown as T
    if (sp === '/issues') return store.issues() as unknown as T
    if (sp === '/raci') return store.raciEntries() as unknown as T
    if (sp === '/audit') return store.audit() as unknown as T
    if (sp === '/audit/notifications') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      return store.notifications(q.get('user_id') ? Number(q.get('user_id')) : undefined) as unknown as T
    }
    if (sp === '/dashboards/executive') return store.executiveKpi() as unknown as T
    if (sp === '/dashboards/org-intelligence') return store.orgIntelligence() as unknown as T
    if (sp === '/dashboards/health-distribution') return store.healthDistribution() as unknown as T
    if (sp === '/dashboards/delay-causes') return store.delayCauses() as unknown as T
    if (sp === '/list-options') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      return store.listOptions(q.get('kind') || '') as unknown as T
    }
    if (sp === '/privileged-roles') return store.privilegedRoles() as unknown as T
    if (sp === '/privileged-users') return store.privilegedUsers() as unknown as T
    if (sp === '/all-roles') return store.allRoles() as unknown as T

    // parameterized GETs
    let m
    if ((m = sp.match(/^\/projects\/(\d+)\/milestones$/))) return store.milestones(Number(m[1])) as unknown as T
    if ((m = sp.match(/^\/projects\/(\d+)$/))) return store.projectById(Number(m[1])) as unknown as T
    if ((m = sp.match(/^\/tasks\/(\d+)\/progress$/))) return store.progressList(Number(m[1])) as unknown as T
    if ((m = sp.match(/^\/tasks\/(\d+)$/))) return store.taskById(Number(m[1])) as unknown as T
    if ((m = sp.match(/^\/dashboards\/individual\/(\d+)$/))) return store.individualKpi(Number(m[1])) as unknown as T
    if ((m = sp.match(/^\/raci\/matrix(?:\/(\d+))?$/))) {
      const q = new URLSearchParams(path.split('?')[1] || '')
      return store.raciMatrix(m[1] ? Number(m[1]) : undefined, {
        company_id: q.get('company_id') ? Number(q.get('company_id')) : undefined,
        function_id: q.get('function_id') ? Number(q.get('function_id')) : undefined,
        department_id: q.get('department_id') ? Number(q.get('department_id')) : undefined,
      }) as unknown as T
    }
    throw new Error(`Local GET not implemented: ${sp}`)
  }

  // POST
  if (m === 'POST') {
    if (sp === '/tasks') return store.createTask(body) as unknown as T
    if (sp === '/projects') return store.createProject(body) as unknown as T
    if (sp === '/organizations/users') return store.createUser(body) as unknown as T
    if (sp === '/organizations/companies') return store.createCompany(body) as unknown as T
    if (sp === '/organizations/functions') return store.createFunction(body) as unknown as T
    if (sp === '/organizations/departments') return store.createDepartment(body) as unknown as T
    if (sp === '/backlogs') return store.createBacklog(body) as unknown as T
    if (sp === '/delays') return store.createDelay(body) as unknown as T
    if (sp === '/approvals') return store.createApproval(body) as unknown as T
    if (sp === '/actions') return store.createAction(body) as unknown as T
    if (sp === '/audit/escalations/scan') return { scanned: true, events: store.scanEscalations() } as unknown as T
    if (sp === '/list-options') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      store.addListOption(q.get('kind') || '', q.get('value') || '')
      return { kind: q.get('kind'), value: q.get('value') } as unknown as T
    }
    if (sp === '/privileged-roles') { store.addPrivilegedRole(body?.role); return store.privilegedRoles() as unknown as T }
    let m
    if ((m = sp.match(/^\/tasks\/(\d+)\/progress$/))) return store.addProgress(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/projects\/(\d+)\/milestones$/))) return store.createMilestone(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/approvals\/(\d+)\/decision$/))) return store.decideApproval(Number(m[1]), body.status, body.reason) as unknown as T
    if ((m = sp.match(/^\/actions\/(\d+)\/convert-to-task$/))) return store.convertAction(Number(m[1]), body?.responsible_id) as unknown as T
    if ((m = sp.match(/^\/audit\/notifications\/(\d+)\/read$/))) return store.markRead(Number(m[1])) as unknown as T
    throw new Error(`Local POST not implemented: ${sp}`)
  }

  // PATCH
  if (m === 'PATCH') {
    let m
    if ((m = sp.match(/^\/tasks\/(\d+)$/))) return store.updateTask(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/projects\/(\d+)$/))) return store.updateProject(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/organizations\/users\/(\d+)$/))) return store.updateUser(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/backlogs\/(\d+)$/))) return store.updateBacklog(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/decisions\/(\d+)$/))) return store.updateDecision(Number(m[1]), body) as unknown as T
    if ((m = sp.match(/^\/actions\/(\d+)$/))) return store.updateAction(Number(m[1]), body) as unknown as T
    throw new Error(`Local PATCH not implemented: ${sp}`)
  }

  // DELETE
  if (m === 'DELETE') {
    let mm
    if ((mm = sp.match(/^\/tasks\/(\d+)\/permanent$/))) { store.permanentDeleteTask(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/tasks\/(\d+)$/))) { store.deleteTask(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/projects\/(\d+)$/))) { store.deleteProject(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/organizations\/users\/(\d+)\/permanent$/))) { store.deleteUser(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/organizations\/users\/(\d+)$/))) { store.deactivateUser(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/organizations\/companies\/(\d+)$/))) { store.removeCompany(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/organizations\/functions\/(\d+)$/))) { store.removeFunction(Number(mm[1])); return undefined as T }
    if ((mm = sp.match(/^\/organizations\/departments\/(\d+)$/))) { store.removeDepartment(Number(mm[1])); return undefined as T }
    if (sp === '/list-options') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      store.removeListOption(q.get('kind') || '', q.get('value') || '')
      return undefined as T
    }
    if (sp === '/privileged-roles') {
      const q = new URLSearchParams(path.split('?')[1] || '')
      store.removePrivilegedRole(q.get('role') || '')
      return undefined as T
    }
    throw new Error(`Local DELETE not implemented: ${sp}`)
  }

  throw new Error(`Local ${m} not implemented: ${sp}`)
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  if (MODE === 'remote') return remote<T>(path, options)
  // local mode is synchronous
  const body = options?.body ? JSON.parse(options.body as string) : undefined
  return local<T>(path, { method: options?.method, body }) as T
}

export const api = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'PATCH', body: JSON.stringify(body ?? {}) }),
  del: <T>(path: string) => request<T>(path, { method: 'DELETE' }),
}

export const STORAGE_MODE = MODE