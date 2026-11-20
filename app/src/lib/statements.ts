/**
 * Découpe un texte SQL en instructions sur les « ; » de premier niveau, en ignorant ceux qui sont
 * dans une chaîne ('…', E'…'), un identifiant ("…"), un commentaire (-- ou bloc /* imbriqué) ou un bloc $tag$…$tag$.
 */
export type Statement = { from: number; to: number; text: string }

export function splitStatements(sql: string): Statement[] {
  const out: Statement[] = []
  let start = 0
  let i = 0
  const n = sql.length
  while (i < n) {
    const c = sql[i]
    const next = sql[i + 1]
    if (c === '-' && next === '-') {
      while (i < n && sql[i] !== '\n') i++
    } else if (c === '/' && next === '*') {
      let depth = 1
      i += 2
      while (i < n && depth > 0) {
        if (sql[i] === '/' && sql[i + 1] === '*') {
          depth++
          i += 2
        } else if (sql[i] === '*' && sql[i + 1] === '/') {
          depth--
          i += 2
        } else i++
      }
    } else if (c === "'" || c === '"') {
      // E'…' accepte \' ; partout ailleurs le guillemet se double ('' ou "")
      const backslash = c === "'" && /[eE]/.test(sql[i - 1] ?? '') && !/[A-Za-z0-9_]/.test(sql[i - 2] ?? '')
      i++
      while (i < n) {
        if (backslash && sql[i] === '\\') i += 2
        else if (sql[i] === c && sql[i + 1] === c) i += 2
        else if (sql[i] === c) break
        else i++
      }
      i++
    } else if (c === '$') {
      const tag = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i))
      // $1 (paramètre) n'ouvre pas de bloc ; un $ collé à un identifiant non plus
      if (tag && !/[A-Za-z0-9_]/.test(sql[i - 1] ?? '')) {
        const end = sql.indexOf(tag[0], i + tag[0].length)
        i = end < 0 ? n : end + tag[0].length
      } else i++
    } else if (c === ';') {
      out.push({ from: start, to: i + 1, text: sql.slice(start, i + 1) })
      start = i + 1
      i++
    } else i++
  }
  if (sql.slice(start).trim()) out.push({ from: start, to: n, text: sql.slice(start) })
  return out.filter((s) => hasCode(s.text))
}

/** Vrai si le texte contient autre chose que des blancs et des commentaires. */
function hasCode(text: string) {
  return text.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/[\s;]/g, '') !== ''
}

/** L'instruction sous le curseur ; sur une ligne vide ou juste après un « ; », la précédente. */
export function statementAt(sql: string, pos: number): Statement | null {
  const list = splitStatements(sql)
  if (!list.length) return null
  const inside = list.find((s) => pos >= s.from && pos < s.to && sql.slice(s.from, pos).trim() !== '')
  if (inside) return inside
  const before = list.filter((s) => s.from < pos)
  return before.length ? before[before.length - 1] : list[0]
}
