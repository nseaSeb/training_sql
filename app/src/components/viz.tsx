import { useState } from 'react'
import type { ReactNode } from 'react'

/* ------------------------------------------------------------------ */
/* Mini-table générique                                                */
/* ------------------------------------------------------------------ */

type RowState = 'keep' | 'drop' | 'null' | 'dup' | 'g1' | 'g2' | 'g3' | 'g4' | 'cut'

const rowStyle: Record<RowState, string> = {
  keep: '',
  drop: 'opacity-35 line-through decoration-rose-500',
  null: 'bg-amber-50 dark:bg-amber-950/40',
  dup: 'bg-rose-50 dark:bg-rose-950/40',
  g1: 'bg-indigo-50 dark:bg-indigo-950/50',
  g2: 'bg-emerald-50 dark:bg-emerald-950/50',
  g3: 'bg-sky-50 dark:bg-sky-950/50',
  g4: 'bg-fuchsia-50 dark:bg-fuchsia-950/50',
  cut: 'opacity-35',
}

type Row = { cells: ReactNode[]; state?: RowState; note?: string }

export function MiniTable({ title, cols, rows, className = '' }: { title?: ReactNode; cols: string[]; rows: Row[]; className?: string }) {
  return (
    <div className={`overflow-x-auto rounded-lg border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900 ${className}`}>
      {title && <div className="border-b border-slate-200 px-3 py-1.5 font-mono text-xs font-semibold text-slate-500 dark:border-slate-700 dark:text-slate-400">{title}</div>}
      <table className="w-full font-mono text-xs">
        <thead>
          <tr className="text-left text-slate-500 dark:text-slate-400">
            {cols.map((c) => (
              <th key={c} className="px-3 py-1.5 font-semibold">{c}</th>
            ))}
            <th className="w-0" />
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className={`border-t border-slate-100 transition-all duration-500 dark:border-slate-800 ${rowStyle[r.state ?? 'keep']}`}>
              {r.cells.map((c, j) => (
                <td key={j} className="px-3 py-1 whitespace-nowrap">
                  {c === null ? <span className="text-amber-600 italic dark:text-amber-400">NULL</span> : c}
                </td>
              ))}
              <td className="px-2 py-1 text-[10px] whitespace-nowrap text-slate-500">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Legend({ items }: { items: [RowState, string][] }) {
  return (
    <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
      {items.map(([s, label]) => (
        <span key={label} className="flex items-center gap-1.5">
          <span className={`inline-block h-3 w-5 rounded border border-slate-300 dark:border-slate-600 ${rowStyle[s]}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 1. Ordre d'exécution logique                                        */
/* ------------------------------------------------------------------ */

const T = [
  [1, 1, 'VALIDE', 40],
  [2, 2, 'VALIDE', 25],
  [3, 1, 'ANNULE', 90],
  [4, 3, 'VALIDE', 15],
  [5, 2, 'VALIDE', 35],
  [6, 1, 'VALIDE', 30],
  [7, 3, 'VALIDE', 20],
  [8, 4, 'VALIDE', 10],
] as const
const grp: Record<number, RowState> = { 1: 'g1', 2: 'g2', 3: 'g3', 4: 'g4' }

const execSteps: { kw: string; clause: string; text: string; cols: string[]; rows: Row[] }[] = [
  {
    kw: 'FROM',
    clause: 'FROM tickets_caisse',
    text: 'On part de la table brute : toutes les lignes, toutes les colonnes. Les JOIN se font ici aussi.',
    cols: ['id', 'magasin_id', 'statut', 'total_ttc'],
    rows: T.map((r) => ({ cells: [...r] })),
  },
  {
    kw: 'WHERE',
    clause: "WHERE statut = 'VALIDE'",
    text: 'Filtre ligne à ligne, AVANT tout regroupement. Une ligne est gardée seulement si la condition vaut TRUE (pas FALSE, pas NULL).',
    cols: ['id', 'magasin_id', 'statut', 'total_ttc'],
    rows: T.map((r) => ({ cells: [...r], state: r[2] === 'ANNULE' ? 'drop' : 'keep', note: r[2] === 'ANNULE' ? 'éliminée' : '' })),
  },
  {
    kw: 'GROUP BY',
    clause: 'GROUP BY magasin_id',
    text: 'Les lignes restantes sont rangées en paquets, un paquet par magasin. Après cette étape, on ne manipule plus des lignes mais des groupes.',
    cols: ['id', 'magasin_id', 'statut', 'total_ttc'],
    rows: T.filter((r) => r[2] === 'VALIDE')
      .slice()
      .sort((a, b) => a[1] - b[1])
      .map((r) => ({ cells: [...r], state: grp[r[1]], note: `paquet ${r[1]}` })),
  },
  {
    kw: 'HAVING',
    clause: 'HAVING sum(total_ttc) > 30',
    text: "Filtre sur les GROUPES, avec des agrégats. Le magasin 4 (10 €) disparaît. C'est le seul endroit où sum() peut servir de filtre.",
    cols: ['magasin_id', 'sum(total_ttc)'],
    rows: [
      { cells: [1, 70], state: 'g1' },
      { cells: [2, 60], state: 'g2' },
      { cells: [3, 35], state: 'g3' },
      { cells: [4, 10], state: 'drop', note: '10 ≤ 30' },
    ],
  },
  {
    kw: 'SELECT',
    clause: 'SELECT magasin_id, sum(total_ttc) AS ca',
    text: 'Seulement maintenant on calcule les colonnes de sortie et on donne les alias. "ca" n\'existe pas avant cette étape !',
    cols: ['magasin_id', 'ca'],
    rows: [
      { cells: [1, 70] },
      { cells: [2, 60] },
      { cells: [3, 35] },
    ],
  },
  {
    kw: 'ORDER BY',
    clause: 'ORDER BY ca DESC',
    text: "Tri du résultat. ORDER BY vient après SELECT : c'est la seule clause (avec LIMIT) qui peut utiliser l'alias ca.",
    cols: ['magasin_id', 'ca'],
    rows: [
      { cells: [1, 70] },
      { cells: [2, 60] },
      { cells: [3, 35] },
    ],
  },
  {
    kw: 'LIMIT',
    clause: 'LIMIT 2',
    text: 'On coupe. Sans ORDER BY, LIMIT renvoie « 2 lignes au hasard » : toujours trier avant de limiter.',
    cols: ['magasin_id', 'ca'],
    rows: [
      { cells: [1, 70] },
      { cells: [2, 60] },
      { cells: [3, 35], state: 'cut', note: 'coupée' },
    ],
  },
]

export function ExecOrder() {
  const [step, setStep] = useState(0)
  const s = execSteps[step]
  return (
    <div className="my-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap items-center gap-1.5">
        {execSteps.map((e, i) => (
          <button
            key={e.kw}
            onClick={() => setStep(i)}
            className={`rounded-md px-2.5 py-1 font-mono text-xs font-semibold transition ${
              i === step
                ? 'bg-indigo-600 text-white shadow'
                : i < step
                  ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200'
                  : 'bg-white text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
            }`}
          >
            {i + 1}. {e.kw}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-[1fr_1.2fr]">
        <div>
          <pre className="rounded-lg bg-slate-900 p-3 font-mono text-xs leading-relaxed text-slate-300">
            {execSteps.map((e, i) => (
              <div key={e.kw} className={i === step ? 'font-semibold text-sky-300' : i < step ? 'text-slate-400' : 'text-slate-600'}>
                {e.clause}
              </div>
            ))}
          </pre>
          <p className="mt-3 text-sm leading-relaxed">{s.text}</p>
          <div className="mt-3 flex gap-2">
            <button disabled={step === 0} onClick={() => setStep(step - 1)} className="rounded-md px-3 py-1 text-sm ring-1 ring-slate-300 disabled:opacity-30 dark:ring-slate-700">
              ← Précédent
            </button>
            <button
              disabled={step === execSteps.length - 1}
              onClick={() => setStep(step + 1)}
              className="rounded-md bg-indigo-600 px-3 py-1 text-sm text-white disabled:opacity-30"
            >
              Étape suivante →
            </button>
          </div>
        </div>
        <MiniTable key={step} title={`après ${s.kw}`} cols={s.cols} rows={s.rows} />
      </div>
      <p className="mt-3 text-xs text-slate-500">
        La requête s'écrit dans l'ordre SELECT … FROM … mais elle s'évalue dans l'ordre des boutons ci-dessus.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 2. Schéma retail                                                    */
/* ------------------------------------------------------------------ */

type Box = { name: string; x: number; y: number; cols: string[]; grain: string }
const boxes: Box[] = [
  { name: 'magasins', x: 20, y: 20, cols: ['id PK', 'code', 'actif'], grain: '1 ligne = 1 magasin' },
  { name: 'tickets_caisse', x: 270, y: 20, cols: ['id PK', 'magasin_id', 'num_caisse', 'date_ticket', 'total_ttc', 'statut', 'carte_fidelite'], grain: '1 ligne = 1 passage en caisse' },
  { name: 'lignes_ticket', x: 540, y: 20, cols: ['id PK', 'ticket_id', 'produit_id (NULL ok)', 'qte', 'prix_unitaire_ttc', 'remise'], grain: '1 ligne = 1 article scanné' },
  { name: 'produits', x: 760, y: 200, cols: ['id PK', 'ean (pas UNIQUE !)', 'libelle', 'rayon', 'prix_ttc'], grain: '1 ligne = 1 fiche article' },
  { name: 'clients_fidelite', x: 20, y: 240, cols: ['id PK', 'num_carte UNIQUE', 'email', 'magasin_id'], grain: '1 ligne = 1 carte' },
  { name: 'prix_promos', x: 540, y: 300, cols: ['id PK', 'produit_id', 'magasin_id (NULL = national)', 'debut', 'fin'], grain: '1 ligne = 1 opération' },
  { name: 'mouvements_stock', x: 270, y: 300, cols: ['id PK', 'magasin_id', 'produit_id', 'type_mvt', 'qte (signée)'], grain: '1 ligne = 1 entrée/sortie' },
  { name: 'stocks', x: 760, y: 410, cols: ['(magasin_id, produit_id) PK', 'qte', 'maj_le'], grain: '1 ligne = 1 article × 1 magasin' },
]
const W = 200
const rowH = 15
const boxH = (b: Box) => 40 + b.cols.length * rowH
const byName = Object.fromEntries(boxes.map((b) => [b.name, b]))
type Link = { from: string; to: string; label: string; dashed?: boolean }
const links: Link[] = [
  { from: 'magasins', to: 'tickets_caisse', label: '1 → N' },
  { from: 'tickets_caisse', to: 'lignes_ticket', label: '1 → N (sans FK)', dashed: true },
  { from: 'produits', to: 'lignes_ticket', label: '1 → N' },
  { from: 'clients_fidelite', to: 'tickets_caisse', label: 'num_carte = carte_fidelite', dashed: true },
  { from: 'produits', to: 'prix_promos', label: '1 → N' },
  { from: 'produits', to: 'stocks', label: '1 → N' },
  { from: 'mouvements_stock', to: 'stocks', label: 'Σ qte (batch)', dashed: true },
]

function anchor(a: Box, b: Box) {
  const ca = { x: a.x + W / 2, y: a.y + boxH(a) / 2 }
  const cb = { x: b.x + W / 2, y: b.y + boxH(b) / 2 }
  const clip = (box: Box, c: { x: number; y: number }, tx: number, ty: number) => {
    const dx = tx - c.x
    const dy = ty - c.y
    const sx = dx === 0 ? Infinity : W / 2 / Math.abs(dx)
    const sy = dy === 0 ? Infinity : boxH(box) / 2 / Math.abs(dy)
    const s = Math.min(sx, sy)
    return { x: c.x + dx * s, y: c.y + dy * s }
  }
  return [clip(a, ca, cb.x, cb.y), clip(b, cb, ca.x, ca.y)]
}

export function SchemaDiagram() {
  const [hover, setHover] = useState<string | null>(null)
  return (
    <div className="my-6 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900">
      <svg viewBox="0 0 980 520" className="min-w-[720px] text-slate-700 dark:text-slate-300">
        <defs>
          <marker id="arr" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-400" />
          </marker>
        </defs>
        {links.map((l) => {
          const [p, q] = anchor(byName[l.from], byName[l.to])
          const active = hover === l.from || hover === l.to
          return (
            <g key={l.from + l.to}>
              <line
                x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                markerEnd="url(#arr)"
                strokeDasharray={l.dashed ? '5 4' : undefined}
                className={active ? 'stroke-indigo-500' : 'stroke-slate-400 dark:stroke-slate-600'}
                strokeWidth={active ? 2 : 1.2}
              />
              <text x={(p.x + q.x) / 2} y={(p.y + q.y) / 2 - 4} textAnchor="middle" className={`text-[10px] ${active ? 'fill-indigo-600 dark:fill-indigo-300' : 'fill-slate-500'}`}>
                {l.label}
              </text>
            </g>
          )
        })}
        {boxes.map((b) => (
          <g key={b.name} onMouseEnter={() => setHover(b.name)} onMouseLeave={() => setHover(null)} className="cursor-default">
            <rect x={b.x} y={b.y} width={W} height={boxH(b)} rx={8}
              className={`${hover === b.name ? 'stroke-indigo-500' : 'stroke-slate-300 dark:stroke-slate-700'} fill-slate-50 dark:fill-slate-950`} strokeWidth={1.5} />
            <rect x={b.x} y={b.y} width={W} height={22} rx={8} className="fill-indigo-600" />
            <text x={b.x + 10} y={b.y + 15} className="fill-white font-mono text-[12px] font-semibold">{b.name}</text>
            {b.cols.map((c, i) => (
              <text key={c} x={b.x + 10} y={b.y + 38 + i * rowH} className={`font-mono text-[10.5px] ${c.includes('PK') ? 'fill-indigo-700 font-semibold dark:fill-indigo-300' : 'fill-current'}`}>
                {c}
              </text>
            ))}
            <text x={b.x + 10} y={b.y + boxH(b) - 6} className="fill-emerald-700 text-[9.5px] italic dark:fill-emerald-400">{b.grain}</text>
          </g>
        ))}
        <g>
          <rect x={20} y={420} width={470} height={80} rx={8} className="fill-amber-50 stroke-amber-300 dark:fill-amber-950/40 dark:stroke-amber-800" />
          <text x={32} y={442} className="fill-current font-mono text-[12px] font-semibold">imports_log · import_produits_staging</text>
          <text x={32} y={462} className="fill-current text-[11px]">Tables de supervision des flux / batchs (1 ligne = 1 passage de flux)</text>
          <text x={32} y={480} className="fill-current text-[11px]">et zone de transit d'un fichier fournisseur (tout en texte, non contrôlé).</text>
        </g>
      </svg>
      <p className="px-2 pb-1 text-xs text-slate-500">Survole une table pour voir ses liens. Pointillés : lien logique sans clé étrangère, donc rien n'empêche les orphelins.</p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 3. Jointures                                                        */
/* ------------------------------------------------------------------ */

const P = [
  ['P1', 'Pâtes'],
  ['P2', 'Yaourt'],
  ['P3', 'Jus (nouveauté)'],
]
const L = [
  ['L1', 'P1', 2],
  ['L2', 'P1', 1],
  ['L3', 'P2', 3],
  ['L4', null, 1],
] as const

type JoinMode = 'inner' | 'left' | 'where' | 'anti' | 'fanout'
const joinModes: { id: JoinMode; label: string; sql: string; text: ReactNode; cols: string[]; rows: Row[]; leftState: RowState[]; rightState: RowState[] }[] = [
  {
    id: 'inner',
    label: 'INNER JOIN',
    sql: 'FROM produits p\nJOIN lignes_ticket l ON l.produit_id = p.id',
    text: 'Ne garde que les couples qui matchent. P3 (jamais vendu) et L4 (produit NULL) disparaissent sans bruit. P1 apparaît deux fois : normal, il a deux lignes (relation 1-N).',
    cols: ['p.id', 'libelle', 'l.id', 'qte'],
    rows: [
      { cells: ['P1', 'Pâtes', 'L1', 2] },
      { cells: ['P1', 'Pâtes', 'L2', 1] },
      { cells: ['P2', 'Yaourt', 'L3', 3] },
    ],
    leftState: ['keep', 'keep', 'drop'],
    rightState: ['keep', 'keep', 'keep', 'drop'],
  },
  {
    id: 'left',
    label: 'LEFT JOIN',
    sql: 'FROM produits p\nLEFT JOIN lignes_ticket l ON l.produit_id = p.id',
    text: 'Toutes les lignes de gauche sont gardées. Si rien ne matche à droite, les colonnes de droite sont remplies de NULL (P3).',
    cols: ['p.id', 'libelle', 'l.id', 'qte'],
    rows: [
      { cells: ['P1', 'Pâtes', 'L1', 2] },
      { cells: ['P1', 'Pâtes', 'L2', 1] },
      { cells: ['P2', 'Yaourt', 'L3', 3] },
      { cells: ['P3', 'Jus (nouveauté)', null, null], state: 'null', note: 'complétée en NULL' },
    ],
    leftState: ['keep', 'keep', 'keep'],
    rightState: ['keep', 'keep', 'keep', 'drop'],
  },
  {
    id: 'where',
    label: 'Piège : LEFT + WHERE',
    sql: 'FROM produits p\nLEFT JOIN lignes_ticket l ON l.produit_id = p.id\nWHERE l.qte >= 1',
    text: (
      <>
        Le WHERE s'exécute APRÈS la jointure. Pour P3, <code>l.qte</code> vaut NULL, et <code>NULL &gt;= 1</code> n'est pas TRUE : la ligne est éliminée. Le LEFT JOIN
        redevient un INNER JOIN. Correction : mettre la condition dans le <code>ON</code> (→ ticket T04).
      </>
    ),
    cols: ['p.id', 'libelle', 'l.id', 'qte'],
    rows: [
      { cells: ['P1', 'Pâtes', 'L1', 2] },
      { cells: ['P1', 'Pâtes', 'L2', 1] },
      { cells: ['P2', 'Yaourt', 'L3', 3] },
      { cells: ['P3', 'Jus (nouveauté)', null, null], state: 'drop', note: 'NULL >= 1 → éliminée' },
    ],
    leftState: ['keep', 'keep', 'keep'],
    rightState: ['keep', 'keep', 'keep', 'drop'],
  },
  {
    id: 'anti',
    label: 'Anti-jointure',
    sql: 'FROM produits p\nWHERE NOT EXISTS (\n  SELECT 1 FROM lignes_ticket l\n  WHERE l.produit_id = p.id)',
    text: 'Les produits de gauche qui n\'ont AUCUN correspondant à droite. Équivalent : LEFT JOIN … WHERE l.id IS NULL. Ne jamais utiliser NOT IN si la sous-requête peut contenir un NULL (→ ticket T02).',
    cols: ['p.id', 'libelle'],
    rows: [{ cells: ['P3', 'Jus (nouveauté)'] }],
    leftState: ['drop', 'drop', 'keep'],
    rightState: ['cut', 'cut', 'cut', 'cut'],
  },
  {
    id: 'fanout',
    label: 'Fan-out (doublons)',
    sql: "FROM lignes_ticket l\nJOIN prix_promos pp ON pp.produit_id = l.produit_id\n-- P1 a 2 promos qui se chevauchent (A et B)",
    text: (
      <>
        Si la table de droite a plusieurs lignes par clé, chaque ligne de gauche est <b>dupliquée</b>. Ici P1 a deux promos actives : L1 et L2 apparaissent deux
        fois, et <code>sum(qte)</code> pour P1 passe de 3 à 6. Remède : <code>EXISTS</code> ou agréger avant de joindre (→ ticket T10).
      </>
    ),
    cols: ['l.id', 'produit', 'qte', 'promo'],
    rows: [
      { cells: ['L1', 'P1', 2, 'A'] },
      { cells: ['L1', 'P1', 2, 'B'], state: 'dup', note: 'doublon' },
      { cells: ['L2', 'P1', 1, 'A'] },
      { cells: ['L2', 'P1', 1, 'B'], state: 'dup', note: 'doublon' },
      { cells: ['L3', 'P2', 3, 'C'] },
    ],
    leftState: ['keep', 'keep', 'drop'],
    rightState: ['keep', 'keep', 'keep', 'drop'],
  },
]

export function JoinViz() {
  const [mode, setMode] = useState<JoinMode>('inner')
  const m = joinModes.find((j) => j.id === mode)!
  return (
    <div className="my-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex flex-wrap gap-1.5">
        {joinModes.map((j) => (
          <button
            key={j.id}
            onClick={() => setMode(j.id)}
            className={`rounded-md px-3 py-1 text-xs font-semibold transition ${
              j.id === mode ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            {j.label}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <MiniTable title="produits (gauche)" cols={['id', 'libelle']} rows={P.map((r, i) => ({ cells: r, state: m.leftState[i] }))} />
        <MiniTable title="lignes_ticket (droite)" cols={['id', 'produit_id', 'qte']} rows={L.map((r, i) => ({ cells: [...r], state: m.rightState[i] }))} />
      </div>
      <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1.2fr]">
        <div>
          <pre className="rounded-lg bg-slate-900 p-3 font-mono text-xs whitespace-pre-wrap text-sky-200">{m.sql}</pre>
          <p className="mt-3 text-sm leading-relaxed">{m.text}</p>
        </div>
        <MiniTable key={mode} title="résultat" cols={m.cols} rows={m.rows} />
      </div>
      <Legend items={[['drop', 'éliminée'], ['null', 'complétée en NULL'], ['dup', 'dupliquée']]} />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 4. Logique à trois valeurs                                          */
/* ------------------------------------------------------------------ */

type V = 'T' | 'F' | 'N'
const vLabel: Record<V, string> = { T: 'TRUE', F: 'FALSE', N: 'NULL' }
const vStyle: Record<V, string> = {
  T: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/60 dark:text-emerald-200',
  F: 'bg-rose-100 text-rose-800 dark:bg-rose-900/60 dark:text-rose-200',
  N: 'bg-amber-100 text-amber-800 dark:bg-amber-900/60 dark:text-amber-200',
}
const and3 = (a: V, b: V): V => (a === 'F' || b === 'F' ? 'F' : a === 'N' || b === 'N' ? 'N' : 'T')
const or3 = (a: V, b: V): V => (a === 'T' || b === 'T' ? 'T' : a === 'N' || b === 'N' ? 'N' : 'F')

function Grid({ op, fn }: { op: string; fn: (a: V, b: V) => V }) {
  const vs: V[] = ['T', 'F', 'N']
  return (
    <table className="font-mono text-xs">
      <thead>
        <tr>
          <th className="px-2 py-1 text-slate-500">{op}</th>
          {vs.map((v) => (
            <th key={v} className="px-2 py-1 text-slate-500">{vLabel[v]}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {vs.map((a) => (
          <tr key={a}>
            <th className="px-2 py-1 text-right text-slate-500">{vLabel[a]}</th>
            {vs.map((b) => (
              <td key={b} className="p-0.5">
                <div className={`rounded px-2 py-1 text-center font-semibold ${vStyle[fn(a, b)]}`}>{vLabel[fn(a, b)]}</div>
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

export function TruthTable() {
  const cmp: [string, V][] = [
    ['NULL = NULL', 'N'],
    ['NULL <> 1', 'N'],
    ['NULL IS NULL', 'T'],
    ['NULL IS NOT DISTINCT FROM NULL', 'T'],
    ['3 NOT IN (1, 2, NULL)', 'N'],
    ['3 IN (3, NULL)', 'T'],
  ]
  return (
    <div className="my-6 grid gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/60">
      <Grid op="AND" fn={and3} />
      <Grid op="OR" fn={or3} />
      <div className="space-y-1">
        {cmp.map(([expr, v]) => (
          <div key={expr} className="flex items-center justify-between gap-2 font-mono text-xs">
            <span>{expr}</span>
            <span className={`rounded px-2 py-0.5 font-semibold ${vStyle[v]}`}>{vLabel[v]}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500 md:col-span-3">
        WHERE et ON ne gardent que les lignes TRUE. NULL signifie « inconnu » : toute comparaison avec un inconnu reste inconnue.
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 7. GROUP BY vs fonction de fenêtre                                  */
/* ------------------------------------------------------------------ */

const sales = [
  ['Frais', 'Yaourt', 120],
  ['Frais', 'Beurre', 90],
  ['Frais', 'Crème', 90],
  ['Épicerie', 'Pâtes', 200],
  ['Épicerie', 'Riz', 60],
] as const

export function WindowViz() {
  const [mode, setMode] = useState<'group' | 'window'>('group')
  const total = (r: string) => sales.filter((s) => s[0] === r).reduce((a, s) => a + s[2], 0)
  const rank = (r: string, ca: number) => 1 + sales.filter((s) => s[0] === r && s[2] > ca).length
  return (
    <div className="my-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="flex gap-1.5">
        {(['group', 'window'] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-md px-3 py-1 text-xs font-semibold ${m === mode ? 'bg-indigo-600 text-white' : 'bg-white ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700'}`}
          >
            {m === 'group' ? 'GROUP BY rayon' : 'OVER (PARTITION BY rayon)'}
          </button>
        ))}
      </div>
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <MiniTable title="ventes (5 lignes)" cols={['rayon', 'produit', 'ca']} rows={sales.map((s) => ({ cells: [...s], state: s[0] === 'Frais' ? 'g1' : 'g2' }))} />
        {mode === 'group' ? (
          <MiniTable
            key="g"
            title="SELECT rayon, sum(ca) … GROUP BY rayon → 2 lignes"
            cols={['rayon', 'sum']}
            rows={[
              { cells: ['Frais', total('Frais')], state: 'g1' },
              { cells: ['Épicerie', total('Épicerie')], state: 'g2' },
            ]}
          />
        ) : (
          <MiniTable
            key="w"
            title="sum(ca) OVER w, rank() OVER w → 5 lignes"
            cols={['rayon', 'produit', 'ca', 'total_rayon', 'rang']}
            rows={sales.map((s) => ({ cells: [...s, total(s[0]), rank(s[0], s[2])], state: s[0] === 'Frais' ? 'g1' : 'g2' }))}
          />
        )}
      </div>
      <p className="mt-3 text-sm">
        {mode === 'group'
          ? 'GROUP BY écrase chaque paquet en une seule ligne : on perd le détail produit.'
          : 'Une fonction de fenêtre calcule sur le paquet mais garde chaque ligne. Beurre et Crème sont ex aequo : rank() donne 2, 2 puis le suivant aurait 4.'}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 8. Fuseaux horaires                                                 */
/* ------------------------------------------------------------------ */

export function TimezoneViz() {
  const hours = Array.from({ length: 8 }, (_, i) => 20 + i) // 20h → 3h (heure de Paris)
  return (
    <div className="my-6 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/60">
      <div className="min-w-[560px] space-y-2 font-mono text-xs">
        {[
          { label: 'Paris (UTC+2)', off: 0 },
          { label: 'UTC', off: -2 },
        ].map((tz) => (
          <div key={tz.label} className="flex items-center gap-1">
            <span className="w-28 shrink-0 text-slate-500">{tz.label}</span>
            {hours.map((h) => {
              const local = (h + tz.off + 24) % 24
              const day = h + tz.off >= 24 ? 15 : 14
              return (
                <div key={h} className={`flex-1 rounded px-1 py-1.5 text-center ${day === 15 ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/60 dark:text-indigo-200' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {String(local).padStart(2, '0')}h<br />
                  <span className="text-[10px]">{day}/10</span>
                </div>
              )
            })}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm">
        Même instant, deux étiquettes. Un ticket à 01h30 à Paris le 15/10 est à 23h30 UTC le 14/10. Découper les journées en UTC envoie les tickets de 0h à 2h sur la veille
        (→ ticket T09).
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* 9. Correction sûre                                                  */
/* ------------------------------------------------------------------ */

export function SafeFixSteps() {
  const steps = [
    ['Sauvegarder', 'CREATE TABLE sauvegarde_x AS SELECT … WHERE <cond>', 'slate'],
    ['BEGIN', 'Ouvre la transaction : rien n\'est encore visible pour les autres.', 'indigo'],
    ['Compter', 'SELECT count(*) … WHERE <cond>  → noter N', 'sky'],
    ['Modifier', 'UPDATE … WHERE <cond> RETURNING *  → « UPDATE N » ?', 'amber'],
    ['Contrôler', 'Requête de vérification : le problème a disparu ?', 'emerald'],
    ['ROLLBACK / COMMIT', 'ROLLBACK si doute. COMMIT seulement si validé.', 'rose'],
  ] as const
  const c = {
    slate: 'border-slate-400',
    indigo: 'border-indigo-500',
    sky: 'border-sky-500',
    amber: 'border-amber-500',
    emerald: 'border-emerald-500',
    rose: 'border-rose-500',
  }
  return (
    <ol className="my-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {steps.map(([t, d, col], i) => (
        <li key={t} className={`rounded-lg border-l-4 bg-white p-3 shadow-sm dark:bg-slate-900 ${c[col]}`}>
          <div className="text-xs text-slate-500">Étape {i + 1}</div>
          <div className="font-semibold">{t}</div>
          <div className="mt-1 font-mono text-[11px] text-slate-600 dark:text-slate-400">{d}</div>
        </li>
      ))}
    </ol>
  )
}

/* ------------------------------------------------------------------ */
/* 11. Méthode de diagnostic                                           */
/* ------------------------------------------------------------------ */

export function DiagFlow() {
  const steps = [
    ['Reproduire', 'Rejouer la requête telle quelle, mêmes paramètres. Noter ce que l\'utilisateur attendait.'],
    ['Réduire', 'Retirer jointures et filtres un par un jusqu\'à trouver celui qui change le résultat.'],
    ['Compter', 'count(*) à chaque étape. Si ça gonfle après un JOIN : chercher la duplication.'],
    ['NULL & dates', 'La moitié des écarts vient de là : NOT IN, LEFT + WHERE, fuseaux, bornes.'],
    ['Répondre', 'Cause en une phrase, requête corrigée, impact chiffré, ce qu\'on remonte à l\'équipe technique.'],
  ]
  return (
    <div className="my-6 flex flex-col gap-2 md:flex-row md:items-stretch">
      {steps.map(([t, d], i) => (
        <div key={t} className="flex flex-1 items-center gap-2 md:flex-col md:items-stretch">
          <div className="flex-1 rounded-lg bg-white p-3 shadow-sm ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
              <span className="font-semibold">{t}</span>
            </div>
            <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{d}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
