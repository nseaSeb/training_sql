import { useMemo, useState } from 'react'
import { createSnippet, deleteSnippet, updateSnippet, type Snippet } from '../lib/api'
import { highlightSql } from '../lib/highlight'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const parseTags = (s: string) => s.split(',').map((t) => t.trim()).filter(Boolean)

/** Brouillon de sauvegarde : le SQL à ranger, et le snippet chargé qu'on peut mettre à jour. */
export type Draft = { sql: string; loaded: Snippet | null; n: number }

export function SnippetsPanel({ snippets, setSnippets, draft, setDraft, onClose, onLoad, onRun }: {
  snippets: Snippet[]
  setSnippets: (f: (l: Snippet[]) => Snippet[]) => void
  draft: Draft | null
  setDraft: (d: Draft | null) => void
  onClose: () => void
  onLoad: (s: Snippet) => void
  onRun: (s: Snippet) => void
}) {
  const [q, setQ] = useState('')
  const [editing, setEditing] = useState<number | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return snippets.filter((s) => words.every((w) => norm(`${s.titre} ${s.tags.join(' ')} ${s.sql}`).includes(w)))
  }, [snippets, q])

  const saved = (s: Snippet) => {
    setSnippets((l) => [s, ...l.filter((x) => x.id !== s.id)])
    setDraft(null)
    setError(null)
  }

  async function rename(s: Snippet, form: HTMLFormElement) {
    const data = new FormData(form)
    try {
      const saved = await updateSnippet(s.id, { titre: String(data.get('titre')), sql: s.sql, tags: parseTags(String(data.get('tags'))) })
      setSnippets((l) => l.map((x) => (x.id === saved.id ? saved : x)))
      setEditing(null)
    } catch (e) {
      setError((e as Error).message)
    }
  }

  /** Télécharge tous les snippets en JSON (titre, sql, tags) : sauvegarde ou transfert vers une autre base. */
  function exportJson() {
    const data = snippets.map(({ titre, sql, tags }) => ({ titre, sql, tags }))
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = Object.assign(document.createElement('a'), { href: url, download: `snippets-${new Date().toISOString().slice(0, 10)}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  /** Importe un export JSON ; les snippets déjà présents (même titre et même SQL) sont ignorés. */
  async function importJson(file: File) {
    try {
      const data = JSON.parse(await file.text()) as Partial<Snippet>[]
      if (!Array.isArray(data)) throw new Error('le fichier doit contenir une liste de snippets')
      const known = new Set(snippets.map((s) => `${s.titre}\n${s.sql}`))
      const fresh = data.filter((d) => d.titre && d.sql && !known.has(`${d.titre}\n${d.sql}`))
      const created: Snippet[] = []
      for (const d of fresh) created.push(await createSnippet({ titre: String(d.titre), sql: String(d.sql), tags: Array.isArray(d.tags) ? d.tags.map(String) : [] }))
      setSnippets((l) => [...created, ...l])
      setError(null)
      setInfo(`${created.length} snippet${created.length > 1 ? 's' : ''} importé${created.length > 1 ? 's' : ''}, ${data.length - created.length} ignoré${data.length - created.length > 1 ? 's' : ''} (déjà présents ou incomplets).`)
    } catch (e) {
      setError(`Import impossible : ${(e as Error).message}`)
    }
  }

  async function remove(s: Snippet) {
    if (confirmDelete !== s.id) return setConfirmDelete(s.id)
    try {
      await deleteSnippet(s.id)
      setSnippets((l) => l.filter((x) => x.id !== s.id))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const small = 'rounded px-1.5 py-0.5 text-xs hover:bg-slate-200 dark:hover:bg-slate-700'

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[min(100vw,560px)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="font-semibold">Snippets</h2>
        <span className="text-xs text-slate-400">{snippets.length} sauvegardé{snippets.length > 1 ? 's' : ''} · aussi dans la Cheatsheet</span>
        <button onClick={exportJson} disabled={!snippets.length} className="ml-auto rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 disabled:opacity-40 dark:hover:bg-slate-800" title="Télécharger tous les snippets en JSON">
          Exporter
        </button>
        <label className="cursor-pointer rounded px-2 py-1 text-xs text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Importer un export JSON">
          Importer
          <input
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) importJson(f)
              e.target.value = ''
            }}
          />
        </label>
        <button onClick={onClose} className="rounded px-2 py-1 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" title="Fermer (Échap)">✕</button>
      </div>

      {draft && <DraftForm key={draft.n} draft={draft} onSaved={saved} onCancel={() => setDraft(null)} onError={setError} />}
      {info && <div className="border-b border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300">{info}</div>}
      {error && <div className="border-b border-rose-200 bg-rose-50 px-4 py-2 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-300">{error}</div>}

      <div className="px-4 pt-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Chercher dans les titres, tags et requêtes…" className={input} />
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {list.map((s) =>
          editing === s.id ? (
            <form
              key={s.id}
              className="space-y-2 rounded-lg border border-indigo-300 p-3 dark:border-indigo-800"
              onSubmit={(e) => {
                e.preventDefault()
                rename(s, e.currentTarget)
              }}
            >
              <input name="titre" defaultValue={s.titre} className={input} autoFocus />
              <input name="tags" defaultValue={s.tags.join(', ')} className={input} />
              <div className="flex gap-2">
                <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1 text-xs font-semibold text-white">OK</button>
                <button type="button" onClick={() => setEditing(null)} className="rounded-md px-3 py-1 text-xs text-slate-500">Annuler</button>
              </div>
            </form>
          ) : (
            <div key={s.id} className="group rounded-lg border border-slate-200 p-3 hover:border-indigo-300 dark:border-slate-800 dark:hover:border-indigo-800">
              <div className="flex items-start gap-2">
                <button onClick={() => onLoad(s)} className="min-w-0 flex-1 text-left" title="Charger dans l'éditeur">
                  <div className="font-medium text-slate-900 dark:text-white">{s.titre}</div>
                  <div className="truncate font-mono text-xs text-slate-500">{s.sql.replace(/\s+/g, ' ')}</div>
                </button>
                <div className="flex shrink-0 items-center gap-0.5 text-slate-500">
                  <button className={small} onClick={() => onRun(s)} title="Charger et exécuter">▶</button>
                  <button className={small} onClick={() => setEditing(s.id)} title="Renommer, tags">✎</button>
                  <button
                    className={`${small} ${confirmDelete === s.id ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300' : ''}`}
                    onClick={() => remove(s)}
                    onBlur={() => confirmDelete === s.id && setConfirmDelete(null)}
                    title="Supprimer"
                  >
                    {confirmDelete === s.id ? 'Supprimer ?' : '🗑'}
                  </button>
                </div>
              </div>
              {s.tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {s.tags.map((t) => (
                    <button key={t} onClick={() => setQ(t)} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-indigo-100 dark:bg-slate-800 dark:text-slate-400">{t}</button>
                  ))}
                </div>
              )}
            </div>
          ),
        )}
        {!snippets.length && !draft && <p className="text-sm text-slate-500">Aucun snippet. « ☆ Sauver » (⌘/Ctrl + S) range la requête de l'éditeur, ou la sélection.</p>}
        {snippets.length > 0 && !list.length && <p className="text-sm text-slate-500">Rien trouvé pour « {q} ».</p>}
      </div>
    </aside>
  )
}

const input = 'w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-950 dark:focus:ring-indigo-900'

/** Formulaire de sauvegarde, recréé à chaque brouillon (clé draft.n) : il part du snippet chargé s'il y en a un. */
function DraftForm({ draft, onSaved, onCancel, onError }: { draft: Draft; onSaved: (s: Snippet) => void; onCancel: () => void; onError: (m: string | null) => void }) {
  const [titre, setTitre] = useState(draft.loaded?.titre ?? '')
  const [tags, setTags] = useState(draft.loaded?.tags.join(', ') ?? '')

  async function save(asNew: boolean) {
    if (!titre.trim()) return onError('Donne un titre au snippet.')
    try {
      const body = { titre, sql: draft.sql, tags: parseTags(tags) }
      onSaved(draft.loaded && !asNew ? await updateSnippet(draft.loaded.id, body) : await createSnippet(body))
    } catch (e) {
      onError((e as Error).message)
    }
  }

  return (
    <form
      className="space-y-2 border-b border-slate-200 bg-indigo-50/60 px-4 py-3 dark:border-slate-800 dark:bg-indigo-950/30"
      onSubmit={(e) => {
        e.preventDefault()
        save(false)
      }}
    >
      <div className="text-xs font-semibold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">Sauver la requête</div>
      <input autoFocus value={titre} onChange={(e) => setTitre(e.target.value)} placeholder="Titre : ex. Tickets sans lignes" className={input} />
      <input value={tags} onChange={(e) => setTags(e.target.value)} placeholder="Tags séparés par des virgules : stock, fuseau…" className={input} />
      <pre className="max-h-32 overflow-auto rounded-lg bg-slate-900 px-3 py-2 font-mono text-[12px] text-slate-100" dangerouslySetInnerHTML={{ __html: highlightSql(draft.sql) }} />
      <div className="flex flex-wrap gap-2">
        <button type="submit" className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500">
          {draft.loaded ? `Mettre à jour « ${draft.loaded.titre} »` : 'Enregistrer'}
        </button>
        {draft.loaded && (
          <button type="button" onClick={() => save(true)} className="rounded-md border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100 dark:border-indigo-700 dark:text-indigo-300 dark:hover:bg-indigo-950">
            Enregistrer comme nouveau
          </button>
        )}
        <button type="button" onClick={onCancel} className="rounded-md px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800">Annuler</button>
      </div>
    </form>
  )
}
