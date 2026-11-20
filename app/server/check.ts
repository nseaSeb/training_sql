import type pg from 'pg'
import { compareGrids, type CheckOutcome, type Grid } from '../src/lib/checkResult'
import { transactionControl } from '../src/lib/statements'
import { solutionFor, type Exercise, type ExerciseEngine } from '../src/content/exercises'
import type { EngineResponse } from './engines/types'

type Side = { ok: true; grid: Grid } | { ok: false; error: string }
/** Exécute sql puis check dans une transaction toujours annulée. */
export type Runner = (sql: string, check?: string) => Promise<Side>

/** Dernier résultat avec colonnes d'une réponse de moteur. */
export function lastGrid(r: EngineResponse): Side {
  if (!r.ok) return { ok: false, error: r.error.message }
  const last = [...r.results].reverse().find((x) => x.fields.length)
  if (!last) return { ok: false, error: 'La requête ne renvoie aucun résultat à comparer (pas de SELECT).' }
  return { ok: true, grid: { fields: last.fields, rows: last.rows as Grid['rows'] } }
}

/** Runner PostgreSQL sur une connexion du pool. */
export function pgRunner(client: pg.PoolClient): Runner {
  return async (sql, check) => {
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
}

export type CheckResponse =
  | (CheckOutcome & { expectedFields: string[] })
  | { ok: false; reason: string; error: true }

export async function checkExercise(run: Runner, ex: Exercise, sql: string, engine: ExerciseEngine = 'pg'): Promise<CheckResponse> {
  const solution = solutionFor(ex, engine)
  if (!solution) return { ok: false, reason: "Cet exercice n'est corrigé que sur PostgreSQL.", error: true }
  if (!sql.trim()) return { ok: false, reason: 'La réponse est vide.', error: true }
  const tx = transactionControl(sql)
  if (tx) return { ok: false, reason: `Retire ${tx} : la vérification gère elle-même la transaction et annule tout.`, error: true }
  const got = await run(sql, ex.check)
  if (!got.ok) return { ok: false, reason: `Erreur : ${got.error}`, error: true }
  const expected = await run(solution, ex.check)
  if (!expected.ok) throw new Error(`Solution de ${ex.id} (${engine}) en échec : ${expected.error}`)
  return { ...compareGrids(got.grid, expected.grid, ex.ordered), expectedFields: expected.grid.fields }
}
