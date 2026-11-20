import { test } from 'node:test'
import assert from 'node:assert/strict'
import { toCsv, toMarkdown } from './exportResult.ts'
import type { QueryResult } from './api.ts'

const result = (fields: string[], rows: QueryResult['rows']): QueryResult => ({ command: 'SELECT', rowCount: rows.length, fields, rows, truncated: false })

test('CSV : guillemets seulement si besoin, doublés à l’intérieur', () => {
  assert.equal(toCsv(result(['x', 'y', 'z'], [['a,b', 'c"d', 'simple']])), 'x,y,z\n"a,b","c""d",simple')
})

test('CSV : NULL donne un champ vide, un saut de ligne force les guillemets', () => {
  assert.equal(toCsv(result(['a', 'b'], [[null, 'l1\nl2']])), 'a,b\n,"l1\nl2"')
})

test('CSV : nombres, booléens et jsonb', () => {
  assert.equal(toCsv(result(['n', 'b', 'j'], [[42, true, { k: [1, 2] }]])), 'n,b,j\n42,true,"{""k"":[1,2]}"')
})

test('Markdown : en-tête, séparateur, NULL écrit en clair', () => {
  assert.equal(toMarkdown(result(['a', 'b'], [[1, null]])), '| a | b |\n| --- | --- |\n| 1 | NULL |')
})

test('Markdown : | échappé et sauts de ligne remplacés', () => {
  assert.equal(toMarkdown(result(['t'], [['p|q\nr']])), '| t |\n| --- |\n| p\\|q r |')
})
