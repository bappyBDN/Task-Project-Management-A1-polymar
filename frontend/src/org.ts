// One way to show and filter SBU / Function / Department everywhere (forms,
// filters, tables, dashboard), so the same thing never shows under two names.
// Duplicate copies (same name, or another spelling of one of the group SBUs)
// count as one: a filter on it finds records on every copy.
import { DEFAULT_SBUS, norm, pickSbu, sbuKey } from './components/SbuSelect'
import type { SelectItem } from './components/SearchableSelect'

type Named = { id: number; name: string }

const OFFICIAL = new Map(DEFAULT_SBUS.map((n) => [norm(n), n]))

/** The SBU's official name when it is one of the group SBUs, else its own name. */
export const sbuLabel = (name: string) => OFFICIAL.get(sbuKey(name)) ?? name

export function sbuName(companies: Named[], id?: number | null): string | undefined {
  const c = companies.find((x) => x.id === id)
  return c ? sbuLabel(c.name) : undefined
}

/** Filter list: the group SBUs in their fixed order, then any other companies; one entry per SBU. */
export function sbuFilterItems(companies: Named[]): SelectItem[] {
  const keys = new Set(companies.map((c) => sbuKey(c.name)))
  const official = DEFAULT_SBUS.map((n) => ({ value: norm(n), label: n }))
  const others = [...keys].filter((k) => !OFFICIAL.has(k))
    .map((k) => ({ value: k, label: companies.find((c) => sbuKey(c.name) === k)!.name }))
    .sort((a, b) => a.label.localeCompare(b.label))
  return [{ value: '', label: 'All SBUs' }, ...official, ...others]
}

/** Does company `id` belong to the SBU picked in a filter (a value from sbuFilterItems)? */
export function inSbu(companies: Named[], id: number | null | undefined, key: string): boolean {
  const c = companies.find((x) => x.id === id)
  return !!c && sbuKey(c.name) === key
}

/** The company id to send to the server for an SBU filter value (the copy the forms use). */
export function sbuIdFor(companies: Named[], key: string): number | undefined {
  return pickSbu(companies.filter((c) => sbuKey(c.name) === key))?.id
}

/** Function / Department filter list: one entry per name (case and spacing ignored). */
export function nameFilterItems(list: Named[], allLabel: string): SelectItem[] {
  const seen = new Map<string, string>()
  for (const x of list) {
    const cur = seen.get(norm(x.name))
    // prefer the spelling that starts with a capital (as the dashboard does)
    if (cur === undefined || (!/^[A-Z]/.test(cur) && /^[A-Z]/.test(x.name))) seen.set(norm(x.name), x.name)
  }
  const items = [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label))
  return [{ value: '', label: allLabel }, ...items]
}

export function inName(list: Named[], id: number | null | undefined, key: string): boolean {
  const x = list.find((y) => y.id === id)
  return !!x && norm(x.name) === key
}

export function nameIdFor(list: Named[], key: string): number | undefined {
  return list.filter((x) => norm(x.name) === key).sort((a, b) => a.id - b.id)[0]?.id
}

/** Dashboard "By SBU" rows: copies of one SBU added together, the group SBUs first in their fixed order. */
export function mergeSbuRows<R extends { name: string; total: number; open: number; completed: number; overdue: number; projects: number }>(rows: R[]): R[] {
  const byKey = new Map<string, R>()
  for (const r of rows) {
    const k = r.name === 'Unassigned' ? '~unassigned' : sbuKey(r.name)
    const cur = byKey.get(k)
    if (!cur) { byKey.set(k, { ...r, name: r.name === 'Unassigned' ? r.name : sbuLabel(r.name) }); continue }
    for (const f of ['total', 'open', 'completed', 'overdue', 'projects'] as const) (cur as any)[f] += r[f]
  }
  const official = DEFAULT_SBUS.map((n) => byKey.get(norm(n)) ?? ({ name: n, total: 0, open: 0, completed: 0, overdue: 0, projects: 0 } as R))
  const rest = [...byKey.entries()].filter(([k]) => !OFFICIAL.has(k) && k !== '~unassigned').map(([, r]) => r)
  const unassigned = byKey.get('~unassigned')
  return [...official, ...rest, ...(unassigned ? [unassigned] : [])]
}
