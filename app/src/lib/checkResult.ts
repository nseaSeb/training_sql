/**
 * Compare le résultat d'une requête d'apprenant à celui de la solution de référence.
 * Les colonnes se comparent par position (les alias sont libres), les lignes comme un multiensemble
 * sauf si l'ordre est demandé. Les nombres sont canonisés : 12.50 = 12.5, 5 (int) = '5' (bigint en texte).
 */
export type Cell = string | number | boolean | null | object
export type Grid = { fields: string[]; rows: Cell[][] }
export type CheckOutcome =
  | { ok: true; rows: number }
  | { ok: false; reason: string; missing: string[][]; extra: string[][] }

const NUMERIC = /^-?\d+(\.\d+)?$/

/** Forme canonique d'une cellule : texte comparable, NULL distinct de la chaîne « NULL ». */
export function canon(v: Cell): string {
  if (v === null) return '\u0000NULL'
  if (typeof v === 'number') v = String(v)
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 't' : 'f'
  if (NUMERIC.test(v) && v.includes('.')) return v.replace(/\.?0+$/, '')
  return v
}

const display = (row: string[]) => row.map((c) => (c === '\u0000NULL' ? 'NULL' : c))
const key = (row: string[]) => JSON.stringify(row)

export function compareGrids(got: Grid, expected: Grid, ordered = false, sample = 5): CheckOutcome {
  const fail = (reason: string, missing: string[][] = [], extra: string[][] = []): CheckOutcome => ({ ok: false, reason, missing, extra })
  if (got.fields.length !== expected.fields.length) {
    return fail(`${got.fields.length} colonne(s) au lieu de ${expected.fields.length} attendue(s) (${expected.fields.join(', ')}).`)
  }
  const g = got.rows.map((r) => r.map(canon))
  const e = expected.rows.map((r) => r.map(canon))

  if (ordered) {
    const same = g.length === e.length && g.every((r, i) => key(r) === key(e[i]))
    if (same) return { ok: true, rows: e.length }
  }

  // Multiensemble : on retire de « attendu » chaque ligne obtenue qui y figure
  const pool = new Map<string, number>()
  for (const r of e) pool.set(key(r), (pool.get(key(r)) ?? 0) + 1)
  const extra: string[][] = []
  for (const r of g) {
    const n = pool.get(key(r)) ?? 0
    if (n > 0) pool.set(key(r), n - 1)
    else extra.push(r)
  }
  const missing: string[][] = []
  for (const r of e) {
    const n = pool.get(key(r)) ?? 0
    if (n > 0) {
      missing.push(r)
      pool.set(key(r), n - 1)
    }
  }
  const sampleOf = (rows: string[][]) => rows.slice(0, sample).map(display)

  if (!missing.length && !extra.length) {
    return ordered ? fail("Les bonnes lignes, mais pas dans l'ordre demandé.") : { ok: true, rows: e.length }
  }
  const counts = g.length === e.length ? `${g.length} ligne(s), le bon nombre` : `${g.length} ligne(s) au lieu de ${e.length}`
  const parts = [missing.length && `${missing.length} ligne(s) attendue(s) absente(s)`, extra.length && `${extra.length} ligne(s) en trop ou différente(s)`].filter(Boolean)
  return fail(`${counts} : ${parts.join(', ')}.`, sampleOf(missing), sampleOf(extra))
}
