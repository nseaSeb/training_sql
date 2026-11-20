import type { ReactNode } from 'react'
import { useState } from 'react'
import { useNav } from '../lib/nav'
import { highlightSql } from '../lib/highlight'
import { createSnippet } from '../lib/api'

export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-slate-900 dark:text-white">{title}</h1>
      {subtitle && <p className="mt-2 max-w-3xl text-slate-600 dark:text-slate-400">{subtitle}</p>}
      {children}
    </header>
  )
}

export function H2({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h2 id={id} className="mt-10 mb-3 scroll-mt-6 text-xl font-semibold text-slate-900 dark:text-white">
      {children}
    </h2>
  )
}

export function H3({ children }: { children: ReactNode }) {
  return <h3 className="mt-6 mb-2 font-semibold text-slate-900 dark:text-white">{children}</h3>
}

export function P({ children }: { children: ReactNode }) {
  return <p className="my-3 leading-relaxed">{children}</p>
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}>
      {children}
    </div>
  )
}

const tones = {
  info: 'border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-100',
  tip: 'border-emerald-300 bg-emerald-50 text-emerald-950 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100',
  warn: 'border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100',
  danger: 'border-rose-300 bg-rose-50 text-rose-950 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-100',
}

export function Callout({ tone = 'info', title, children }: { tone?: keyof typeof tones; title?: string; children: ReactNode }) {
  return (
    <div className={`my-4 rounded-lg border-l-4 px-4 py-3 ${tones[tone]}`}>
      {title && <div className="mb-1 font-semibold">{title}</div>}
      <div className="text-sm leading-relaxed">{children}</div>
    </div>
  )
}

export function Tag({ children, color = 'slate' }: { children: ReactNode; color?: 'slate' | 'indigo' | 'emerald' | 'amber' | 'rose' | 'sky' }) {
  const c = {
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    indigo: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200',
    emerald: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
    amber: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
    rose: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
    sky: 'bg-sky-100 text-sky-800 dark:bg-sky-900/60 dark:text-sky-200',
  }[color]
  return <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-medium ${c}`}>{children}</span>
}

/** Code inline */
export function C({ children }: { children: ReactNode }) {
  return <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.85em] text-indigo-700 dark:bg-slate-800 dark:text-indigo-300">{children}</code>
}

/**
 * Bloc SQL coloré, avec bouton « Exécuter » qui l'envoie au playground.
 * Avec `save`, un bouton ☆ le range dans les snippets (même stockage que le Playground).
 */
export function Sql({ code, run = true, title, save }: { code: string; run?: boolean; title?: string; save?: { titre: string; tags?: string[] } }) {
  const { openInPlayground } = useNav()
  const [copied, setCopied] = useState(false)
  const [saved, setSaved] = useState<'idle' | 'ok' | 'error'>('idle')
  const sql = code.replace(/^\n+|\s+$/g, '')
  return (
    <div className="group my-4 overflow-hidden rounded-lg border border-slate-800 bg-slate-900 text-slate-100 dark:border-slate-700">
      {title && <div className="border-b border-slate-800 px-4 py-1.5 text-xs text-slate-400">{title}</div>}
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[13px] leading-relaxed" dangerouslySetInnerHTML={{ __html: highlightSql(sql) }} />
      <div className="flex justify-end gap-2 border-t border-slate-800 px-3 py-1.5">
        <button
          className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white"
          onClick={() => {
            navigator.clipboard?.writeText(sql)
            setCopied(true)
            setTimeout(() => setCopied(false), 1200)
          }}
        >
          {copied ? 'Copié ✓' : 'Copier'}
        </button>
        {save && (
          <button
            className="rounded px-2 py-0.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-white disabled:hover:bg-transparent"
            disabled={saved === 'ok'}
            title="Ranger dans mes snippets"
            onClick={() => createSnippet({ titre: save.titre, sql, tags: save.tags ?? [] }).then(() => setSaved('ok'), () => setSaved('error'))}
          >
            {{ idle: '☆ Snippet', ok: '★ Sauvé', error: 'Échec ✗' }[saved]}
          </button>
        )}
        {run && (
          <button className="rounded bg-indigo-600 px-2.5 py-0.5 text-xs font-medium text-white hover:bg-indigo-500" onClick={() => openInPlayground(sql)}>
            ▶ Exécuter
          </button>
        )}
      </div>
    </div>
  )
}

/** Contenu masqué (indice, solution) */
export function Reveal({ label, children, tone = 'slate' }: { label: string; children: ReactNode; tone?: 'slate' | 'amber' | 'emerald' }) {
  const [open, setOpen] = useState(false)
  const c = { slate: 'border-slate-300 dark:border-slate-700', amber: 'border-amber-300 dark:border-amber-800', emerald: 'border-emerald-300 dark:border-emerald-800' }[tone]
  return (
    <div className={`my-3 rounded-lg border border-dashed ${c}`}>
      <button className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm font-medium" onClick={() => setOpen(!open)}>
        <span className={`transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        {label}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  )
}
