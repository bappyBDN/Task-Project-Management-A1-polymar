import { useEffect, useRef, useState } from 'react'
import { label } from '../constants'

export interface SelectItem {
  value: string
  label: string
}

interface Props {
  value: string
  items: SelectItem[]
  onChange: (value: string) => void
  placeholder?: string
  allowCustom?: boolean
  onAddNew?: () => void
  addLabel?: string
  onRemove?: (value: string) => void
  removeLabel?: string
}

const addRowStyle: React.CSSProperties = {
  padding: '8px 11px',
  cursor: 'pointer',
  fontSize: 13,
  fontWeight: 600,
  color: '#8a6d1f',
  background: 'var(--gold-soft)',
  borderBottom: '1px solid var(--line)',
  position: 'sticky',
  top: 0,
}

export default function SearchableSelect({
  value,
  items,
  onChange,
  placeholder = 'Select…',
  allowCustom = false,
  onAddNew,
  addLabel = 'Add new',
  onRemove,
  removeLabel = 'Remove',
}: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = items.find((o) => o.value === value)
  const filtered = items.filter((o) => o.label.toLowerCase().includes(query.toLowerCase()))
  const isCustom = value !== '' && !items.some((o) => o.value === value)
  const hasExactMatch = query.trim() !== '' && items.some((o) => o.label.toLowerCase() === query.trim().toLowerCase())

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const commitCustom = () => {
    const v = query.trim()
    if (allowCustom && v && !hasExactMatch) onChange(v)
    setOpen(false)
    setQuery('')
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={open ? query : isCustom ? label(value) : (selected?.label ?? '')}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true) }}
        onBlur={commitCustom}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); commitCustom() }
        }}
      />
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 60,
          background: '#fff', border: '1px solid var(--line)', borderRadius: 8,
          maxHeight: 240, overflowY: 'auto', boxShadow: '0 8px 24px rgba(16,30,54,0.12)',
        }}>
          {onAddNew && (
            <div style={addRowStyle} onMouseDown={(e) => e.preventDefault()} onClick={() => { onAddNew(); setOpen(false); setQuery('') }}>
              + {addLabel}
            </div>
          )}
          {allowCustom && query.trim() && !hasExactMatch && (
            <div style={addRowStyle} onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(query.trim()); setOpen(false); setQuery('') }}>
              + Add &ldquo;{query.trim()}&rdquo;
            </div>
          )}
          {filtered.map((o) => (
            <div
              key={o.value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => { onChange(o.value); setOpen(false); setQuery('') }}
              style={{
                padding: '8px 11px', cursor: 'pointer', fontSize: 13,
                background: o.value === value ? 'var(--gold-soft)' : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <span>{o.label}</span>
              {onRemove && (
                <span
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={(e) => { e.stopPropagation(); onRemove(o.value) }}
                  style={{ color: 'var(--red)', fontSize: 11, fontWeight: 600, padding: '2px 6px' }}
                  title={removeLabel}
                >
                  ✕
                </span>
              )}
            </div>
          ))}
          {filtered.length === 0 && !onAddNew && !(allowCustom && query.trim()) && (
            <div style={{ padding: '8px 11px', color: 'var(--muted)', fontSize: 12 }}>No matches</div>
          )}
        </div>
      )}
    </div>
  )
}
