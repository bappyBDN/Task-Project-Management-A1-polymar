// User Guide content model (pages/Guide.tsx renders it). Every piece of text is written
// twice, English and Bangla, so the page can switch language without reloading.

export type Lang = 'en' | 'bn'
export interface L { en: string; bn: string }
export const t = (en: string, bn: string): L => ({ en, bn })

export type Block =
  | { kind: 'p'; text: L }
  /** numbered steps, done in order */
  | { kind: 'steps'; items: L[] }
  | { kind: 'list'; items: L[] }
  | { kind: 'table'; head: L[]; rows: L[][] }
  /** a highlighted box: tip (good practice), warn (a mistake to avoid), info */
  | { kind: 'note'; tone: 'tip' | 'warn' | 'info'; text: L }
  /** a smaller heading inside a section */
  | { kind: 'h'; text: L }

export interface Section {
  id: string
  title: L
  /** one line under the title: what the section answers */
  lead?: L
  blocks: Block[]
}

export interface Chapter {
  id: string
  title: L
  /** admin = shown to admin and the privileged roles only */
  audience: 'all' | 'admin'
  sections: Section[]
}

export const p = (en: string, bn: string): Block => ({ kind: 'p', text: t(en, bn) })
export const h = (en: string, bn: string): Block => ({ kind: 'h', text: t(en, bn) })
export const steps = (...items: L[]): Block => ({ kind: 'steps', items })
export const list = (...items: L[]): Block => ({ kind: 'list', items })
export const table = (head: L[], ...rows: L[][]): Block => ({ kind: 'table', head, rows })
export const tip = (en: string, bn: string): Block => ({ kind: 'note', tone: 'tip', text: t(en, bn) })
export const warn = (en: string, bn: string): Block => ({ kind: 'note', tone: 'warn', text: t(en, bn) })
export const info = (en: string, bn: string): Block => ({ kind: 'note', tone: 'info', text: t(en, bn) })
