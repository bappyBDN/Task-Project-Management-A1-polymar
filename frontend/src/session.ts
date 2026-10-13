// Session state: where the user came from, what each page was showing (filters, tabs,
// search) and how far it was scrolled - so going back lands exactly where they left.
// Kept in sessionStorage: it survives a refresh and ends with the browser tab; signing
// out clears it (clearSession).
import { Dispatch, SetStateAction, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { NavigationType, useLocation, useNavigate, useNavigationType } from 'react-router-dom'

const PREFIX = 'pf.session.'

function read<T>(key: string, fallback: T): T {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + key)
    return raw === null ? fallback : (JSON.parse(raw) as T)
  } catch { return fallback } // storage blocked or not JSON: just not remembered
}

function write(key: string, value: unknown) {
  try { window.sessionStorage.setItem(PREFIX + key, JSON.stringify(value)) } catch { /* storage blocked or full */ }
}

/** Forget everything remembered here (on sign-out: the next person starts clean). */
export function clearSession() {
  trail = { stops: {}, at: -1 }
  scrolls = {}
  try {
    Object.keys(window.sessionStorage).filter((k) => k.startsWith(PREFIX)).forEach((k) => window.sessionStorage.removeItem(k))
  } catch { /* storage blocked */ }
}

// ---------------------------------------------------------------- where the user came from
// The pages visited in this tab, by their position in the browser's history (the router
// numbers its history entries: history.state.idx). So "the page before this one" is always
// the one the browser's Back button would open - Back / Forward and a refresh included.
interface Stop { key: string; path: string }
let trail: { stops: Record<number, Stop>; at: number } = read('trail', { stops: {}, at: -1 })

const historyIdx = (): number => {
  const idx = (window.history.state as { idx?: unknown } | null)?.idx
  return typeof idx === 'number' ? idx : 0
}

/** Called by App on every render, before the page renders (it only does something when the location changed). */
export function trackLocation(key: string, path: string, type: NavigationType) {
  const idx = historyIdx()
  const here = trail.stops[idx]
  if (trail.at === idx && here?.key === key && here.path === path) return
  if (type === 'PUSH') {
    // a new page: what was ahead of the page we left is gone from the browser's history too
    for (const i of Object.keys(trail.stops).map(Number)) if (i > trail.at || i < idx - 50) delete trail.stops[i]
  }
  trail.stops[idx] = { key, path }
  trail.at = idx
  write('trail', trail)
}

const PAGE_LABELS: [RegExp, string][] = [
  [/^\/$/, 'My Dashboard'],
  [/^\/tasks$/, 'Tasks'],
  [/^\/tasks\/[^/]+$/, 'Task'],
  [/^\/projects$/, 'Projects'],
  [/^\/projects\/[^/]+$/, 'Project'],
  [/^\/kanban$/, 'Kanban'],
  [/^\/backlog$/, 'Backlog'],
  [/^\/kpi$/, 'KPI'],
  [/^\/governance$/, 'Actions & Decisions'],
  [/^\/raci$/, 'RACI Matrix'],
  [/^\/approvals$/, 'Approvals'],
  [/^\/approvals\/[^/]+$/, 'Approval'],
  [/^\/notifications$/, 'Notifications'],
  [/^\/audit$/, 'Audit Trail'],
  [/^\/admin$/, 'Admin Panel'],
  [/^\/guide$/, 'User Guide'],
]

/** A page's "← Back" button: returns to the page the user actually came from (as it was -
 *  see usePageState / useScrollMemory). Opened directly (a link, a new tab), there is no
 *  such page, so it goes to `fallbackTo`. */
export function useBack(fallbackTo: string, fallbackLabel: string): { label: string; go: () => void } {
  const navigate = useNavigate()
  const { key, pathname } = useLocation()
  const idx = historyIdx()
  const prev = trail.stops[idx]?.key === key ? trail.stops[idx - 1] : undefined
  const label = prev && prev.path !== pathname ? PAGE_LABELS.find(([re]) => re.test(prev.path))?.[1] : undefined
  return label ? { label, go: () => navigate(-1) } : { label: fallbackLabel, go: () => navigate(fallbackTo) }
}

// ---------------------------------------------------------------- what a page was showing
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

function restore<T>(key: string, initial: T): T {
  const saved = read<unknown>(key, undefined)
  if (saved === undefined) return initial
  // a set of filters: a field added since it was saved keeps its default
  if (isObject(initial)) return isObject(saved) ? ({ ...initial, ...saved } as T) : initial
  return initial === null || typeof saved === typeof initial ? (saved as T) : initial
}

/** useState that the page remembers for this session: leave the page (or refresh) and come
 *  back, and the filter / tab / search is as it was. `name` tells apart the states of one
 *  page; each address has its own (so every project page remembers its own). Only for
 *  values that survive JSON - not for loaded data or open dialogs. */
export function usePageState<T>(name: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const { pathname } = useLocation()
  const key = `page:${pathname}:${name}`
  const [state, setState] = useState<{ key: string; value: T }>(() => ({ key, value: restore(key, initial) }))
  // the same component now shows another address (project 1 -> project 2): that one's own state
  const current = state.key === key ? state : { key, value: restore(key, initial) }
  if (current !== state) setState(current)
  useEffect(() => { write(current.key, current.value) }, [current.key, current.value])
  const keyRef = useRef(key)
  keyRef.current = key
  const set = useRef<Dispatch<SetStateAction<T>>>((v) => setState((s) => {
    const base = s.key === keyRef.current ? s.value : restore(keyRef.current, initial)
    return { key: keyRef.current, value: typeof v === 'function' ? (v as (p: T) => T)(base) : v }
  }))
  return [current.value, set.current]
}

// ---------------------------------------------------------------- how far a page was scrolled
let scrolls: Record<string, number> = read('scroll', {})

/** Used once, by App. A new page opens at the top; Back / Forward (and a refresh) return to
 *  where that page was scrolled - waiting for its data to load, since until then the page
 *  is too short to scroll that far. The user scrolling or clicking meanwhile cancels it. */
export function useScrollMemory() {
  const { key } = useLocation()
  const type = useNavigationType()
  const keyRef = useRef(key)
  const restoring = useRef(false)

  useEffect(() => {
    try { window.history.scrollRestoration = 'manual' } catch { /* old browser: its own guess stays */ }
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => { frame = 0; if (!restoring.current) scrolls[keyRef.current] = window.scrollY })
    }
    const persist = () => write('scroll', Object.fromEntries(Object.entries(scrolls).slice(-100)))
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('pagehide', persist)
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', onScroll); window.removeEventListener('pagehide', persist) }
  }, [])

  useLayoutEffect(() => {
    if (keyRef.current === key && type !== 'POP') return
    keyRef.current = key
    if (type === 'REPLACE') return
    const target = type === 'POP' ? scrolls[key] ?? 0 : 0
    if (target <= 0) { window.scrollTo(0, 0); return }

    // Hold the position while the page loads: sections arriving above it would otherwise
    // push the page down. Done once the page has stopped growing for a moment.
    restoring.current = true
    const started = Date.now()
    let timer = 0
    let height = 0
    let grewAt = started
    const events = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const
    const stop = () => {
      window.clearTimeout(timer)
      restoring.current = false
      events.forEach((e) => window.removeEventListener(e, stop))
    }
    const attempt = () => {
      const now = Date.now()
      const h = document.documentElement.scrollHeight
      if (h !== height) { height = h; grewAt = now }
      const max = h - window.innerHeight
      const y = Math.min(target, Math.max(0, max))
      if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y)
      if ((max >= target && now - grewAt > 1200) || now - started > 10000) stop()
      else timer = window.setTimeout(attempt, 60)
    }
    events.forEach((e) => window.addEventListener(e, stop, { passive: true }))
    attempt()
    return stop
  }, [key])
}
