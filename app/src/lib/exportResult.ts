import type { QueryResult } from './api'

/** Valeur affichable d'une cellule : NULL reste null, un objet (json, tableau) est sérialisé. */
export const fmt = (v: unknown) => (v === null ? null : typeof v === 'object' ? JSON.stringify(v) : String(v))

/** CSV (séparateur virgule, guillemets si besoin, NULL = champ vide) */
export function toCsv(r: QueryResult) {
  const cell = (v: unknown) => {
    const s = fmt(v) ?? ''
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [r.fields.map(cell), ...r.rows.map((row) => row.map(cell))].map((l) => l.join(',')).join('\n')
}

/** Tableau Markdown, à coller dans un ticket */
export function toMarkdown(r: QueryResult) {
  const cell = (v: unknown) => (fmt(v) ?? 'NULL').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')
  const line = (cells: unknown[]) => `| ${cells.map(cell).join(' | ')} |`
  return [line(r.fields), `|${r.fields.map(() => ' --- |').join('')}`, ...r.rows.map(line)].join('\n')
}
