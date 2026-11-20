import { useEffect, useMemo, useRef, useState } from 'react'
import { fetchSchema, listSnippets, resetDb, runSql, type QueryResponse, type SchemaColumn, type Snippet } from '../lib/api'
import { useStored } from '../lib/storage'
import { splitStatements } from '../lib/statements'
import { ResultView } from '../components/ResultView'
import { SchemaPanel } from '../components/SchemaPanel'
import { SqlEditor, type SqlEditorHandle } from '../components/SqlEditor'
import { SnippetsPanel, type Draft } from '../components/SnippetsPanel'

const EXPLAIN_PREFIX = 'BEGIN;\nEXPLAIN (ANALYZE, BUFFERS) '

export default function Playground({ sql, setSql }: { sql: string; setSql: (s: string) => void }) {
  const [response, setResponse] = useState<QueryResponse | null>(null)
  const [running, setRunning] = useState(false)
  const [schema, setSchema] = useState<SchemaColumn[]>([])
  const [openTable, setOpenTable] = useState<string | null>(null)
  const [history, setHistory] = useStored<string[]>('playground:history', [])
  const [resetState, setResetState] = useState<'idle' | 'confirm' | 'running' | 'done' | 'error'>('idle')
  const editor = useRef<SqlEditorHandle>(null)
  const [panel, setPanel] = useStored<'schema' | 'snippets' | null>('playground:panel', null)
  const togglePanel = (p: 'schema' | 'snippets') => setPanel((cur) => (cur === p ? null : p))
  const [snippets, setSnippets] = useState<Snippet[]>([])
  // Snippet chargé dans l'éditeur : « Sauver » propose alors de le mettre à jour
  const [loaded, setLoaded] = useState<Snippet | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return // déjà traité par l'éditeur
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'i') {
        e.preventDefault()
        setPanel((p) => (p === 'schema' ? null : 'schema'))
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault() // pas de « Enregistrer la page » du navigateur sur le Playground
        saveSnippet()
      } else if (e.key === 'Escape') setPanel(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }) // réabonné à chaque rendu : ⌘S sauve toujours le texte et le snippet chargé actuels

  /** Insère du texte à la position du curseur dans l'éditeur */
  function insert(text: string) {
    editor.current?.insert(text)
  }

  async function preview(table: string) {
    const q = `SELECT * FROM ${table} LIMIT 20;`
    setSql(q)
    setLoaded(null)
    setRunning(true)
    setResponse(await runSql(q).catch(() => ({ ok: false as const, ms: 0, error: { message: 'API injoignable' } })))
    setRunning(false)
  }

  useEffect(() => {
    fetchSchema().then(setSchema).catch(() => setSchema([]))
    listSnippets().then(setSnippets).catch(() => setSnippets([]))
  }, [])

  /** Ouvre le formulaire de sauvegarde avec la sélection (ou tout l'éditeur). */
  function saveSnippet() {
    const text = editor.current?.selectionOrAll().text ?? sql
    if (!text.trim()) return
    setDraft((d) => ({ sql: text, loaded, n: (d?.n ?? 0) + 1 }))
    setPanel('snippets')
  }

  function loadSnippet(s: Snippet) {
    setSql(s.sql)
    setLoaded(s)
    editor.current?.focus()
  }

  const completionSchema = useMemo(() => {
    const map: Record<string, string[]> = {}
    for (const c of schema) (map[c.table_name] ??= []).push(c.column_name)
    return map
  }, [schema])

  /**
   * Envoie `text` (pris dans l'éditeur à partir de `from`) au serveur, éventuellement entouré
   * d'un préfixe / suffixe. Une erreur est soulignée à sa place dans l'éditeur.
   */
  async function send(text: string, from: number, wrap?: { prefix: string; suffix: string }) {
    if (!text.trim()) return
    const prefix = wrap?.prefix ?? ''
    setRunning(true)
    try {
      const r = await runSql(prefix + text + (wrap?.suffix ?? ''))
      if (r.ok && wrap) r.results = r.results.filter((x) => x.command !== 'BEGIN' && x.command !== 'ROLLBACK')
      setResponse(r)
      setHistory((h) => [text, ...h.filter((x) => x !== text)].slice(0, 30))
      // position : 1 = premier caractère du texte envoyé
      const p = !r.ok && r.error.position ? Number(r.error.position) - 1 - prefix.length : -1
      if (p >= 0 && p <= text.length) editor.current?.markError(from + p)
    } catch {
      setResponse({ ok: false, ms: 0, error: { message: "API injoignable : lance `npm run dev` dans app/ et vérifie le conteneur training_sql_pg." } })
    } finally {
      setRunning(false)
    }
  }

  const runSnippet = (s: Snippet) => {
    loadSnippet(s)
    send(s.sql, 0)
  }

  /** Met en forme la sélection (ou tout l'éditeur). sql-formatter n'est chargé qu'au premier usage. */
  async function formatSql() {
    const s = editor.current?.selectionOrAll()
    if (!s || !s.text.trim()) return
    if (/^\s*\\/m.test(s.text))
      return setResponse({ ok: false, ms: 0, error: { message: 'Formatage impossible : le texte contient des méta-commandes psql (lignes \\…). Sélectionne seulement le SQL.' } })
    try {
      const { formatDialect, postgresql } = await import('sql-formatter')
      const out = formatDialect(s.text, { dialect: postgresql, keywordCase: 'upper', functionCase: 'lower', dataTypeCase: 'lower', tabWidth: 2, linesBetweenQueries: 1 })
      editor.current?.replace(s.from, s.from + s.text.length, out)
    } catch (e) {
      setResponse({ ok: false, ms: 0, error: { message: `Formatage impossible : ${(e as Error).message.split('\n')[0]}` } })
    }
  }

  const run = () => {
    const s = editor.current?.selectionOrAll()
    if (s) send(s.text, s.from)
  }

  const runCurrent = () => {
    const s = editor.current?.current()
    if (s) send(s.text, s.from)
  }

  /** EXPLAIN ANALYZE de l'instruction courante, dans une transaction annulée : rien n'est modifié. */
  const explain = () => {
    const s = editor.current?.current()
    if (!s) return
    if (splitStatements(s.text).length > 1)
      return setResponse({ ok: false, ms: 0, error: { message: 'Expliquer porte sur une seule instruction : sélectionne-la, ou place le curseur dedans sans rien sélectionner.' } })
    const text = s.text.replace(/;\s*$/, '')
    if (/^\s*explain\b/i.test(text.replace(/^(\s*--[^\n]*\n)+/, '')))
      return setResponse({ ok: false, ms: 0, error: { message: "L'instruction commence déjà par EXPLAIN : utilise ▶ Exécuter." } })
    // Le saut de ligne protège le « ; » final d'un commentaire -- en fin d'instruction
    send(text, s.from, { prefix: EXPLAIN_PREFIX, suffix: '\n;\nROLLBACK;' })
  }

  async function reset() {
    if (resetState !== 'confirm') return setResetState('confirm')
    setResetState('running')
    const r = await resetDb().catch(() => ({ ok: false }))
    setResetState(r.ok ? 'done' : 'error')
    setTimeout(() => setResetState('idle'), 2500)
  }

  const tables = [...new Set(schema.map((c) => c.table_name))]

  return (
    <div className={`flex flex-col gap-4 lg:flex-row ${panel ? 'xl:mr-[540px]' : ''}`}>
      {panel === 'schema' && <SchemaPanel schema={schema} onClose={() => setPanel(null)} onInsert={insert} onPreview={preview} />}
      {panel === 'snippets' && (
        <SnippetsPanel
          snippets={snippets}
          setSnippets={(f) => {
            const next = f(snippets)
            setSnippets(next)
            // Le snippet chargé suit ses mises à jour, et disparaît s'il est supprimé
            setLoaded((l) => (l && (next.find((x) => x.id === l.id) ?? null)))
          }}
          draft={draft}
          setDraft={setDraft}
          onClose={() => setPanel(null)}
          onLoad={loadSnippet}
          onRun={runSnippet}
        />
      )}
      <aside className={`shrink-0 lg:w-60 ${panel ? 'hidden' : ''}`}>
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Schéma retail</div>
        <div className="space-y-0.5 text-sm">
          {tables.map((t) => {
            const cols = schema.filter((c) => c.table_name === t)
            return (
              <div key={t}>
                <button className="flex w-full items-center justify-between rounded px-2 py-1 text-left font-mono hover:bg-slate-200 dark:hover:bg-slate-800" onClick={() => setOpenTable(openTable === t ? null : t)}>
                  <span>{t}</span>
                  <span className="text-xs text-slate-400">{Number(cols[0].approx_rows).toLocaleString('fr-FR')}</span>
                </button>
                {openTable === t && (
                  <div className="mb-2 ml-3 border-l border-slate-300 pl-2 dark:border-slate-700">
                    {cols.map((c) => (
                      <button key={c.column_name} title="Insérer" className="flex w-full justify-between gap-2 py-0.5 text-left font-mono text-xs hover:text-indigo-600" onClick={() => setSql(sql + (sql.endsWith(' ') || !sql ? '' : ' ') + c.column_name)}>
                        <span>{c.column_name}{c.is_nullable === 'YES' ? '' : ' *'}</span>
                        <span className="truncate text-slate-400">{c.data_type.replace('timestamp with time zone', 'timestamptz')}</span>
                      </button>
                    ))}
                    <button className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => setSql(`SELECT * FROM ${t} LIMIT 20;`)}>
                      Aperçu (20 lignes)
                    </button>
                  </div>
                )}
              </div>
            )
          })}
          {!tables.length && <div className="text-xs text-rose-600">API ou base indisponible.</div>}
        </div>
        <div className="mt-2 text-[11px] text-slate-400">* = NOT NULL · nombre de lignes estimé</div>

        <div className="mt-6 mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Historique</div>
        <div className="max-h-64 space-y-1 overflow-y-auto">
          {history.map((h, i) => (
            <button key={i} className="block w-full truncate rounded px-2 py-1 text-left font-mono text-xs text-slate-600 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-800" title={h} onClick={() => (setSql(h), setLoaded(null))}>
              {h.replace(/\s+/g, ' ')}
            </button>
          ))}
        </div>

        <button
          className={`mt-6 w-full rounded-lg border px-3 py-2 text-xs font-medium ${resetState === 'confirm' ? 'border-rose-400 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800'}`}
          onClick={reset}
          onBlur={() => resetState === 'confirm' && setResetState('idle')}
        >
          {{ idle: '↺ Réinitialiser la base', confirm: 'Confirmer : tout recréer ?', running: 'Recréation…', done: 'Base recréée ✓', error: 'Échec ✗' }[resetState]}
        </button>
      </aside>

      <section className="min-w-0 flex-1">
        <div className="overflow-hidden rounded-xl border border-slate-300 bg-slate-900 shadow-sm dark:border-slate-700">
          <SqlEditor
            ref={editor}
            value={sql}
            onChange={setSql}
            schema={completionSchema}
            onRun={run}
            onRunCurrent={runCurrent}
            onToggleSchema={() => togglePanel('schema')}
            onSave={saveSnippet}
            onFormat={formatSql}
          />
          <div className="flex flex-wrap items-center gap-3 border-t border-slate-800 px-4 py-2 text-xs text-slate-400">
            <button onClick={run} disabled={running} className="rounded-md bg-indigo-600 px-3 py-1.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-50">
              {running ? 'Exécution…' : '▶ Exécuter'}
            </button>
            <button onClick={formatSql} title="Mettre en forme la requête (ou la sélection) · ⇧ + ⌥ + F" className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800">
              ⇥ Formater
            </button>
            <button onClick={explain} disabled={running} title="EXPLAIN (ANALYZE, BUFFERS) de l'instruction sous le curseur, dans une transaction annulée" className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800 disabled:opacity-50">
              ⚙ Expliquer
            </button>
            <button onClick={() => togglePanel('schema')} className={`rounded-md border px-3 py-1.5 font-semibold ${panel === 'schema' ? 'border-indigo-400 bg-indigo-950 text-indigo-200' : 'border-slate-600 text-slate-200 hover:bg-slate-800'}`}>
              ◫ Schéma
            </button>
            <button onClick={saveSnippet} title="Sauver la requête (ou la sélection) en snippet" className="rounded-md border border-slate-600 px-3 py-1.5 font-semibold text-slate-200 hover:bg-slate-800">
              ☆ Sauver{loaded ? ` (${loaded.titre.length > 18 ? loaded.titre.slice(0, 18) + '…' : loaded.titre})` : ''}
            </button>
            <button onClick={() => togglePanel('snippets')} className={`rounded-md border px-3 py-1.5 font-semibold ${panel === 'snippets' ? 'border-indigo-400 bg-indigo-950 text-indigo-200' : 'border-slate-600 text-slate-200 hover:bg-slate-800'}`}>
              ☰ Snippets{snippets.length ? ` · ${snippets.length}` : ''}
            </button>
            <span>⌘/Ctrl + Entrée : tout (ou la sélection) · ⇧ + ⌘/Ctrl + Entrée : l'instruction sous le curseur · ⌘/Ctrl + / (ou + : en AZERTY) commente · ⌘/Ctrl + I schéma · ⌘/Ctrl + S sauver · ⇧ + ⌥ + F formater</span>
            {response && <span className="ml-auto">{response.ms} ms</span>}
          </div>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Chaque exécution est autonome : une transaction laissée ouverte (BEGIN sans COMMIT) est annulée à la fin. Un COMMIT explicite modifie la base pour de bon (bouton « Réinitialiser » pour repartir de zéro). « Expliquer » exécute vraiment l'instruction pour la mesurer, puis annule tout.
        </p>
        <div className="mt-5">{response ? <ResultView response={response} /> : <div className="text-sm text-slate-400">Le résultat s'affichera ici.</div>}</div>
      </section>
    </div>
  )
}
