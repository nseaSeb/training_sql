import type pg from 'pg'
import { compareGrids, type CheckOutcome, type Grid } from '../src/lib/checkResult'
import { transactionControl } from '../src/lib/statements'
import type { Exercise } from '../src/content/exercises'

type Side = { ok: true; grid: Grid } | { ok: false; error: string }

/** Exécute sql (puis check) dans une transaction toujours annulée ; renvoie le dernier résultat avec colonnes. */
async function runSide(client: pg.PoolClient, sql: string, check?: string): Promise<Side> {
  await client.query('BEGIN')
  try {
    const raw = await client.query({ text: sql, rowMode: 'array' } as pg.QueryConfig)
    let list = (Array.isArray(raw) ? raw : [raw]) as pg.QueryArrayResult[]
    if (check) list = [(await client.query({ text: check, rowMode: 'array' } as pg.QueryConfig)) as pg.QueryArrayResult]
    const last = [...list].reverse().find((r) => r.fields?.length)
    if (!last) return { ok: false, error: 'La requête ne renvoie aucun résultat à comparer (pas de SELECT).' }
    return { ok: true, grid: { fields: last.fields.map((f) => f.name), rows: last.rows } }
  } catch (e) {
    return { ok: false, error: (e as Error).message }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
  }
}

export type CheckResponse =
  | (CheckOutcome & { expectedFields: string[] })
  | { ok: false; reason: string; error: true }

export async function checkExercise(client: pg.PoolClient, ex: Exercise, sql: string): Promise<CheckResponse> {
  if (!sql.trim()) return { ok: false, reason: 'La réponse est vide.', error: true }
  const tx = transactionControl(sql)
  if (tx) return { ok: false, reason: `Retire ${tx} : la vérification gère elle-même la transaction et annule tout.`, error: true }
  const got = await runSide(client, sql, ex.check)
  if (!got.ok) return { ok: false, reason: `Erreur : ${got.error}`, error: true }
  const expected = await runSide(client, ex.solution, ex.check)
  if (!expected.ok) throw new Error(`Solution de ${ex.id} en échec : ${expected.error}`)
  return { ...compareGrids(got.grid, expected.grid, ex.ordered), expectedFields: expected.grid.fields }
}
