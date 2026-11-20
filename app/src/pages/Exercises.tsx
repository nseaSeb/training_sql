import { useEffect, useMemo, useState } from 'react'
import { exercises, levels, solutionFor, type Exercise, type Level } from '../content/exercises'
import { checkAnswer, engineNames, fetchEngines, fetchSchema, runSql, type CheckResponse, type Engine, type QueryResponse } from '../lib/api'
import { firstKeyword, splitStatements, transactionControl } from '../lib/statements'
import { useStored } from '../lib/storage'
import { useNav } from '../lib/nav'
import { Markdown } from '../components/Markdown'
import { ResultView } from '../components/ResultView'
import { SqlEditor } from '../components/SqlEditor'
import { Callout, PageHeader, Reveal, Sql, Tag } from '../components/ui'

type Status = 'todo' | 'done'

function Verdict({ result }: { result: CheckResponse }) {
  if (result.ok) return <Callout tone="tip" title="Bonne réponse ✓">{result.rows} ligne(s), identiques à celles attendues.</Callout>
  return (
    <Callout tone="warn" title="Pas encore">
      <p>{result.reason}</p>
      {'missing' in result && result.missing.length > 0 && (
        <p className="mt-2">Exemples de lignes attendues absentes : {result.missing.map((r) => `(${r.join(', ')})`).join(' ; ')}</p>
      )}
      {'extra' in result && result.extra.length > 0 && (
        <p className="mt-2">Exemples de lignes en trop : {result.extra.map((r) => `(${r.join(', ')})`).join(' ; ')}</p>
      )}
      {'expectedFields' in result && <p className="mt-2 text-xs opacity-80">Colonnes attendues : {result.expectedFields.join(', ')}</p>}
    </Callout>
  )
}

function ExerciseView({ ex, done, onDone, available }: { ex: Exercise; done: boolean; onDone: () => void; available: Engine[] }) {
  const { openInPlayground } = useNav()
  const [preferred, setPreferred] = useStored<Engine>('exercices:engine', 'pg')
  const engines = available.filter((e) => solutionFor(ex, e))
  const engine: Engine = engines.includes(preferred) ? preferred : 'pg'
  const [answers, setAnswers] = useStored<Record<string, string>>('exercices:answers', {})
  const key = engine === 'pg' ? ex.id : `${ex.id}:${engine}`
  const sql = answers[key] ?? ex.starter ?? ''
  const setSql = (v: string) => setAnswers((a) => ({ ...a, [key]: v }))
  const [schema, setSchema] = useState<Record<string, string[]>>({})
  const [response, setResponse] = useState<QueryResponse | null>(null)
  const [verdict, setVerdict] = useState<CheckResponse | null>(null)
  const [busy, setBusy] = useState(false)
  const [hints, setHints] = useState(0)

  useEffect(() => {
    fetchSchema(engine)
      .then((cols) => {
        const map: Record<string, string[]> = {}
        for (const c of cols) (map[c.table_name] ??= []).push(c.column_name)
        setSchema(map)
      })
      .catch(() => {})
  }, [engine])

  const run = async () => {
    const tx = transactionControl(sql)
    if (tx) return setResponse({ ok: false, ms: 0, error: { message: `Retire ${tx} : ici, tout est exécuté dans une transaction annulée.` } })
    const ddl = engine === 'mysql' && splitStatements(sql).map((s) => firstKeyword(s.text)).find((k) => ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(k))
    if (ddl) return setResponse({ ok: false, ms: 0, error: { message: `${ddl} n'est pas annulable en MySQL : utilise le playground pour l'essayer.` } })
    setBusy(true)
    // BEGIN ouvert et jamais validé : le serveur annule la transaction à la fin, la base reste intacte.
    // On retire ensuite le résultat du BEGIN et on recale la position d'erreur sur le texte de l'apprenant.
    const prefix = 'BEGIN; '
    const r: QueryResponse = await runSql(prefix + sql, engine).catch((e) => ({ ok: false as const, ms: 0, error: { message: String(e) } }))
    if (r.ok) r.results = r.results.slice(1)
    else if (r.error.position) r.error.position = String(Number(r.error.position) - prefix.length)
    setResponse(r)
    setBusy(false)
  }

  const check = async () => {
    setBusy(true)
    const r = await checkAnswer(ex.id, sql, engine).catch((e) => ({ ok: false as const, reason: String(e), error: true as const }))
    setVerdict(r)
    if (r.ok && !done) onDone()
    setBusy(false)
  }

  return (
    <article className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm text-slate-500">{ex.id}</span>
        <Tag color="indigo">{levels[ex.level]}</Tag>
        <Tag>{ex.theme}</Tag>
        {done && <Tag color="emerald">Réussi</Tag>}
      </div>
      <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{ex.title}</h2>
      <div className="mt-2"><Markdown source={ex.prompt} /></div>

      {available.length > 1 && engines.length === 1 && (
        <p className="mt-4 text-xs text-slate-500">Corrigé sur PostgreSQL uniquement : la solution dépend de fonctions ou de catalogues propres à PostgreSQL.</p>
      )}
      {engines.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label="Base de données">
          <span className="text-slate-500">Corriger sur :</span>
          {engines.map((e) => (
            <button key={e} role="radio" aria-checked={engine === e} onClick={() => { setPreferred(e); setVerdict(null); setResponse(null) }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold ${engine === e ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'}`}>
              {engineNames[e]}
            </button>
          ))}
          {engine !== 'pg' && <span className="text-xs text-slate-500">L'énoncé et les indices visent PostgreSQL : adapte la syntaxe (dates, fonctions) à {engineNames[engine]}.</span>}
        </div>
      )}

      <div className="mt-6 overflow-hidden rounded-xl border border-slate-300 bg-slate-900 shadow-sm dark:border-slate-700">
        <SqlEditor value={sql} onChange={setSql} schema={schema} onRun={run} onRunCurrent={run} onToggleSchema={() => {}} onSave={() => {}} onFormat={() => {}} />
        <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 px-4 py-2 text-xs text-slate-400">
          <button onClick={run} disabled={busy} className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">▶ Exécuter</button>
          <button onClick={check} disabled={busy} className="rounded-md bg-emerald-600 px-3 py-1.5 font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">✓ Vérifier</button>
          <button onClick={() => { setSql(ex.starter ?? ''); setVerdict(null); setResponse(null) }} className="ml-auto hover:text-slate-200">Repartir du début</button>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500">Tout s'exécute dans une transaction annulée : la base n'est jamais modifiée depuis cette page. Ctrl/⌘ + Entrée pour exécuter.</p>

      {verdict && <div className="mt-4"><Verdict result={verdict} /></div>}
      {response && <div className="mt-4"><ResultView response={response} /></div>}

      {ex.hints.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2 font-semibold">Indices</h3>
          {ex.hints.slice(0, hints).map((h, i) => (
            <Callout key={i} tone="warn" title={`Indice ${i + 1}`}><Markdown source={h} /></Callout>
          ))}
          {hints < ex.hints.length && (
            <button onClick={() => setHints(hints + 1)} className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40">
              Afficher l'indice {hints + 1}/{ex.hints.length}
            </button>
          )}
        </div>
      )}

      <div className="mt-8">
        <Reveal label="Voir la solution (après avoir cherché !)" tone="emerald">
          <Sql code={solutionFor(ex, engine) ?? ex.solution} run={false} />
          <button onClick={() => openInPlayground(solutionFor(ex, engine) ?? ex.solution)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">Ouvrir dans le playground</button>
        </Reveal>
      </div>
    </article>
  )
}

export default function Exercises() {
  const [current, setCurrent] = useStored('exercices:current', exercises[0].id)
  const [status, setStatus] = useStored<Record<string, Status>>('exercices:status', {})
  const ex = exercises.find((e) => e.id === current) ?? exercises[0]
  const byLevel = useMemo(() => ([1, 2, 3] as Level[]).map((l) => [l, exercises.filter((e) => e.level === l)] as const), [])
  const doneCount = exercises.filter((e) => status[e.id] === 'done').length
  const [available, setAvailable] = useState<Engine[]>(['pg'])
  useEffect(() => {
    fetchEngines().then(setAvailable).catch(() => {})
  }, [])

  return (
    <>
      <PageHeader
        title="Exercices"
        subtitle={`${exercises.length} exercices courts, du débutant à l'avancé, corrigés automatiquement : ta requête est comparée à la solution sur la vraie base.`}
      >
        <Tag color="emerald">{doneCount}/{exercises.length} réussis</Tag>
      </PageHeader>
      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="shrink-0 space-y-4 lg:w-72">
          {byLevel.map(([level, list]) => (
            <div key={level}>
              <div className="mb-1 flex items-center justify-between text-xs font-semibold tracking-wide text-slate-500 uppercase">
                <span>{levels[level]}</span>
                <span className="font-normal normal-case">{list.filter((e) => status[e.id] === 'done').length}/{list.length}</span>
              </div>
              {list.map((e) => (
                <button key={e.id} onClick={() => setCurrent(e.id)} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${e.id === ex.id ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100' : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'}`}>
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${status[e.id] === 'done' ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                  <span><span className="font-mono text-xs text-slate-500">{e.id}</span> {e.title}</span>
                </button>
              ))}
            </div>
          ))}
        </nav>
        <ExerciseView key={ex.id} ex={ex} available={available} done={status[ex.id] === 'done'} onDone={() => setStatus((s) => ({ ...s, [ex.id]: 'done' }))} />
      </div>
    </>
  )
}
