/** Les autres moteurs reçoivent exactement les données du kit PostgreSQL (npm run test:db, base chargée). */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDataset } from './engines/dataset'
import { SqliteEngine } from './engines/sqlite'
import { MysqlEngine } from './engines/mysql'

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://kit:kit@localhost:55433/training_sql'
const SETUP = readFileSync(fileURLToPath(new URL('../../kit/01_setup_base.sql', import.meta.url)), 'utf8')
const dir = mkdtempSync(join(tmpdir(), 'training-sql-'))
after(() => rmSync(dir, { recursive: true, force: true }))

test('SQLite : mêmes tables, mêmes nombres de lignes, mêmes sommes que le kit', async () => {
  const ds = await getDataset(dir, DATABASE_URL, SETUP)
  const sqlite = new SqliteEngine(dir, 1000, 15000)
  sqlite.init(ds)
  for (const t of ds.tables) {
    const r = await sqlite.query(`SELECT count(*) FROM "${t.name}"`)
    assert.ok(r.ok, `${t.name} illisible`)
    assert.equal(r.ok && Number(r.results[0].rows[0][0]), t.rows.length, `${t.name} : nombre de lignes`)
  }
  const r = await sqlite.query("SELECT round(sum(total_ttc), 2), count(*) FILTER (WHERE statut = 'ANNULE') FROM tickets_caisse")
  assert.ok(r.ok)
  assert.deepEqual(r.ok && r.results[0].rows[0], [1508054.24, 385])
})

test('SQLite : une transaction laissée ouverte est annulée, une erreur est remontée', async () => {
  const sqlite = new SqliteEngine(dir, 1000, 15000)
  const before = await sqlite.query('SELECT count(*) FROM magasins')
  await sqlite.query("BEGIN; DELETE FROM magasins WHERE id = 5")
  const afterOpen = await sqlite.query('SELECT count(*) FROM magasins')
  assert.deepEqual(afterOpen.ok && afterOpen.results, before.ok && before.results)
  const bad = await sqlite.query('SELECT nope FROM magasins')
  assert.equal(bad.ok, false)
})

const MYSQL_URL = process.env.MYSQL_TEST_URL ?? 'mysql://root:kit@localhost:33307/training_sql_test'
test('MySQL : mêmes nombres de lignes et sommes que le kit, transaction ouverte annulée', { skip: MYSQL_URL === 'off' }, async () => {
  const ds = await getDataset(dir, DATABASE_URL, SETUP)
  const db = new MysqlEngine({ url: MYSQL_URL, maxRows: 1000, timeoutMs: 15000 })
  await db.init(ds, 1)
  await db.reset()
  for (const t of ds.tables) {
    const r = await db.query(`SELECT count(*) FROM \`${t.name}\``)
    assert.ok(r.ok, `${t.name} illisible`)
    assert.equal(r.ok && Number(r.results[0].rows[0][0]), t.rows.length, `${t.name} : nombre de lignes`)
  }
  const sums = await db.query("SELECT sum(total_ttc), sum(statut = 'ANNULE') FROM tickets_caisse")
  assert.deepEqual(sums.ok && sums.results[0].rows[0].map(Number), [1508054.24, 385])
  await db.query('BEGIN; DELETE FROM magasins WHERE id = 5')
  const n = await db.query('SELECT count(*) FROM magasins')
  assert.equal(n.ok && Number(n.results[0].rows[0][0]), 5)
})

test('MySQL : une correction ne peut rien valider pour de bon (DDL caché, validation implicite)', { skip: MYSQL_URL === 'off' }, async () => {
  const ds = await getDataset(dir, DATABASE_URL, SETUP)
  const db = new MysqlEngine({ url: MYSQL_URL, maxRows: 1000, timeoutMs: 15000 })
  await db.init(ds, 1)
  const attempts = [
    'SELECT 1; /*!50000 DROP TABLE magasins */',
    '/*!50000 DROP TABLE magasins #*/ SELECT 1',
    "SELECT 1 # '\n; DROP TABLE magasins; -- '",
    "SELECT 'x\\''; DROP TABLE magasins; SELECT '1'",
    'ANALYZE TABLE produits; DELETE FROM produits WHERE id < 100',
    'LOCK TABLES produits WRITE; DELETE FROM produits WHERE id < 100',
  ]
  for (const sql of attempts) {
    const r = await db.rolledBack(sql, 'SELECT count(*) FROM produits')
    assert.equal(r.ok, false, `accepté : ${sql}`)
  }
  const n = await db.rolledBack('SELECT count(*) FROM magasins; SELECT count(*) FROM produits')
  assert.ok(n.ok, 'tables disparues')
  assert.deepEqual(n.ok && n.results.map((x) => Number(x.rows[0][0])), [5, 403])
})

test('SQLite : les corrections lisent leur propre copie, pas celle du playground', async () => {
  const sqlite = new SqliteEngine(dir, 1000, 15000)
  await sqlite.query('DELETE FROM magasins WHERE id = 5')
  const play = await sqlite.query('SELECT count(*) FROM magasins')
  const check = await sqlite.rolledBack('SELECT count(*) FROM magasins')
  assert.deepEqual([play.ok && play.results[0].rows[0][0], check.ok && check.results[0].rows[0][0]], [4, 5])
  sqlite.reset()
})
