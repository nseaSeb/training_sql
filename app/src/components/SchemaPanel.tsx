import { useState } from 'react'
import type { SchemaColumn } from '../lib/api'
import { SchemaDiagram } from './viz'

/** Ce que représente une ligne de chaque table, et ses liens (y compris ceux sans clé étrangère). */
const meta: Record<string, { grain: string; links?: string[] }> = {
  magasins: { grain: 'un magasin', links: ['← tickets_caisse.magasin_id', '← stocks.magasin_id (sans FK)'] },
  produits: { grain: 'une fiche produit (attention : EAN pas unique)', links: ['← lignes_ticket.produit_id (sans FK)', '← stocks / mouvements_stock.produit_id (sans FK)'] },
  tickets_caisse: { grain: 'un ticket de caisse (un passage client)', links: ['→ magasins.id', '← lignes_ticket.ticket_id (sans FK)', 'carte_fidelite ↔ clients_fidelite.num_carte (sans FK)'] },
  lignes_ticket: { grain: 'un article sur un ticket', links: ['→ tickets_caisse.id (sans FK)', '→ produits.id (sans FK, peut être NULL)'] },
  clients_fidelite: { grain: 'une carte de fidélité', links: ['→ magasins.id', 'num_carte ↔ tickets_caisse.carte_fidelite'] },
  prix_promos: { grain: 'une opération promo sur un produit (magasin NULL = nationale)', links: ['→ produits.id', '→ magasins.id'] },
  mouvements_stock: { grain: 'un mouvement de stock (+ entrée / − sortie)', links: ['→ magasins.id, produits.id (sans FK)'] },
  stocks: { grain: 'le stock courant d’un produit dans un magasin (mis à jour par batch)', links: ['clé : (magasin_id, produit_id)', '= somme de mouvements_stock si le batch passe'] },
  imports_log: { grain: 'un passage de flux (import nocturne) pour un magasin', links: ['→ magasins.id (sans FK)'] },
  import_produits_staging: { grain: 'une ligne du fichier fournisseur, brute (tout en texte)', links: ['à intégrer dans produits'] },
}

const short = (t: string) => t.replace('timestamp with time zone', 'timestamptz').replace('character varying', 'varchar')

export function SchemaPanel({ schema, onClose, onInsert, onPreview }: {
  schema: SchemaColumn[]
  onClose: () => void
  onInsert: (text: string) => void
  onPreview: (table: string) => void
}) {
  const [tab, setTab] = useState<'tables' | 'diagramme'>('tables')
  const [open, setOpen] = useState<string[]>(['tickets_caisse', 'lignes_ticket'])
  const [filter, setFilter] = useState('')
  const tables = [...new Set(schema.map((c) => c.table_name))]
  const f = filter.toLowerCase()
  const visible = tables.filter((t) => !f || t.includes(f) || schema.some((c) => c.table_name === t && c.column_name.includes(f)))

  return (
    <aside className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[min(100vw,560px)] flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <h2 className="font-semibold">Schéma retail</h2>
        <div className="ml-3 flex rounded-lg bg-slate-100 p-0.5 text-xs dark:bg-slate-800">
          {(['tables', 'diagramme'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`rounded-md px-2.5 py-1 font-medium capitalize ${tab === t ? 'bg-white shadow-sm dark:bg-slate-700' : 'text-slate-500'}`}>
              {t}
            </button>
          ))}
        </div>
        <span className="ml-auto hidden text-xs text-slate-400 sm:inline">⌘/Ctrl + I</span>
        <button onClick={onClose} className="rounded-md px-2 py-1 text-lg leading-none text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800" aria-label="Fermer">×</button>
      </div>

      {tab === 'diagramme' ? (
        <div className="overflow-auto p-3">
          <p className="mb-2 text-xs text-slate-500">Survole une table pour surligner ses liens.</p>
          <SchemaDiagram />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-2 dark:border-slate-800">
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Filtrer table ou colonne…" className="flex-1 rounded-md border border-slate-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus:border-indigo-500 dark:border-slate-700" />
            <button onClick={() => setOpen(open.length ? [] : tables)} className="text-xs text-indigo-600 hover:underline dark:text-indigo-400">
              {open.length ? 'Tout replier' : 'Tout déplier'}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-3 py-2">
            {visible.map((t) => {
              const cols = schema.filter((c) => c.table_name === t)
              const isOpen = open.includes(t) || !!f
              return (
                <div key={t} className="mb-2 rounded-lg border border-slate-200 dark:border-slate-800">
                  <button onClick={() => setOpen(isOpen ? open.filter((x) => x !== t) : [...open, t])} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                    <span className={`text-xs text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>▸</span>
                    <span className="font-mono text-sm font-semibold">{t}</span>
                    <span className="ml-auto text-xs text-slate-400">{Number(cols[0].approx_rows).toLocaleString('fr-FR')} lignes</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-slate-100 px-3 pt-2 pb-3 dark:border-slate-800">
                      {meta[t] && <p className="mb-2 text-xs text-slate-600 dark:text-slate-400">Une ligne = <strong>{meta[t].grain}</strong></p>}
                      <table className="w-full font-mono text-xs">
                        <tbody>
                          {cols.map((c) => (
                            <tr key={c.column_name} className="group border-t border-slate-100 first:border-0 dark:border-slate-800">
                              <td className="py-1 pr-2">
                                <button onClick={() => onInsert(c.column_name)} title="Insérer dans l'éditeur" className="hover:text-indigo-600 dark:hover:text-indigo-400">
                                  {c.column_name}
                                </button>
                              </td>
                              <td className="py-1 pr-2 text-slate-400">{short(c.data_type)}</td>
                              <td className="py-1 text-right whitespace-nowrap">
                                {c.pk && <span className="mr-1 rounded bg-amber-100 px-1 text-[10px] text-amber-800 dark:bg-amber-900/60 dark:text-amber-200">PK</span>}
                                {c.fk && <span className="mr-1 rounded bg-sky-100 px-1 text-[10px] text-sky-800 dark:bg-sky-900/60 dark:text-sky-200" title={`→ ${c.fk}`}>FK → {c.fk.split('.')[0]}</span>}
                                {c.is_nullable === 'NO' && !c.pk && <span className="text-[10px] text-slate-400">NOT NULL</span>}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {meta[t]?.links && (
                        <ul className="mt-2 space-y-0.5 text-[11px] text-slate-500">
                          {meta[t].links!.map((l) => <li key={l} className="font-mono">{l}</li>)}
                        </ul>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button onClick={() => onPreview(t)} className="rounded-md bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500">▶ Aperçu 20 lignes</button>
                        <button onClick={() => onInsert(t)} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">Insérer le nom</button>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
          <div className="border-t border-slate-200 px-4 py-2 text-[11px] text-slate-500 dark:border-slate-800">
            PK = clé primaire · FK = clé étrangère déclarée · « sans FK » = lien logique non protégé par la base (source d'orphelins, cf. T15)
          </div>
        </>
      )}
    </aside>
  )
}
