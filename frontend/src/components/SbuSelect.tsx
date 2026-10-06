import { useState } from 'react'
import { api } from '../api'
import type { Company } from '../types'
import SearchableSelect from './SearchableSelect'

// The group's SBUs, always offered in every SBU dropdown (in this order).
// Ones not yet in the company list are created the first time someone picks them.
export const DEFAULT_SBUS = [
  'Anwar Group Ltd',
  'Anwar Cement Ltd',
  'Anwar Ispat Ltd',
  'A-One Polymer Ltd',
  'Anwar Galvanizing Ltd',
  'Anwar Textile Ltd',
  'Anwar Landmark Ltd',
  'Anwar Jute Spinning Mills Ltd',
  'Anwar Cement Sheet Ltd',
  'Anwar Organic Ltd',
  'Anwar Denim Ltd',
]

const PENDING = 'sbu:'

/** an SBU from the list above that isn't a company in the database yet */
export const isPendingSbu = (v: string) => v.startsWith(PENDING)

// "Anwar Cement", "Anwar Cement Ltd." and "anwar cement limited" are the same SBU.
export const norm = (s: string) => s.toLowerCase().replace(/\b(ltd|limited)\b/g, '').replace(/[^a-z0-9]/g, '')

// Other spellings already used in the company list for the same SBU.
const ALIASES: Record<string, string[]> = {
  'A-One Polymer Ltd': ['A1 Polymar', 'A1 Polymer', 'A-One Polymar'],
}
const KEY_OF = new Map<string, string>()
for (const name of DEFAULT_SBUS) {
  for (const n of [name, ...(ALIASES[name] ?? [])]) KEY_OF.set(norm(n), norm(name))
}

/** Companies with the same key are the same SBU (a spelling of one of DEFAULT_SBUS, or the same name). */
export const sbuKey = (name: string) => KEY_OF.get(norm(name)) ?? norm(name)

/** Of several companies that are the same SBU, the one the dropdowns use: the official name, else the oldest. */
export function pickSbu<T extends { id: number; name: string }>(list: T[]): T | undefined {
  const official = DEFAULT_SBUS.find((n) => list.some((c) => norm(c.name) === norm(n)))
  return list.find((c) => official !== undefined && norm(c.name) === norm(official)) ?? [...list].sort((x, y) => x.id - y.id)[0]
}

// Initials, e.g. "Anwar Cement Sheet Ltd" -> "ACSL", made unique against the known codes.
function makeCode(name: string, taken: Set<string>) {
  const base = name.split(/[\s-]+/).filter(Boolean).map((w) => w[0].toUpperCase()).join('').slice(0, 10) || 'SBU'
  let code = base
  for (let i = 2; taken.has(code); i++) code = `${base}${i}`
  return code
}

type Option = Pick<Company, 'id' | 'name'> & { code?: string }

interface Props {
  value: string
  companies: Option[]
  onChange: (value: string) => void
  placeholder?: string
  /** false where nobody is logged in (sign-up): SBUs not yet in the database can't be created there,
   *  so picking one just passes its pending value on (see isPendingSbu) */
  canCreate?: boolean
  /** an SBU from the list was just added to the database (SbuMultiSelect shows its name) */
  onCreated?: (company: Option) => void
  onAddNew?: () => void
  addLabel?: string
  onRemove?: (value: string) => void
  removeLabel?: string
}

export default function SbuSelect({ value, companies, onChange, placeholder = 'Search SBU…', canCreate = true, onCreated, ...rest }: Props) {
  const [created, setCreated] = useState<Option[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const all = [...companies, ...created.filter((c) => !companies.some((x) => x.id === c.id))]
  // duplicates of one SBU show once; a record still on another copy keeps showing its own
  const groups = new Map<string, Option[]>()
  for (const c of all) groups.set(sbuKey(c.name), [...(groups.get(sbuKey(c.name)) ?? []), c])
  const defaults = DEFAULT_SBUS.flatMap((name) => {
    const same = groups.get(norm(name)) ?? []
    const c = same.find((x) => String(x.id) === value) ?? pickSbu(same)
    // always the official name, whatever spelling the copy has
    return [{ value: c ? String(c.id) : PENDING + name, label: name }]
  })
  const officialKeys = new Set(DEFAULT_SBUS.map(norm))
  const others = all
    .filter((c) => !officialKeys.has(sbuKey(c.name)))
    .map((c) => ({ value: String(c.id), label: c.name }))

  const pick = async (v: string) => {
    setError('')
    if (!v.startsWith(PENDING) || !canCreate) return onChange(v)
    const name = v.slice(PENDING.length)
    setBusy(true)
    try {
      const taken = new Set(all.map((c) => (c.code ?? '').toUpperCase()))
      let company: Company | undefined
      // a code clash with a company we don't know about - try the next suffix
      for (let tries = 0; !company && tries < 5; tries++) {
        const code = makeCode(name, taken)
        try {
          company = await api.post<Company>('/organizations/companies', { name, code, is_active: true })
        } catch (e) {
          if (tries === 4) throw e
          taken.add(code)
        }
      }
      setCreated((prev) => [...prev, company!])
      onCreated?.(company!)
      onChange(String(company!.id))
    } catch (e: any) {
      setError(`Could not add ${name}: ${e?.message ?? e}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <SearchableSelect
        value={value}
        items={[...defaults, ...others]}
        onChange={pick}
        placeholder={busy ? 'Adding SBU…' : placeholder}
        removable={(v) => !v.startsWith(PENDING)}
        {...rest}
      />
      {error && <div className="small" style={{ color: 'var(--red)', marginTop: 4 }}>{error}</div>}
    </>
  )
}
