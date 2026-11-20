import { useMemo, useState, type ReactNode } from 'react'
import { cats, entries, type Demo, type Entry } from '../content/lexicon'
import { plus } from '../content/lexiconPlus'
import { useNav } from '../lib/nav'
import { highlightSql } from '../lib/highlight'
import { C, Callout, Card, H2, PageHeader, Sql, Tag } from '../components/ui'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '')
const slug = (name: string) => 'x-' + norm(name).replace(/[^a-z0-9]+/g, '-')

function DemoView({ demo }: { demo: Demo }) {
  const [head, ...rows] = demo.result
  return (
    <div className="my-3 grid gap-3 md:grid-cols-[1fr_auto] md:items-start">
      <pre className="overflow-x-auto rounded-lg bg-slate-900 px-4 py-3 font-mono text-[12.5px] leading-relaxed text-slate-100" dangerouslySetInnerHTML={{ __html: highlightSql(demo.sql) }} />
      <div className="flex items-center gap-2">
        <span className="text-slate-400">→</span>
        <table className="overflow-hidden rounded-lg border border-slate-200 font-mono text-[12.5px] dark:border-slate-700">
          <thead className="bg-slate-100 dark:bg-slate-800">
            <tr>{head.map((h, i) => <th key={i} className="px-2.5 py-1 text-left font-semibold">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t border-slate-100 bg-white dark:border-slate-800 dark:bg-slate-900">
                {r.map((v, j) => <td key={j} className="px-2.5 py-1 whitespace-nowrap">{v === null ? <span className="text-slate-400 italic">NULL</span> : String(v)}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Texte avec `code` entre accents graves */
function Rich({ text }: { text: string }): ReactNode {
  return text.split(/(`[^`]+`)/g).map((part, i) => (part.startsWith('`') ? <C key={i}>{part.slice(1, -1)}</C> : part))
}

function More({ name }: { name: string }) {
  const [open, setOpen] = useState(false)
  const p = plus[name]
  if (!p) return null
  return (
    <div className="mt-4">
      <button
        onClick={() => setOpen(!open)}
        className="inline-flex items-center gap-2 rounded-lg border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-300 dark:hover:bg-indigo-950/50"
      >
        <span className="text-base leading-none">{open ? '−' : '+'}</span>
        {open ? 'Moins de détails' : 'En savoir plus'}
      </button>
      {open && (
        <div className="mt-3 rounded-lg border-l-4 border-indigo-400 bg-indigo-50/60 px-4 py-3 dark:bg-indigo-950/30">
          {p.text.map((t, i) => (
            <p key={i} className="my-2 text-sm leading-relaxed">
              <Rich text={t} />
            </p>
          ))}
          {p.sql && <Sql code={p.sql} save={{ titre: `${name} (détail)` }} />}
        </div>
      )}
    </div>
  )
}

function EntryCard({ e, onSee }: { e: Entry; onSee: (name: string) => void }) {
  const { go } = useNav()
  return (
    <article id={slug(e.name)} className="scroll-mt-6 rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="font-mono text-lg font-bold text-indigo-700 dark:text-indigo-300">{e.name}</h3>
        <Tag>{e.cat}</Tag>
        {plus[e.name] && <Tag color="indigo">+ détails</Tag>}
        {e.lesson && (
          <button onClick={() => go('cours', e.lesson)} className="ml-auto text-xs text-indigo-600 hover:underline dark:text-indigo-400">
            → leçon associée
          </button>
        )}
      </div>
      <p className="mt-2 leading-relaxed">{e.def}</p>
      <div className="mt-3 text-xs font-semibold tracking-wide text-slate-500 uppercase">Syntaxe</div>
      <code className="mt-1 block overflow-x-auto rounded-md bg-slate-100 px-3 py-2 font-mono text-[13px] whitespace-pre dark:bg-slate-800">{e.syntax}</code>
      {e.demo && (
        <>
          <div className="mt-4 text-xs font-semibold tracking-wide text-slate-500 uppercase">Démo</div>
          <DemoView demo={e.demo} />
        </>
      )}
      {e.example && (
        <>
          <div className="mt-4 text-xs font-semibold tracking-wide text-slate-500 uppercase">Sur la base du kit</div>
          <Sql code={e.example} save={{ titre: e.name, tags: [e.cat.toLowerCase()] }} />
        </>
      )}
      <More name={e.name} />
      {e.piege && <Callout tone="warn" title="Piège">{e.piege}</Callout>}
      {e.voir && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="text-slate-500">Voir aussi :</span>
          {e.voir.map((v) => (
            <button key={v} onClick={() => onSee(v)} className="rounded-md bg-slate-100 px-2 py-0.5 font-mono hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-950">
              {v}
            </button>
          ))}
        </div>
      )}
    </article>
  )
}

function Basics() {
  return (
    <section className="mb-12">
      <H2 id="bases">Avant tout : les bases</H2>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-2 font-semibold">Anatomie d'une requête</h3>
          <pre className="overflow-x-auto rounded-lg bg-slate-900 p-4 font-mono text-[12.5px] leading-6 text-slate-100">
{`SELECT   magasin_id, count(*) AS nb   `}<span className="text-emerald-400">-- 5. quelles colonnes afficher</span>{`
FROM     tickets_caisse               `}<span className="text-emerald-400">-- 1. depuis quelle table</span>{`
WHERE    statut = 'VALIDE'            `}<span className="text-emerald-400">-- 2. quelles lignes garder</span>{`
GROUP BY magasin_id                   `}<span className="text-emerald-400">-- 3. une ligne par …</span>{`
HAVING   count(*) > 1000              `}<span className="text-emerald-400">-- 4. quels groupes garder</span>{`
ORDER BY nb DESC                      `}<span className="text-emerald-400">-- 6. dans quel ordre</span>{`
LIMIT    3;                           `}<span className="text-emerald-400">-- 7. combien</span>
          </pre>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            Les clauses s'écrivent toujours dans cet ordre ; seules SELECT et FROM sont obligatoires. Les numéros donnent l'ordre dans lequel Postgres les <em>calcule</em>.
          </p>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Les règles d'écriture</h3>
          <ul className="space-y-2 text-sm">
            <li><C>'texte'</C> entre apostrophes simples. Une apostrophe dans le texte se double : <C>'Jus d''orange'</C>.</li>
            <li><C>"Nom"</C> entre guillemets doubles = un <strong>nom</strong> de colonne/table (rare), jamais une valeur.</li>
            <li><C>-- commentaire</C> jusqu'à la fin de la ligne.</li>
            <li>Les mots-clés ne sont pas sensibles à la casse (<C>select</C> = <C>SELECT</C>), les valeurs texte si : <C>'Frais'</C> ≠ <C>'frais'</C>.</li>
            <li><C>;</C> termine une instruction.</li>
            <li><C>t.col</C> : la colonne <C>col</C> de la table d'alias <C>t</C> (obligatoire si deux tables ont la même colonne).</li>
          </ul>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">Les types que tu vas croiser</h3>
          <table className="w-full text-sm">
            <tbody className="[&_td]:py-1 [&_td]:pr-3 [&_td]:align-top">
              <tr><td><C>int</C>, <C>bigint</C>, <C>serial</C></td><td>entiers (serial = auto-incrémenté, pour les id)</td></tr>
              <tr><td><C>numeric(10,2)</C></td><td>décimal exact : montants, quantités</td></tr>
              <tr><td><C>text</C></td><td>chaîne de caractères</td></tr>
              <tr><td><C>boolean</C></td><td><C>true</C> / <C>false</C> (/ NULL)</td></tr>
              <tr><td><C>date</C></td><td>un jour</td></tr>
              <tr><td><C>timestamptz</C></td><td>un instant précis (date + heure + fuseau)</td></tr>
            </tbody>
          </table>
        </Card>

        <Card>
          <h3 className="mb-2 font-semibold">NULL en 4 phrases</h3>
          <ul className="space-y-2 text-sm">
            <li>NULL = « valeur inconnue ou absente ». Ce n'est ni 0, ni <C>''</C>.</li>
            <li>Tout calcul ou comparaison avec NULL donne NULL : <C>1 + NULL</C>, <C>NULL = NULL</C>.</li>
            <li>On le teste avec <C>IS NULL</C>, on le remplace avec <C>coalesce()</C>.</li>
            <li>Les agrégats l'ignorent (<C>sum</C>, <C>avg</C>, <C>count(col)</C>), sauf <C>count(*)</C>.</li>
          </ul>
          <More name="IS NULL" />
        </Card>

        <Card className="lg:col-span-2">
          <h3 className="mb-2 font-semibold">Lire un message d'erreur</h3>
          <div className="grid gap-2 text-sm md:grid-cols-2">
            {[
              ['column "x" does not exist', 'Faute de frappe, alias de SELECT utilisé dans le WHERE, ou texte écrit avec "guillemets" au lieu de \'apostrophes\'.'],
              ['column "x" must appear in the GROUP BY clause', 'Colonne affichée ni regroupée ni agrégée : l’ajouter au GROUP BY ou l’entourer de max()/sum()…'],
              ['aggregate functions are not allowed in WHERE', 'sum()/count() dans le WHERE : passer en HAVING.'],
              ['invalid input syntax for type numeric', 'Conversion d’un texte qui n’est pas un nombre (virgule, €, espace…).'],
              ['operator does not exist: integer = text', 'Types différents comparés : convertir avec ::int ou ::text.'],
              ['division by zero', 'Utiliser nullif(diviseur, 0).'],
              ['missing FROM-clause entry for table "t"', 'Alias t utilisé mais pas déclaré dans le FROM / JOIN.'],
              ['current transaction is aborted', 'Une erreur précédente dans le BEGIN : faire ROLLBACK puis recommencer.'],
            ].map(([err, fix]) => (
              <div key={err} className="rounded-lg bg-slate-50 p-3 dark:bg-slate-800/50">
                <div className="font-mono text-xs text-rose-600 dark:text-rose-400">ERROR: {err}</div>
                <div className="mt-1 text-slate-600 dark:text-slate-400">{fix}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <Sql title="Essaie : la requête de l'anatomie" code={`SELECT magasin_id, count(*) AS nb\nFROM tickets_caisse\nWHERE statut = 'VALIDE'\nGROUP BY magasin_id\nHAVING count(*) > 1000\nORDER BY nb DESC\nLIMIT 3;`} />
    </section>
  )
}

/** Texte cherché pour chaque fiche : définition, syntaxe, exemples, pièges et « En savoir plus ». */
const searchText = new Map(
  entries.map((e) => [e, norm([e.name, e.cat, e.def, e.syntax, e.demo?.sql, e.example, e.piege, ...(plus[e.name]?.text ?? []), plus[e.name]?.sql].filter(Boolean).join(' '))]),
)

export default function Lexicon() {
  const [q, setQ] = useState('')
  const [cat, setCat] = useState<string | null>(null)
  const list = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return entries.filter((e) => (!cat || e.cat === cat) && words.every((w) => searchText.get(e)!.includes(w)))
  }, [q, cat])

  const see = (name: string) => {
    setQ('')
    setCat(null)
    requestAnimationFrame(() => document.getElementById(slug(name))?.scrollIntoView({ behavior: 'smooth' }))
  }

  return (
    <>
      <PageHeader
        title="Lexique SQL"
        subtitle="Les bases à connaître, puis chaque mot-clé et fonction expliqués simplement : à quoi ça sert, la syntaxe, une démo avec son résultat, un exemple exécutable sur le kit et le piège à éviter."
      />
      <Basics />

      <div className="sticky top-14 z-[5] -mx-4 mb-6 bg-slate-50/95 px-4 py-3 backdrop-blur md:top-0 dark:bg-slate-950/95">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher : coalesce, null, date, doublon, classement…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-2.5 shadow-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:border-slate-700 dark:bg-slate-900 dark:focus:ring-indigo-900"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {[null, ...cats].map((c) => (
            <button key={c ?? 'all'} onClick={() => setCat(c)} className={`rounded-full px-3 py-1 text-xs font-medium ${cat === c ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-700 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'}`}>
              {c ?? `Tout (${entries.length})`}
            </button>
          ))}
        </div>
      </div>

      {cats.map((c) => {
        const items = list.filter((e) => e.cat === c)
        if (!items.length) return null
        return (
          <section key={c} className="mb-10">
            <h2 className="mb-4 text-xl font-semibold text-slate-900 dark:text-white">{c}</h2>
            <div className="space-y-5">{items.map((e) => <EntryCard key={e.name} e={e} onSee={see} />)}</div>
          </section>
        )
      })}
      {!list.length && <p className="text-slate-500">Rien trouvé pour « {q} ».</p>}
    </>
  )
}
