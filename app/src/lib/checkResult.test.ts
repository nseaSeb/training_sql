import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canon, compareGrids, type Grid } from './checkResult.ts'

const grid = (fields: string[], rows: Grid['rows']): Grid => ({ fields, rows })

test('canon : nombres canonisés, NULL distinct de la chaîne NULL', () => {
  assert.equal(canon('12.50'), '12.5')
  assert.equal(canon('12.00'), '12')
  assert.equal(canon(5), canon('5'))
  assert.equal(canon('100'), '100')
  assert.notEqual(canon(null), canon('NULL'))
  assert.equal(canon(true), 't')
})

test('les alias sont libres, l’ordre des lignes ignoré par défaut', () => {
  const exp = grid(['ville', 'n'], [['Saintes', '3'], ['Mérignac', '5']])
  const got = grid(['v', 'total'], [['Mérignac', 5], ['Saintes', '3.0']])
  assert.deepEqual(compareGrids(got, exp), { ok: true, rows: 2 })
})

test('mauvais nombre de colonnes', () => {
  const r = compareGrids(grid(['a'], [['x']]), grid(['a', 'b'], [['x', 'y']]))
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.reason : '', /1 colonne\(s\) au lieu de 2/)
})

test('lignes manquantes et en trop, doublons comptés', () => {
  const exp = grid(['x'], [['a'], ['a'], ['b']])
  const r = compareGrids(grid(['x'], [['a'], ['c']]), exp)
  assert.equal(r.ok, false)
  if (!r.ok) {
    assert.deepEqual(r.missing, [['a'], ['b']])
    assert.deepEqual(r.extra, [['c']])
    assert.match(r.reason, /2 ligne\(s\) au lieu de 3/)
  }
})

test('ordre demandé : mêmes lignes dans le désordre = échec explicite', () => {
  const exp = grid(['x'], [['1'], ['2']])
  assert.deepEqual(compareGrids(grid(['x'], [['1'], ['2']]), exp, true), { ok: true, rows: 2 })
  const r = compareGrids(grid(['x'], [['2'], ['1']]), exp, true)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.reason : '', /pas dans l'ordre/)
})

test('un résultat vide ne passe pas contre un résultat attendu non vide', () => {
  assert.equal(compareGrids(grid(['x'], []), grid(['x'], [['1']])).ok, false)
})
