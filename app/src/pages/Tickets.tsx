import { useState } from 'react'
import { kitTickets, ticketRules } from '../lib/kit'
import { ticketExtras } from '../content/hints'
import { useStored } from '../lib/storage'
import { useNav } from '../lib/nav'
import { Markdown } from '../components/Markdown'
import { Callout, PageHeader, Reveal, Sql, Tag } from '../components/ui'

type Status = 'todo' | 'doing' | 'done'
const statusLabel: Record<Status, string> = { todo: 'À faire', doing: 'En cours', done: 'Résolu' }
const statusColor = { todo: 'slate', doing: 'amber', done: 'emerald' } as const

export default function Tickets() {
  const [current, setCurrent] = useStored('tickets:current', 'T01')
  const [status, setStatus] = useStored<Record<string, Status>>('tickets:status', {})
  const [notes, setNotes] = useStored<Record<string, string>>('tickets:notes', {})
  const [hintsShown, setHintsShown] = useState(0)
  const { openInPlayground } = useNav()
  const ticket = kitTickets.find((t) => t.id === current) ?? kitTickets[0]
  const extra = ticketExtras[ticket.id]
  const done = kitTickets.filter((t) => status[t.id] === 'done').length

  const select = (id: string) => {
    setCurrent(id)
    setHintsShown(0)
    window.scrollTo({ top: 0 })
  }

  return (
    <>
      <PageHeader title="Tickets d'entraînement" subtitle="15 incidents réalistes de support N2 retail sur la base training_sql. Diagnostic → cause → réponse à l'utilisateur.">
        <div className="mt-4 flex items-center gap-3">
          <div className="h-2 w-64 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(done / kitTickets.length) * 100}%` }} />
          </div>
          <span className="text-sm text-slate-500">{done}/{kitTickets.length} résolus</span>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-6 lg:flex-row">
        <nav className="shrink-0 space-y-4 lg:w-72">
          {[...new Set(kitTickets.map((t) => t.level))].map((level) => (
            <div key={level}>
              <div className="mb-1 text-xs font-semibold tracking-wide text-slate-500 uppercase">{level}</div>
              {kitTickets.filter((t) => t.level === level).map((t) => {
                const s = status[t.id] ?? 'todo'
                return (
                  <button key={t.id} onClick={() => select(t.id)} className={`flex w-full items-start gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm ${t.id === ticket.id ? 'bg-indigo-100 text-indigo-900 dark:bg-indigo-950 dark:text-indigo-100' : 'hover:bg-slate-200/60 dark:hover:bg-slate-800/60'}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${s === 'done' ? 'bg-emerald-500' : s === 'doing' ? 'bg-amber-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                    <span><span className="font-mono text-xs text-slate-500">{t.id}</span> {t.title}</span>
                  </button>
                )
              })}
            </div>
          ))}
          <Reveal label="Règles du jeu">
            <div className="text-sm"><Markdown source={ticketRules} /></div>
          </Reveal>
        </nav>

        <article className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-slate-500">{ticket.id}</span>
            {extra?.skills.map((s) => <Tag key={s} color="indigo">{s}</Tag>)}
            <div className="ml-auto flex gap-1">
              {(Object.keys(statusLabel) as Status[]).map((s) => (
                <button key={s} onClick={() => setStatus({ ...status, [ticket.id]: s })} className={`rounded-md px-2.5 py-1 text-xs font-medium ${(status[ticket.id] ?? 'todo') === s ? 'ring-2 ring-indigo-400' : 'opacity-60 hover:opacity-100'}`}>
                  <Tag color={statusColor[s]}>{statusLabel[s]}</Tag>
                </button>
              ))}
            </div>
          </div>
          <h2 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">« {ticket.title} »</h2>
          <div className="mt-2"><Markdown source={ticket.body} /></div>

          {extra && (
            <>
              <h3 className="mt-8 mb-2 font-semibold">Point de départ</h3>
              <Sql code={extra.starter} />

              <h3 className="mt-8 mb-2 font-semibold">Indices progressifs</h3>
              {extra.hints.slice(0, hintsShown).map((h, i) => (
                <Callout key={i} tone="warn" title={`Indice ${i + 1}`}>{h}</Callout>
              ))}
              {hintsShown < extra.hints.length && (
                <button onClick={() => setHintsShown(hintsShown + 1)} className="rounded-lg border border-amber-400 px-3 py-1.5 text-sm text-amber-700 hover:bg-amber-50 dark:text-amber-300 dark:hover:bg-amber-950/40">
                  Afficher l'indice {hintsShown + 1}/{extra.hints.length}
                </button>
              )}
            </>
          )}

          <h3 className="mt-8 mb-2 font-semibold">Ma réponse</h3>
          <p className="mb-2 text-sm text-slate-500">Cause en une phrase, impact chiffré, réponse à l'utilisateur, ce qu'on remonte à l'équipe technique.</p>
          <textarea
            value={notes[ticket.id] ?? ''}
            onChange={(e) => setNotes({ ...notes, [ticket.id]: e.target.value })}
            rows={6}
            className="w-full rounded-lg border border-slate-300 bg-white p-3 text-sm dark:border-slate-700 dark:bg-slate-900"
            placeholder={'Cause : …\nImpact : …\nRéponse utilisateur : …\nÀ remonter : …'}
          />

          <div className="mt-8">
            <Reveal label="Voir la solution commentée (après avoir cherché !)" tone="emerald">
              <Sql code={ticket.solution} run={false} />
              <button onClick={() => openInPlayground(ticket.solution)} className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500">
                ▶ Exécuter toute la solution dans le playground
              </button>
            </Reveal>
          </div>
        </article>
      </div>
    </>
  )
}
