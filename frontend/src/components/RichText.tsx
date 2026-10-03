import { useEffect, useRef, useState, type CSSProperties } from 'react'

// Small rich-text editor for long text fields (description, deliverable, objective).
// The text is stored as light markdown so older plain text stays valid and any
// place that shows the raw value still reads well:
//   **bold**   *italic*   ++underline++   "- " bullet line   "1. " numbered line
//   [text](https://link)   - and a plain https://... / www... address is a link by itself
// The view escapes everything first and only adds its own tags, so it is safe to render;
// links open in a new tab and only http(s) / mailto addresses become links.

type Marker = '**' | '*' | '++'
const TAG: Record<Marker, string> = { '**': 'b', '*': 'i', '++': 'u' }

const esc = (c: string) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c] ?? c
const escAll = (s: string) => s.replace(/[&<>"']/g, esc)

/** What someone typed as a link -> an address that is safe to open, or '' if it isn't one.
 *  "www.x.com" / "x.com/doc" get https://, "name@x.com" becomes mailto:. Only http(s) and mailto. */
export function safeUrl(raw: string): string {
  let u = raw.trim()
  if (!u || /\s/.test(u)) return ''
  if (!/^[a-z][a-z0-9+.-]*:/i.test(u)) u = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/.test(u) ? `mailto:${u}` : `https://${u}`
  return /^(https?:\/\/[^\s/]+|mailto:[^\s@]+@[^\s@]+)/i.test(u) ? u : ''
}

const linkHtml = (url: string, text: string) =>
  `<a href="${escAll(url)}" target="_blank" rel="noopener noreferrer">${escAll(text)}</a>`

/** One line of markdown -> inline HTML. A marker without a partner stays as literal text. */
function inlineHtml(s: string): string {
  const toks: { m?: Marker; x?: string; h?: string }[] = []
  for (let i = 0; i < s.length;) {
    // [text](address): one unit, so a * or ++ inside the address is not formatting
    const md = s[i] === '[' ? /^\[([^\]\n]+)\]\(([^)\s]+)\)/.exec(s.slice(i)) : null
    const mdUrl = md ? safeUrl(md[2]) : ''
    if (md && mdUrl) { toks.push({ h: linkHtml(mdUrl, md[1]) }); i += md[0].length; continue }
    // a plain address typed or pasted into the text
    const bare = (i === 0 || !/[A-Za-z0-9]/.test(s[i - 1])) ? /^(https?:\/\/|www\.)[^\s<>"]+/i.exec(s.slice(i)) : null
    if (bare) {
      const text = bare[0].replace(/[.,;:!?)\]]+$/, '') // punctuation after the address is not part of it
      const url = safeUrl(text)
      if (url) { toks.push({ h: linkHtml(url, text) }); i += text.length; continue }
    }
    const two = s.slice(i, i + 2)
    if (two === '**' || two === '++') { toks.push({ m: two }); i += 2 }
    else if (s[i] === '*') { toks.push({ m: '*' }); i++ }
    else { toks.push({ x: s[i] }); i++ }
  }
  // pair each kind of marker in order: 1st opens, 2nd closes, ...; an odd one out is literal
  const role = new Map<number, 'open' | 'close'>()
  ;(['**', '*', '++'] as Marker[]).forEach((m) => {
    const at = toks.flatMap((t, i) => (t.m === m ? [i] : []))
    for (let k = 0; k + 1 < at.length; k += 2) { role.set(at[k], 'open'); role.set(at[k + 1], 'close') }
  })
  // keep tags properly nested: closing an outer tag closes and reopens the inner ones
  const stack: Marker[] = []
  const out = toks.map((t, i) => {
    if (t.h) return t.h
    if (!t.m) return esc(t.x!)
    const r = role.get(i)
    if (r === 'open') { stack.push(t.m); return `<${TAG[t.m]}>` }
    if (r !== 'close') return esc(t.m)
    const inner = stack.splice(stack.lastIndexOf(t.m))
    inner.shift()
    stack.push(...inner)
    return [...inner].reverse().map((m) => `</${TAG[m]}>`).join('') + `</${TAG[t.m]}>` + inner.map((m) => `<${TAG[m]}>`).join('')
  }).join('')
  return out + [...stack].reverse().map((m) => `</${TAG[m]}>`).join('')
}

/** Light markdown -> HTML (for the editor and for read-only views). */
export function mdToHtml(md: string | null | undefined): string {
  const lines = (md ?? '').replace(/\r\n?/g, '\n').split('\n')
  let html = ''
  let list: 'ul' | 'ol' | null = null
  const endList = () => { if (list) { html += `</${list}>`; list = null } }
  for (const line of lines) {
    const bullet = /^\s*[-•*]\s+(.*)$/.exec(line)
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    const kind = bullet ? 'ul' : num ? 'ol' : null
    if (kind) {
      if (list !== kind) { endList(); html += `<${kind}>`; list = kind }
      html += `<li>${inlineHtml((bullet ?? num)![1])}</li>`
    } else {
      endList()
      html += `<div>${line.trim() ? inlineHtml(line) : '<br>'}</div>`
    }
  }
  endList()
  return html
}

const BLOCK = new Set(['DIV', 'P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'PRE', 'SECTION', 'ARTICLE', 'TABLE', 'TR'])

/** Editor DOM -> light markdown. */
export function htmlToMd(root: HTMLElement): string {
  const lines: string[] = []
  let cur: string | null = null
  const open = () => { if (cur === null) cur = '' }
  const close = () => { if (cur !== null) { lines.push(cur); cur = null } }

  const walk = (n: Node) => {
    if (n.nodeType === Node.TEXT_NODE) {
      const t = (n.textContent ?? '').replace(/ /g, ' ').replace(/\n/g, ' ')
      if (t) { open(); cur += t }
      return
    }
    if (!(n instanceof HTMLElement)) return
    const tag = n.tagName
    if (tag === 'BR') {
      // the trailing <br> the browser keeps in a line that has text is not a line break
      const trailing = !n.nextSibling && n.parentElement && n.parentElement !== root && BLOCK.has(n.parentElement.tagName)
      if (trailing && cur !== null) return
      open(); close()
      return
    }
    if (tag === 'UL' || tag === 'OL') {
      close()
      let i = 0
      n.childNodes.forEach((li) => {
        if (li instanceof HTMLElement && li.tagName === 'LI') {
          i++
          close()
          cur = tag === 'UL' ? '- ' : `${i}. `
          li.childNodes.forEach(walk)
          close()
        } else walk(li)
      })
      return
    }
    if (tag === 'A') {
      // a link is one unit: "[text](address)", or just the address when that is the text
      const text = (n.textContent ?? '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim()
      const url = safeUrl(n.getAttribute('href') ?? '')
      if (!text) return
      open()
      cur += !url ? text : (text === url || safeUrl(text) === url) && /^(https?:\/\/|www\.)/i.test(text) ? text : `[${text.replace(/[\[\]]/g, '')}](${url})`
      return
    }
    const st = n.style
    const marks: Marker[] = []
    if (tag === 'B' || tag === 'STRONG' || st.fontWeight === 'bold' || Number(st.fontWeight) >= 600) marks.push('**')
    if (tag === 'I' || tag === 'EM' || st.fontStyle === 'italic') marks.push('*')
    if (tag === 'U' || st.textDecoration.includes('underline') || st.textDecorationLine?.includes('underline')) marks.push('++')
    if (!(n.textContent ?? '').trim()) marks.length = 0 // formatting on nothing (or only spaces) is dropped
    const block = BLOCK.has(tag) || tag === 'LI'
    if (block) close()
    if (marks.length) { open(); cur += marks.join('') }
    n.childNodes.forEach(walk)
    if (marks.length) { open(); cur += [...marks].reverse().join('') }
    if (block) close()
  }

  root.childNodes.forEach(walk)
  close()
  const md = lines
    .map((l) => l.replace(/\*\*\*\*|\+\+\+\+/g, '').replace(/\s+$/, ''))
    .join('\n')
  return md.replace(/^\n+|\n+$/g, '')
}

/** Read-only display of a rich-text value. */
export function RichTextView({ text, empty = '—' }: { text?: string | null; empty?: string }) {
  if (!text || !text.trim()) return <span className="muted">{empty}</span>
  return <div className="rich-text" dangerouslySetInnerHTML={{ __html: mdToHtml(text) }} />
}

const TOOLS: { cmd: string; label: string; title: string; style?: CSSProperties }[] = [
  { cmd: 'bold', label: 'B', title: 'Bold (Ctrl+B)', style: { fontWeight: 800 } },
  { cmd: 'italic', label: 'I', title: 'Italic (Ctrl+I)', style: { fontStyle: 'italic', fontFamily: 'Georgia, serif' } },
  { cmd: 'underline', label: 'U', title: 'Underline (Ctrl+U)', style: { textDecoration: 'underline' } },
  { cmd: 'insertUnorderedList', label: '• List', title: 'Bullet points' },
  { cmd: 'insertOrderedList', label: '1. List', title: 'Numbered list' },
  { cmd: 'removeFormat', label: '✕ Clear', title: 'Remove bold / italic / underline from the selection' },
]

export function RichTextEditor({ value, onChange, placeholder, rows = 3, disabled = false }: {
  value: string
  onChange: (md: string) => void
  placeholder?: string
  /** minimum height, in text lines */
  rows?: number
  disabled?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const last = useRef<string | null>(null) // the value we last emitted, so typing doesn't reset the caret
  const [active, setActive] = useState<Record<string, boolean>>({})
  const [empty, setEmpty] = useState(!value.trim())

  useEffect(() => {
    if (ref.current && value !== last.current) {
      ref.current.innerHTML = mdToHtml(value)
      last.current = value
      setEmpty(!value.trim())
    }
  }, [value])

  // which buttons are "on" for the current selection
  useEffect(() => {
    const update = () => {
      if (!ref.current || !ref.current.contains(document.getSelection()?.anchorNode ?? null)) return
      const s: Record<string, boolean> = {}
      TOOLS.forEach((t) => { try { s[t.cmd] = document.queryCommandState(t.cmd) } catch { /* unsupported */ } })
      setActive(s)
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [])

  const emit = () => {
    if (!ref.current) return
    const md = htmlToMd(ref.current)
    last.current = md
    setEmpty(!md.trim())
    onChange(md)
  }

  const run = (cmd: string) => {
    if (disabled || !ref.current) return
    ref.current.focus()
    try { document.execCommand('styleWithCSS', false, 'false') } catch { /* ignore */ }
    document.execCommand(cmd)
    if (cmd === 'removeFormat') document.execCommand('unlink') // "Clear" also turns a link back into text
    emit()
  }

  // "Link": the selected words become a link; with nothing selected the address itself is inserted
  const addLink = () => {
    if (disabled || !ref.current) return
    const sel = document.getSelection()
    const inside = !!sel && sel.rangeCount > 0 && ref.current.contains(sel.anchorNode)
    const range = inside ? sel!.getRangeAt(0).cloneRange() : null
    const picked = range ? range.toString().trim() : ''
    const typed = prompt(picked ? `Link address for "${picked.slice(0, 60)}":` : 'Link address (document, page or email):', picked && safeUrl(picked) && /[./@]/.test(picked) ? picked : 'https://')
    if (typed === null) return
    const url = safeUrl(typed)
    if (!url) { alert('That does not look like a link. Use an address like https://example.com/document'); return }
    ref.current.focus()
    const s2 = document.getSelection()
    if (s2) {
      s2.removeAllRanges()
      if (range) s2.addRange(range) // the prompt may have dropped the selection
      else { const end = document.createRange(); end.selectNodeContents(ref.current); end.collapse(false); s2.addRange(end) }
    }
    if (picked) document.execCommand('createLink', false, url)
    else document.execCommand('insertHTML', false, `${linkHtml(url, typed.trim())}&nbsp;`)
    emit()
  }

  return (
    <div className={`rte${disabled ? ' disabled' : ''}`}>
      <div className="rte-toolbar" role="toolbar" aria-label="Formatting">
        {TOOLS.map((t) => (
          <button key={t.cmd} type="button" className={`rte-btn${active[t.cmd] ? ' on' : ''}`} title={t.title} style={t.style}
            disabled={disabled} aria-pressed={!!active[t.cmd]}
            onMouseDown={(e) => { e.preventDefault(); run(t.cmd) }}>
            {t.label}
          </button>
        ))}
        <button type="button" className="rte-btn" title="Add a link: select the words first, or just click to insert an address"
          disabled={disabled} onMouseDown={(e) => { e.preventDefault(); addLink() }}>
          🔗 Link
        </button>
      </div>
      <div
        ref={ref}
        className={`rte-area rich-text${empty ? ' is-empty' : ''}`}
        style={{ minHeight: `${rows * 1.6 + 1}em` }}
        contentEditable={!disabled}
        suppressContentEditableWarning
        role="textbox"
        aria-multiline
        data-placeholder={placeholder ?? ''}
        onInput={emit}
        onBlur={emit}
        // a link inside the editor: Ctrl + click (or middle click) opens it; a plain click edits the text
        onClick={(e) => {
          const a = (e.target as HTMLElement).closest?.('a')
          const url = a ? safeUrl(a.getAttribute('href') ?? '') : ''
          if (url && (e.ctrlKey || e.metaKey || disabled)) { e.preventDefault(); window.open(url, '_blank', 'noopener,noreferrer') }
        }}
        // paste as plain text so formatting from Word / web pages doesn't come along
        onPaste={(e) => {
          e.preventDefault()
          document.execCommand('insertText', false, e.clipboardData.getData('text/plain'))
        }}
      />
    </div>
  )
}
