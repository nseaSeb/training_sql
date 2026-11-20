import { useEffect, useMemo, useState } from 'react'
import { snippets } from '../content/cheatsheet'
import { equivs } from '../content/tsql'
import { listSnippets, type Snippet } from '../lib/api'
import { memoMd } from '../lib/kit'
import { Markdown } from '../components/Markdown'
import { C, H2, P, PageHeader, Reveal, Sql } from '../components/ui'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')

export default function Cheatsheet() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const cats = [...new Set(snippets.map((s) => s.cat))]
  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return snippets.filter((s) => (!cat || s.cat === cat) && words.every((w) => norm(`${s.cat} ${s.title} ${s.sql} ${s.note ?? ''} ${s.tags ?? ''}`).includes(w)))
  }, [q, cat])
  const [mine, setMine] = useState<Snippet[]>([])
  useEffect(() => {
    listSnippets().then(setMine).catch(() => setMine([]))
  }, [])
  const mineList = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return cat ? [] : mine.filter((s) => words.every((w) => norm(`${s.titre} ${s.tags.join(' ')} ${s.sql}`).includes(w)))
  }, [mine, q, cat])
  const eqList = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return equivs.filter((e) => words.every((w) => norm(`${e.cat} ${e.tsql} ${e.pg} ${e.note ?? ''}`).includes(w)))
  }, [q])
  const eqCats = [...new Set(eqList.map((e) => e.cat))]

  return (
    <>
      <PageHeader title="Cheatsheet" subtitle="Les patterns qui reviennent au support applicatif. Tous exécutables sur training_sql.">
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher : null, dernier, doublon, fuseau, index…"
          className="mt-5 w-full max-w-xl rounded-xl border border-slate-300 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
        />
        <div className="mt-3 flex flex-wrap gap-1.5">
          {[null, ...cats].map((c) => (
            <button key={c ?? 'all'} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs font-medium ${cat === c ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'}`}>
              {c ?? 'Tout'}
            </button>
          ))}
        </div>
      </PageHeader>

      {mineList.length > 0 && (
        <div className="mb-8">
          <h2 className="mb-3 text-sm font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">Mes snippets</h2>
          <div className="grid gap-4 xl:grid-cols-2">
            {mineList.map((s) => (
              <div key={s.id} className="min-w-0 rounded-xl border border-indigo-200 bg-white p-4 dark:border-indigo-900 dark:bg-slate-900">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 dark:text-white">{s.titre}</h3>
                  <span className="truncate text-xs text-slate-400">{s.tags.join(' · ')}</span>
                </div>
                <Sql code={s.sql} />
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-slate-500">Sauvegardés depuis le Playground (☆ Sauver) : les modifier ou les supprimer depuis son panneau Snippets.</p>
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-2">
        {list.map((s) => (
          <div key={s.title} className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-baseline justify-between gap-2">
              <h3 className="font-semibold text-slate-900 dark:text-white">{s.title}</h3>
              <span className="text-xs text-slate-400">{s.cat}</span>
            </div>
            <Sql code={s.sql} save={{ titre: s.title, tags: [s.cat.toLowerCase()] }} />
            {s.note && <p className="text-sm text-slate-600 dark:text-slate-400">{s.note}</p>}
          </div>
        ))}
      </div>
      {!list.length && <p className="text-slate-500">Rien trouvé pour « {q} ».</p>}

      <div className="mt-12">
        <H2 id="tsql">SQL Server → PostgreSQL</H2>
        <P>
          Les fonctions de SQL Server (T-SQL) qui n'existent pas en PostgreSQL, et ce qu'on écrit à la place. La recherche ci-dessus filtre aussi ce tableau
          (ex. <C>isdate</C>, <C>datediff</C>).
        </P>
        {eqCats.map((c) => (
          <div key={c} className="mt-5 overflow-x-auto">
            <h3 className="mb-2 font-semibold text-slate-900 dark:text-white">{c}</h3>
            <table className="w-full min-w-[640px] overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-slate-700">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="w-1/4 px-3 py-1.5 font-semibold">SQL Server</th>
                  <th className="w-1/3 px-3 py-1.5 font-semibold">PostgreSQL</th>
                  <th className="px-3 py-1.5 font-semibold">À savoir</th>
                </tr>
              </thead>
              <tbody>
                {eqList.filter((e) => e.cat === c).map((e) => (
                  <tr key={e.tsql} className="border-t border-slate-100 bg-white align-top dark:border-slate-800 dark:bg-slate-900">
                    <td className="px-3 py-1.5 font-mono text-[12.5px] text-slate-500 dark:text-slate-400">{e.tsql}</td>
                    <td className="px-3 py-1.5 font-mono text-[12.5px] text-indigo-700 dark:text-indigo-300">{e.pg}</td>
                    <td className="px-3 py-1.5 text-slate-600 dark:text-slate-400">{e.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <div className="mt-12">
        <Reveal label="Mémo PostgreSQL complet (fichier du kit)">
          <Markdown source={memoMd} />
        </Reveal>
      </div>
    </>
  )
}
