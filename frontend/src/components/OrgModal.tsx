import { useState } from 'react'
import { api } from '../api'

// "+ Add new SBU / function / department" from a form's dropdown (Task form, and the
// tasks section of the Project form).
export default function OrgModal({ kind, functionId, onClose, onCreated }: {
  kind: 'company' | 'function' | 'department'
  /** a new department is put under this function (the one picked in the form), if any */
  functionId?: number | null
  onClose: () => void
  onCreated: (o: any) => void
}) {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const titles = { company: 'New SBU', function: 'New Function', department: 'New Department' }

  const submit = async () => {
    if (!name.trim()) { setErr(`${titles[kind]} name is required`); return }
    setBusy(true)
    setErr('')
    try {
      const payload: any = { name: name.trim() }
      if (kind !== 'department') payload.code = code.trim() || name.trim().slice(0, 3).toUpperCase()
      else if (functionId) payload.function_id = functionId
      let o
      if (kind === 'company') o = await api.post('/organizations/companies', payload)
      else if (kind === 'function') o = await api.post('/organizations/functions', payload)
      else o = await api.post('/organizations/departments', payload)
      onCreated(o)
    } catch (e: any) { setErr(e.message) } finally { setBusy(false) }
  }

  return (
    <div className="modal-backdrop" onClick={(e) => e.stopPropagation()}>
      <div className="modal" style={{ width: 440 }} onClick={(e) => e.stopPropagation()}>
        <h2>{titles[kind]}</h2>
        {err && <div className="badge red" style={{ marginBottom: 12 }}>{err}</div>}
        <label>Name *</label>
        <input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        {kind !== 'department' && <><label>Code</label><input value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. ACS" /></>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving…' : 'Create'}</button>
        </div>
      </div>
    </div>
  )
}
