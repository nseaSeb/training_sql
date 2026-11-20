const KEYWORDS = new Set(
  `select from where and or not in is null as join left right inner full outer cross lateral on using group by order having limit offset
  distinct with union all except intersect case when then else end exists between like ilike asc desc nulls first last
  insert into values update set delete returning begin commit rollback create table index drop alter view temp temporary
  over partition window rows range filter explain analyze buffers costs off concurrently primary key references default
  true false interval date timestamptz timestamp numeric int text boolean at time zone distinct rollup cube
  conflict do nothing excluded jsonb json type enum function returns language immutable raise notice declare`.split(/\s+/),
)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Coloration SQL minimale (mots-clés, chaînes, identifiants entre guillemets, nombres, commentaires, blocs $$). */
export function highlightSql(sql: string): string {
  const re = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:[^']|'')*')|("(?:[^"]|"")*")|(\$([A-Za-z_]\w*)?\$)([\s\S]*?)\4|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)(\s*\()?|([\s\S])/g
  let out = ''
  for (const m of sql.matchAll(re)) {
    const [, comment, str, ident, dollar, , body, num, word, paren, other] = m
    if (comment) out += `<span class="text-slate-500 italic">${esc(comment)}</span>`
    else if (str) out += `<span class="text-amber-300">${esc(str)}</span>`
    else if (ident) out += `<span class="text-violet-300">${esc(ident)}</span>`
    else if (dollar) {
      // Corps d'un DO $$ … $$ ou d'une fonction : c'est du code, on le colore aussi
      const tag = `<span class="text-amber-300">${esc(dollar)}</span>`
      out += tag + highlightSql(body ?? '') + tag
    } else if (num) out += `<span class="text-orange-300">${num}</span>`
    else if (word) {
      if (KEYWORDS.has(word.toLowerCase())) out += `<span class="text-sky-300 font-semibold">${word}</span>`
      else if (paren) out += `<span class="text-emerald-300">${word}</span>`
      else out += esc(word)
      if (paren) out += esc(paren)
    } else out += esc(other ?? '')
  }
  return out
}
