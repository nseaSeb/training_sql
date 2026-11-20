import { test } from 'node:test'
import assert from 'node:assert/strict'
import { splitStatements, statementAt } from './statements.ts'

const texts = (sql: string) => splitStatements(sql).map((s) => s.text.trim())

test('coupe sur les « ; » de premier niveau', () => {
  assert.deepEqual(texts('SELECT 1; SELECT 2;'), ['SELECT 1;', 'SELECT 2;'])
})

test('la dernière instruction peut ne pas avoir de « ; »', () => {
  assert.deepEqual(texts('SELECT 1;\nSELECT 2'), ['SELECT 1;', 'SELECT 2'])
})

test('ignore les « ; » dans les chaînes, identifiants et commentaires', () => {
  assert.deepEqual(texts(`SELECT 'a;b', "c;d" FROM t; -- e;f\nSELECT 2;`), [`SELECT 'a;b', "c;d" FROM t;`, '-- e;f\nSELECT 2;'])
  assert.deepEqual(texts(`SELECT 'l''apostrophe;' AS x; SELECT 2;`), [`SELECT 'l''apostrophe;' AS x;`, 'SELECT 2;'])
})

test('commentaires /* */ imbriqués', () => {
  assert.deepEqual(texts('/* a; /* b; */ c; */ SELECT 1; SELECT 2;'), ['/* a; /* b; */ c; */ SELECT 1;', 'SELECT 2;'])
})

test("chaînes E'…' avec \\'", () => {
  assert.deepEqual(texts(`SELECT E'x\\';y'; SELECT 2;`), [`SELECT E'x\\';y';`, 'SELECT 2;'])
})

test('blocs $$ et $tag$, sans confondre $1', () => {
  assert.deepEqual(texts(`DO $$ BEGIN RAISE NOTICE 'x'; END $$; SELECT 2;`), [`DO $$ BEGIN RAISE NOTICE 'x'; END $$;`, 'SELECT 2;'])
  assert.deepEqual(texts(`SELECT $f$ a; b $f$; SELECT 2;`), ['SELECT $f$ a; b $f$;', 'SELECT 2;'])
  assert.deepEqual(texts('SELECT $1; SELECT $2;'), ['SELECT $1;', 'SELECT $2;'])
})

test('les morceaux faits seulement de blancs ou de commentaires sont écartés', () => {
  assert.deepEqual(texts('SELECT 1;\n\n-- fin\n'), ['SELECT 1;'])
  assert.deepEqual(texts(';;'), [])
})

test('positions from / to dans le texte d’origine', () => {
  const sql = 'SELECT 1;\nSELECT 2;'
  const [, b] = splitStatements(sql)
  assert.equal(sql.slice(b.from, b.to), '\nSELECT 2;')
})

test("statementAt : l'instruction sous le curseur", () => {
  const sql = 'SELECT 1;\nSELECT 2;\nSELECT 3;'
  assert.equal(statementAt(sql, sql.indexOf('2'))?.text.trim(), 'SELECT 2;')
  assert.equal(statementAt(sql, 0)?.text.trim(), 'SELECT 1;')
})

test('statementAt : juste après un « ; » ou sur une ligne vide, la précédente', () => {
  const sql = 'SELECT 1;\n\nSELECT 2;\n\n'
  assert.equal(statementAt(sql, sql.indexOf(';') + 1)?.text.trim(), 'SELECT 1;')
  assert.equal(statementAt(sql, sql.length)?.text.trim(), 'SELECT 2;')
  assert.equal(statementAt('', 0), null)
})
