/**
 * Vérifie chaque exercice contre les vraies bases (npm run test:db, bases du kit démarrées), pour
 * PostgreSQL et pour chaque autre base où il est corrigé : la solution se valide elle-même, son
 * résultat n'est pas vide, une réponse vide ou « SELECT 1 » échoue, et ne rien faire ne passe pas.
 */
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { exercises, solutionFor, type ExerciseEngine } from '../src/content/exercises'
import { checkExercise, lastGrid, pgRunner, type Runner } from './check'
import { getDataset } from './engines/dataset'
import { SqliteEngine } from './engines/sqlite'
import { MysqlEngine } from './engines/mysql'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://kit:kit@localhost:55433/training_sql'
// Variable distincte de MYSQL_URL du serveur : les tests suppriment et recréent cette base
const MYSQL_URL = process.env.MYSQL_TEST_URL ?? 'mysql://root:kit@localhost:33307/training_sql_test'
const pool = new pg.Pool({ connectionString: DATABASE_URL, options: '-c statement_timeout=15000 -c search_path=retail,public -c timezone=Europe/Paris', max: 1 })
const dir = mkdtempSync(join(tmpdir(), 'training-sql-ex-'))
const sqlite = new SqliteEngine(dir, 1000, 15000)
let mysqlDb: MysqlEngine | null = MYSQL_URL === 'off' ? null : new MysqlEngine({ url: MYSQL_URL, maxRows: 1000, timeoutMs: 15000 })
let client: pg.PoolClient

before(async () => {
  const ds = await getDataset(dir, DATABASE_URL, readFileSync(fileURLToPath(new URL('../../kit/01_setup_base.sql', import.meta.url)), 'utf8'))
  sqlite.init(ds)
  if (mysqlDb) {
    try {
      await mysqlDb.init(ds, 1)
      await mysqlDb.reset()
    } catch (e) {
      console.warn(`MySQL injoignable, tests MySQL ignorés : ${(e as Error).message}`)
      mysqlDb = null
    }
  }
  client = await pool.connect()
})
after(async () => {
  client?.release()
  await pool.end()
  rmSync(dir, { recursive: true, force: true })
})

const runners: Record<ExerciseEngine, () => Runner | null> = {
  pg: () => pgRunner(client),
  sqlite: () => async (s, c) => lastGrid(await sqlite.rolledBack(s, c)),
  mysql: () => (mysqlDb ? async (s, c) => lastGrid(await mysqlDb.rolledBack(s, c)) : null),
}

test('identifiants uniques', () => {
  assert.equal(new Set(exercises.map((e) => e.id)).size, exercises.length)
})

for (const ex of exercises) {
  for (const engine of ['pg', 'sqlite', 'mysql'] as ExerciseEngine[]) {
    const solution = solutionFor(ex, engine)
    if (!solution) continue
    test(`${ex.id} · ${ex.title} · ${engine}`, async (t) => {
      const run = runners[engine]()
      if (!run) return t.skip('MySQL indisponible')
      const self = await checkExercise(run, ex, solution, engine)
      assert.ok(self.ok, `la solution ne se valide pas : ${!self.ok ? self.reason : ''}`)
      assert.ok(self.ok && self.rows > 0, 'résultat attendu vide : une réponse vide passerait')
      for (const wrong of ['SELECT 1', ' ']) assert.equal((await checkExercise(run, ex, wrong, engine)).ok, false, `« ${wrong} » ne doit pas passer`)
      if (ex.check) assert.equal((await checkExercise(run, ex, 'SELECT 1 WHERE 1 = 0', engine)).ok, false, 'ne rien faire passe la vérification')
    })
  }
}
