import { useMemo, useState } from 'react'
import { dialectNames, dialectRows, type DialectId } from '../content/dialects'
import { useStored } from '../lib/storage'
import { C, H2, P, PageHeader } from '../components/ui'

const ids = Object.keys(dialectNames) as DialectId[]
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

export default function Dialects() {
  const [shown, setShown] = useStored<DialectId[]>('dialectes:shown:v2', ids)
  const [q, setQ] = useState('')
  const cols = ids.filter((d) => shown.includes(d))
  const rows = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean)
    return dialectRows.filter((r) => words.every((w) => norm([r.theme, r.need, r.note ?? '', ...ids.map((d) => r[d])].join(' ')).includes(w)))
  }, [q])
  const themes = [...new Set(rows.map((r) => r.theme))]
  const toggle = (d: DialectId) => setShown(shown.includes(d) ? shown.filter((x) => x !== d) : [...shown, d])

  return (
    <>
      <PageHeader
        title="Dialectes SQL"
        subtitle="Le même besoin écrit en PostgreSQL, MySQL, SQL Server, Oracle, SQLite et Informix. Le SQL standard est commun, les écarts sont dans la pagination, les dates, le texte, les NULL et l'upsert."
      />
      <div className="mb-6 flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Filtrer (ex. pagination, concat, upsert)"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm sm:w-80 dark:border-slate-700 dark:bg-slate-900"
        />
        <div className="flex flex-wrap gap-1.5">
          {ids.map((d) => (
            <button
              key={d}
              onClick={() => toggle(d)}
              aria-pressed={shown.includes(d)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${shown.includes(d) ? 'border-indigo-500 bg-indigo-600 text-white' : 'border-slate-300 text-slate-500 hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800'}`}
            >
              {dialectNames[d]}
            </button>
          ))}
        </div>
      </div>

      {themes.map((t) => (
        <section key={t} className="mb-8">
          <H2 id={`d-${norm(t).replace(/\s+/g, '-')}`}>{t}</H2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] overflow-hidden rounded-lg border border-slate-200 text-sm dark:border-slate-700">
              <thead className="bg-slate-100 text-left dark:bg-slate-800">
                <tr>
                  <th className="w-44 px-3 py-1.5 font-semibold">Besoin</th>
                  {cols.map((d) => (
                    <th key={d} className={`px-3 py-1.5 font-semibold ${d === 'pg' ? 'text-indigo-700 dark:text-indigo-300' : ''}`}>{dialectNames[d]}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.filter((r) => r.theme === t).map((r) => (
                  <tr key={r.need} className="border-t border-slate-100 bg-white align-top dark:border-slate-800 dark:bg-slate-900">
                    <td className="px-3 py-2">
                      <div className="font-medium text-slate-900 dark:text-white">{r.need}</div>
                      {r.note && <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">{r.note}</div>}
                    </td>
                    {cols.map((d) => (
                      <td key={d} className={`px-3 py-2 font-mono text-[12.5px] whitespace-pre-wrap ${d === 'pg' ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-400'}`}>{r[d]}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
      {!rows.length && <p className="text-slate-500">Rien trouvé pour « {q} ».</p>}

      <H2 id="informix">Informix : ce qui surprend</H2>
      <P>Pas de base Informix dans le playground (image trop lourde), mais les réflexes à avoir quand on passe de PostgreSQL à Informix :</P>
      <ul className="mb-6 list-disc space-y-2 pl-6 text-sm text-slate-700 dark:text-slate-300">
        <li><C>SELECT SKIP 20 FIRST 10 …</C> : la pagination se place juste après <C>SELECT</C>, pas en fin de requête.</li>
        <li><C>MATCHES</C> en plus de <C>LIKE</C>, avec les jokers <C>*</C> et <C>?</C> : <C>WHERE libelle MATCHES '*[Bb]io*'</C>. Les deux sont sensibles à la casse.</li>
        <li>Les dates : <C>TODAY</C> (type <C>DATE</C>) et <C>CURRENT</C> (type <C>DATETIME</C>). Un <C>DATETIME</C> déclare sa précision : <C>DATETIME YEAR TO SECOND</C>, <C>DATETIME HOUR TO MINUTE</C>… On ajoute une durée avec <C>UNITS</C> : <C>CURRENT - 2 UNITS HOUR</C>.</li>
        <li><C>MDY(m, d, y)</C> fabrique une date ; <C>DAY()</C>, <C>MONTH()</C>, <C>YEAR()</C>, <C>WEEKDAY()</C> (0 = dimanche) la découpent. Le format d'affichage dépend des variables <C>DBDATE</C> et <C>GL_DATETIME</C>.</li>
        <li>Tables temporaires à la volée : <C>SELECT … INTO TEMP t WITH NO LOG</C>, très utilisé pour découper une requête de diagnostic en étapes.</li>
        <li><C>SELECT</C> exige un <C>FROM</C> : l'idiome est <C>SELECT … FROM systables WHERE tabid = 1</C> (une ligne garantie).</li>
        <li>Les guillemets doubles délimitent une chaîne, sauf si la variable <C>DELIMIDENT</C> est définie : ils citent alors un identifiant, comme en SQL standard.</li>
        <li>Lecture sans verrou pour un diagnostic : <C>SET ISOLATION TO DIRTY READ</C> (l'équivalent de <C>READ UNCOMMITTED</C>). Pratique sur une base chargée, mais on peut lire des données non validées.</li>
        <li>Les transactions dépendent du mode de journalisation de la base : sans journalisation, <C>BEGIN WORK</C> est refusé et chaque instruction est définitive.</li>
        <li>Ancienne syntaxe de jointure externe encore présente dans du code existant : <C>FROM a, OUTER b WHERE a.id = b.a_id</C>. À réécrire en <C>LEFT JOIN</C>.</li>
        <li>Dans <C>dbaccess</C>, <C>UNLOAD TO 'fichier.unl' SELECT …</C> exporte un résultat (séparateur <C>|</C>) et <C>LOAD FROM</C> le recharge.</li>
      </ul>

      <H2>Écrire du SQL portable</H2>
      <P>
        Préférer les formes standard quand elles existent : <C>COALESCE</C> plutôt que <C>IFNULL</C> / <C>ISNULL</C> / <C>NVL</C>, <C>CASE WHEN</C>, <C>FETCH FIRST</C>,
        les colonnes <C>GENERATED … AS IDENTITY</C>, les fonctions de fenêtre et les CTE. Toujours un <C>ORDER BY</C> explicite : sans lui, aucun moteur ne garantit
        l'ordre des lignes, même si le résultat a l'air trié.
      </P>
    </>
  )
}
