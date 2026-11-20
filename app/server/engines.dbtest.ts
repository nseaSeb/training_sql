/** Les autres moteurs reçoivent exactement les données du kit PostgreSQL (npm run test:db, base chargée). */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getDataset } from './engines/dataset'
import { SqliteEngine } from './engines/sqlite'

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
