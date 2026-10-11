import { ReactNode, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth'
import { useIsPrivileged } from '../usePrivileged'
import { GUIDE } from '../guide/content'
import { Block, Chapter, L, Lang, Section } from '../guide/types'

// User Guide: how to use every part of the system, in English and Bangla (one button
// switches). The text lives in guide/content.ts; the admin chapters are shown to admin and
// the privileged roles only. Also used as the Admin Panel's "User Guide" tab (adminFirst).

const UI = {
  title: { en: 'User Guide', bn: 'ব্যবহার নির্দেশিকা' },
  crumb: { en: 'How to use every part of the system, step by step', bn: 'সিস্টেমের প্রতিটি অংশ কীভাবে ব্যবহার করবেন — ধাপে ধাপে' },
  switchTo: { en: 'বাংলায় দেখুন', bn: 'View in English' },
  search: { en: 'Search the guide…', bn: 'নির্দেশিকায় খুঁজুন…' },
  contents: { en: 'Contents', bn: 'সূচিপত্র' },
  none: { en: 'Nothing in the guide matches this search.', bn: 'এই অনুসন্ধানের সাথে নির্দেশিকার কিছু মেলেনি।' },
  adminOnly: { en: 'Admin & privileged roles', bn: 'অ্যাডমিন ও প্রিভিলেজড রোল' },
  top: { en: 'Back to top', bn: 'উপরে যান' },
  found: { en: 'sections found', bn: 'টি অংশ পাওয়া গেছে' },
  tip: { en: 'Tip', bn: 'পরামর্শ' },
  warn: { en: 'Important', bn: 'গুরুত্বপূর্ণ' },
  info: { en: 'Note', bn: 'জেনে রাখুন' },
} satisfies Record<string, L>

const LANG_KEY = 'guide_lang'
const readLang = (): Lang => { try { return localStorage.getItem(LANG_KEY) === 'bn' ? 'bn' : 'en' } catch { return 'en' } }

/** **bold** inside guide text */
function rich(text: string): ReactNode {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? <strong key={i}>{part.slice(2, -2)}</strong> : part)
}

const blockText = (b: Block, lang: Lang): string =>
  b.kind === 'p' || b.kind === 'note' || b.kind === 'h' ? b.text[lang]
    : b.kind === 'table' ? [...b.head, ...b.rows.flat()].map((x) => x[lang]).join(' ')
      : b.items.map((x) => x[lang]).join(' ')

function BlockView({ b, lang }: { b: Block; lang: Lang }) {
  switch (b.kind) {
    case 'p': return <p>{rich(b.text[lang])}</p>
    case 'h': return <h4>{rich(b.text[lang])}</h4>
    case 'steps': return <ol className="guide-steps">{b.items.map((x, i) => <li key={i}>{rich(x[lang])}</li>)}</ol>
    case 'list': return <ul>{b.items.map((x, i) => <li key={i}>{rich(x[lang])}</li>)}</ul>
    case 'note': return (
      <div className={`guide-note ${b.tone}`}>
        <strong>{UI[b.tone][lang]}:</strong> {rich(b.text[lang])}
      </div>
    )
    case 'table': return (
      <div className="guide-table">
        <table>
          <thead><tr>{b.head.map((x, i) => <th key={i}>{x[lang]}</th>)}</tr></thead>
          <tbody>{b.rows.map((r, i) => <tr key={i}>{r.map((x, j) => <td key={j}>{rich(x[lang])}</td>)}</tr>)}</tbody>
        </table>
      </div>
    )
  }
}

export default function Guide({ adminFirst = false, embedded = false }: { adminFirst?: boolean; embedded?: boolean }) {
  const { user } = useAuth()
  const privileged = useIsPrivileged(user?.role)
  const [lang, setLang] = useState<Lang>(readLang)
  const [q, setQ] = useState('')

  useEffect(() => { try { localStorage.setItem(LANG_KEY, lang) } catch { /* private window: just not remembered */ } }, [lang])

  const chapters = useMemo(() => {
    const mine = GUIDE.filter((c) => c.audience === 'all' || privileged)
    return adminFirst ? [...mine.filter((c) => c.audience === 'admin'), ...mine.filter((c) => c.audience !== 'admin')] : mine
  }, [privileged, adminFirst])

  // the search looks through both languages, so an English word finds the Bangla page too
  const shown = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    if (!words.length) return chapters
    const hit = (c: Chapter, s: Section) => {
      const hay = (['en', 'bn'] as Lang[]).map((l) => [c.title[l], s.title[l], s.lead?.[l] ?? '', ...s.blocks.map((b) => blockText(b, l))].join(' ')).join(' ').toLowerCase()
      return words.every((w) => hay.includes(w))
    }
    return chapters.map((c) => ({ ...c, sections: c.sections.filter((s) => hit(c, s)) })).filter((c) => c.sections.length)
  }, [chapters, q])
  const count = shown.reduce((n, c) => n + c.sections.length, 0)

  const go = (id: string) => document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const langButton = (
    <button className="btn gold guide-lang" onClick={() => setLang(lang === 'en' ? 'bn' : 'en')} lang={lang === 'en' ? 'bn' : 'en'}>
      🌐 {UI.switchTo[lang]}
    </button>
  )

  return (
    <div className="guide" lang={lang} id="guide-top">
      {!embedded && (
        <div className="topbar">
          <div>
            <h1>{UI.title[lang]}</h1>
            <div className="crumb">{UI.crumb[lang]}</div>
          </div>
          {langButton}
        </div>
      )}

      <div className="card mb guide-bar">
        <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={UI.search[lang]} aria-label={UI.search[lang]} />
        {q.trim() && <span className="small muted">{count} {UI.found[lang]}</span>}
        {embedded && langButton}
      </div>

      {shown.length === 0 ? <div className="card empty">{UI.none[lang]}</div> : (
        <div className="guide-layout">
          <nav className="card guide-toc" aria-label={UI.contents[lang]}>
            <div className="guide-toc-title">{UI.contents[lang]}</div>
            {shown.map((c) => (
              <div key={c.id}>
                <button type="button" className="guide-toc-ch" onClick={() => go(c.id)}>
                  {c.title[lang]}
                </button>
                {c.sections.map((s) => (
                  <button type="button" key={s.id} className="guide-toc-s" onClick={() => go(s.id)}>{s.title[lang]}</button>
                ))}
              </div>
            ))}
          </nav>

          <div className="guide-body">
            {shown.map((c) => (
              <section key={c.id} id={`guide-${c.id}`} className="guide-chapter">
                <h2>
                  {c.title[lang]}
                  {c.audience === 'admin' && <span className="badge gold">{UI.adminOnly[lang]}</span>}
                </h2>
                {c.sections.map((s) => (
                  <article key={s.id} id={`guide-${s.id}`} className="card guide-section">
                    <h3>{s.title[lang]}</h3>
                    {s.lead && <div className="guide-lead">{rich(s.lead[lang])}</div>}
                    {s.blocks.map((b, i) => <BlockView key={i} b={b} lang={lang} />)}
                  </article>
                ))}
              </section>
            ))}
            <div style={{ textAlign: 'center' }}>
              <button className="btn sm" onClick={() => go('top')}>↑ {UI.top[lang]}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
