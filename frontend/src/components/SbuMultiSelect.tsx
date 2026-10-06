import { useState } from 'react'
import type { Company } from '../types'
import { sbuLabel } from '../org'
import SbuSelect, { sbuKey } from './SbuSelect'

type Option = Pick<Company, 'id' | 'name'> & { code?: string }

interface Props {
  /** company ids, the first SBU first */
  values: string[]
  companies: Option[]
  onChange: (values: string[]) => void
  placeholder?: string
  onAddNew?: () => void
  addLabel?: string
  onRemove?: (value: string) => void
  removeLabel?: string
}

/**
 * The SBUs of a project / task: every pick is added as a tag, ✕ on a tag takes it off.
 * To change the SBU, remove the old tag and pick the new one. The first tag is the main SBU.
 */
export default function SbuMultiSelect({ values, companies, onChange, placeholder = 'Search SBU…', ...rest }: Props) {
  // SBUs created from the dropdown aren't in the parent's list yet
  const [created, setCreated] = useState<Option[]>([])
  const all = [...companies, ...created.filter((c) => !companies.some((x) => x.id === c.id))]
  const find = (v: string) => all.find((c) => String(c.id) === v)
  const keyOf = (v: string) => { const c = find(v); return c ? sbuKey(c.name) : v }

  // the same SBU (also under another spelling) is never added twice
  const add = (v: string) => {
    if (v && !values.some((x) => keyOf(x) === keyOf(v))) onChange([...values, v])
  }

  return (
    <>
      {values.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
          {values.map((v) => {
            const name = find(v) ? sbuLabel(find(v)!.name) : `SBU #${v}`
            return (
              <span key={v} className="badge gray" style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                {name}
                <button
                  type="button"
                  onClick={() => onChange(values.filter((x) => x !== v))}
                  title={`Remove ${name}`}
                  aria-label={`Remove ${name}`}
                  style={{ border: 0, background: 'transparent', cursor: 'pointer', color: 'var(--red)', fontSize: 11, fontWeight: 600, padding: '0 2px', lineHeight: 1 }}
                >
                  ✕
                </button>
              </span>
            )
          })}
        </div>
      )}
      <SbuSelect
        value=""
        companies={all}
        onChange={add}
        onCreated={(c) => setCreated((l) => [...l, c])}
        placeholder={values.length ? 'Add another SBU…' : placeholder}
        {...rest}
      />
    </>
  )
}
