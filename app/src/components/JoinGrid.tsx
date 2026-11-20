import { useState } from 'react'

/** Les 6 promos réelles concernées par les chevauchements (table prix_promos). */
const promos = [
  { id: 6, produit: 25, debut: '09-15', fin: '09-28' },
  { id: 39, produit: 25, debut: '09-25', fin: '10-02' },
  { id: 29, produit: 88, debut: '10-05', fin: '10-18' },
  { id: 37, produit: 88, debut: '10-12', fin: '10-25' },
  { id: 32, produit: 91, debut: '10-05', fin: '10-18' },
  { id: 38, produit: 91, debut: '10-01', fin: '10-07' },
]
type P = (typeof promos)[number]

const rules = [
  { key: 'produit', label: 'b.produit_id = a.produit_id', test: (a: P, b: P) => a.produit === b.produit },
  { key: 'ordre', label: 'a.id < b.id', test: (a: P, b: P) => a.id < b.id },
  { key: 'chevauche', label: 'a.debut <= b.fin AND b.debut <= a.fin', test: (a: P, b: P) => a.debut <= b.fin && b.debut <= a.fin },
] as const

const color: Record<number, string> = { 25: 'bg-sky-500', 88: 'bg-violet-500', 91: 'bg-amber-500' }

/**
 * Un JOIN = une double boucle : toutes les combinaisons (a, b) sont essayées,
 * le ON ne garde que celles qui respectent les conditions.
 */
export function JoinGrid() {
  const [on, setOn] = useState<string[]>([])
  const [hover, setHover] = useState<[number, number] | null>(null)
  const active = rules.filter((r) => on.includes(r.key))
  const kept = (a: P, b: P) => active.every((r) => r.test(a, b))
  const count = promos.flatMap((a) => promos.map((b) => kept(a, b))).filter(Boolean).length

  return (
    <div className="my-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-3 text-sm font-semibold">prix_promos a JOIN prix_promos b ON …</div>
      <div className="mb-4 flex flex-wrap gap-2">
        {rules.map((r) => (
          <label key={r.key} className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-1.5 font-mono text-xs ${on.includes(r.key) ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-950/50' : 'border-slate-300 dark:border-slate-700'}`}>
            <input type="checkbox" className="accent-indigo-600" checked={on.includes(r.key)} onChange={() => setOn(on.includes(r.key) ? on.filter((k) => k !== r.key) : [...on, r.key])} />
            {r.label}
          </label>
        ))}
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="overflow-x-auto">
          <table className="border-separate border-spacing-1 font-mono text-xs">
            <thead>
              <tr>
                <th className="px-1 text-right text-slate-400">a ↓ · b →</th>
                {promos.map((b) => (
                  <th key={b.id} className="px-1">
                    <div className="flex flex-col items-center gap-0.5">
                      <span>{b.id}</span>
                      <span className={`h-1.5 w-6 rounded ${color[b.produit]}`} />
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {promos.map((a, i) => (
                <tr key={a.id}>
                  <th className="pr-2 text-right">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-3 w-1.5 rounded ${color[a.produit]}`} />
                      {a.id}
                    </span>
                  </th>
                  {promos.map((b, j) => {
                    const k = kept(a, b)
                    const failed = active.find((r) => !r.test(a, b))
                    return (
                      <td
                        key={b.id}
                        onMouseEnter={() => setHover([i, j])}
                        onMouseLeave={() => setHover(null)}
                        title={failed ? `écartée par : ${failed.label}` : 'gardée'}
                        className={`h-9 w-9 cursor-default rounded-md text-center transition-colors ${k ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-300 dark:bg-slate-800 dark:text-slate-600'} ${hover?.[0] === i && hover?.[1] === j ? 'ring-2 ring-indigo-500' : ''}`}
                      >
                        {k ? '✓' : '·'}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex-1 space-y-3 text-sm">
          <div className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/60">
            <div className="text-2xl font-bold">{count} <span className="text-sm font-normal text-slate-500">ligne{count > 1 ? 's' : ''} sur 36 combinaisons</span></div>
          </div>
          {hover ? (
            <div className="rounded-lg border border-slate-200 p-3 font-mono text-xs dark:border-slate-700">
              <div>a = promo {promos[hover[0]].id} (produit {promos[hover[0]].produit}, {promos[hover[0]].debut} → {promos[hover[0]].fin})</div>
              <div>b = promo {promos[hover[1]].id} (produit {promos[hover[1]].produit}, {promos[hover[1]].debut} → {promos[hover[1]].fin})</div>
              {rules.map((r) => (
                <div key={r.key} className={on.includes(r.key) ? '' : 'opacity-40'}>
                  {r.test(promos[hover[0]], promos[hover[1]]) ? '✓' : '✗'} {r.label}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500">Survole une case pour voir la paire (a, b) et le résultat de chaque condition.</p>
          )}
          <p className="text-slate-600 dark:text-slate-400">
            Sans aucune condition, Postgres forme <strong>toutes</strong> les paires : 6 × 6 = 36. C'est la double boucle « pour chaque a, pour chaque b ». Chaque condition du ON éteint des cases. Coche-les une par une : 36 → 12 (même produit : 2 × 2 cases par produit) → 3 ({'a.id < b.id'} retire la diagonale « avec soi-même » et les paires inversées). La 3e condition n'éteint rien ici car ces 3 paires se recouvrent toutes. Essaie-la seule, ou avec {'a.id < b.id'} sans la première, pour voir son effet.
          </p>
          <p className="text-slate-600 dark:text-slate-400">
            Ajoute par la pensée une 7e promo au produit 88 : la grille grandit d'une ligne et d'une colonne, et les nouvelles paires apparaissent toutes seules. Rien à changer dans la requête : <strong>on ne décrit pas la boucle, seulement la condition</strong>.
          </p>
        </div>
      </div>
    </div>
  )
}
