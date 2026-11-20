/**
 * Vérifie chaque exercice contre une vraie base (npm run test:exercises, base du kit chargée) :
 * la solution s'exécute et se valide elle-même, son résultat n'est pas vide, une réponse vide
 * ou « SELECT 1 » échoue, et pour un exercice d'écriture, ne rien faire ne passe pas.
 */
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { exercises } from '../src/content/exercises'
import { checkExercise, untouched } from './check'

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://kit:kit@localhost:55433/training_sql',
  options: '-c statement_timeout=15000 -c search_path=retail,public -c timezone=Europe/Paris',
  max: 1,
})
after(() => pool.end())

test('identifiants uniques', () => {
  assert.equal(new Set(exercises.map((e) => e.id)).size, exercises.length)
})

for (const ex of exercises) {
  test(`${ex.id} · ${ex.title}`, async () => {
    const client = await pool.connect()
    try {
      const self = await checkExercise(client, ex, ex.solution)
      assert.ok(self.ok, `la solution ne se valide pas : ${!self.ok ? self.reason : ''}`)
      assert.ok(self.ok && self.rows > 0, 'résultat attendu vide : une réponse vide passerait')

      for (const wrong of ['SELECT 1', ' ']) {
        const r = await checkExercise(client, ex, wrong)
        assert.equal(r.ok, false, `« ${wrong} » ne doit pas passer`)
      }

      if (ex.check) {
        const before = await untouched(client, ex)
        assert.ok(before.ok, `check en échec sur la base intacte : ${!before.ok ? before.error : ''}`)
        // Ne rien faire laisse la base intacte : le check ne doit alors pas correspondre à l'attendu
        const nothing = await checkExercise(client, ex, 'SELECT 1 WHERE false')
        assert.equal(nothing.ok, false, 'ne rien faire passe la vérification')
      }
    } finally {
      client.release()
    }
  })
}
