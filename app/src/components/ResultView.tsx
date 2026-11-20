import { useState } from 'react'
import type { QueryResponse, QueryResult } from '../lib/api'
import { fmt, toCsv, toMarkdown } from '../lib/exportResult'


function CopyButtons({ r }: { r: QueryResult }) {
  const [done, setDone] = useState<string | null>(null)
  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text).then(() => setDone(label), () => setDone('échec'))
    setTimeout(() => setDone(null), 1500)
  }
  const btn = 'rounded border border-slate-300 px-1.5 py-0.5 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'
  return (
    <span className="ml-auto flex items-center gap-1.5">
      {done && <span className="text-emerald-600">{done === 'échec' ? 'copie refusée' : `${done} copié`}</span>}
      <button className={btn} onClick={() => copy('CSV', toCsv(r))} title={r.truncated ? 'Seulement les 1000 lignes affichées' : undefined}>Copier CSV</button>
      <button className={btn} onClick={() => copy('Markdown', toMarkdown(r))} title={r.truncated ? 'Seulement les 1000 lignes affichées' : undefined}>Copier Markdown</button>
    </span>
  )
}

function Notices({ list }: { list?: string[] }) {
  if (!list?.length) return null
  return (
    <div className="mb-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-2 font-mono text-xs text-sky-900 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200">
      {list.map((n, i) => <div key={i}>{n}</div>)}
    </div>
  )
}

export function ResultView({ response }: { response: QueryResponse }) {
  if (!response.ok) {
    const e = response.error
    return (
      <>
      <Notices list={response.notices} />
      <div className="rounded-lg border border-rose-300 bg-rose-50 p-4 font-mono text-sm text-rose-900 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-200">
        <div className="font-semibold">ERROR: {e.message}</div>
        {e.detail && <div className="mt-1">DETAIL: {e.detail}</div>}
        {e.hint && <div className="mt-1">HINT: {e.hint}</div>}
        {e.position && <div className="mt-1 text-xs opacity-70">position {e.position} · code {e.code}</div>}
        <div className="mt-2 font-sans text-xs opacity-70">En cas d'erreur, toute la saisie est annulée (même les instructions précédentes).</div>
      </div>
      </>
    )
  }
  return (
    <div className="space-y-5">
      <Notices list={response.notices} />
      {response.results.map((r, idx) => {
        const isPlan = r.fields.length === 1 && r.fields[0] === 'QUERY PLAN'
        return (
          <div key={idx}>
            <div className="mb-1.5 flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded bg-slate-200 px-1.5 py-0.5 font-mono font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">{r.command ?? '—'}</span>
              {r.rowCount !== null && <span>{r.rowCount} ligne{r.rowCount > 1 ? 's' : ''}</span>}
              {r.truncated && <span className="text-amber-600">affichage limité à 1000 lignes</span>}
              {r.fields.length > 0 && !isPlan && <CopyButtons r={r} />}
            </div>
            {isPlan ? (
              <pre className="overflow-x-auto rounded-lg bg-slate-900 p-3 font-mono text-[12.5px] leading-relaxed text-slate-100">
                {r.rows.map((row) => String(row[0])).join('\n')}
              </pre>
            ) : r.fields.length > 0 ? (
              <div className="max-h-[60vh] overflow-auto rounded-lg border border-slate-200 dark:border-slate-800">
                <table className="w-full border-collapse font-mono text-[12.5px]">
                  <thead className="sticky top-0 bg-slate-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-2 py-1.5 text-right text-slate-400">#</th>
                      {r.fields.map((f, k) => <th key={k} className="px-3 py-1.5 text-left font-semibold whitespace-nowrap">{f}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {r.rows.map((row, k) => (
                      <tr key={k} className="border-t border-slate-100 odd:bg-white even:bg-slate-50 hover:bg-indigo-50 dark:border-slate-800 dark:odd:bg-slate-900 dark:even:bg-slate-900/60 dark:hover:bg-indigo-950/40">
                        <td className="px-2 py-1 text-right text-slate-400">{k + 1}</td>
                        {row.map((v, j) => {
                          const s = fmt(v)
                          return <td key={j} className="px-3 py-1 whitespace-nowrap">{s === null ? <span className="text-slate-400 italic">NULL</span> : s}</td>
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}
