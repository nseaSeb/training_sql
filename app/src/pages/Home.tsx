import { useNav, type Page } from '../lib/nav'
import { useStored } from '../lib/storage'
import { Card, PageHeader, Tag } from '../components/ui'

const plan: { when: string; what: string; page: Page; duration: string }[] = [
  { when: 'Étape 1', what: 'Auto-évaluation : repérer ses thèmes faibles', page: 'quiz', duration: '20 min' },
  { when: 'Étape 2', what: 'Lexique : « Avant tout : les bases », puis survol des fiches', page: 'lexique', duration: '30 min' },
  { when: 'Étape 3', what: 'Méthode : traiter une demande pas à pas', page: 'methode', duration: '20 min' },
  { when: 'Étape 4', what: 'Cours 1 à 4 : modèle mental, schéma, jointures, NULL', page: 'cours', duration: '45 min' },
  { when: 'Étape 5', what: 'Tickets T01 à T04 (échauffement) dans le playground', page: 'tickets', duration: '45 min' },
  { when: 'Étape 6', what: 'Tickets T05 à T08 : doublons, flux, batch', page: 'tickets', duration: '1 h' },
  { when: 'Étape 7', what: 'Cours avancés : fenêtres, dates, EXPLAIN', page: 'cours', duration: '1 h' },
  { when: 'Étape 8', what: 'Cheatsheet, dont les différences PostgreSQL / SQL Server', page: 'cheatsheet', duration: '20 min' },
]

const questions = [
  ['Que doit contenir une ligne du résultat ?', 'Un ticket ? un produit par jour ? un magasin par semaine ? C’est la granularité cible : elle dicte le GROUP BY.'],
  ['Quelles tables portent l’information ?', 'Et quelle est la granularité de chacune (une ligne = quoi) ?'],
  ['Comment elles se relient, et en 1-1 ou 1-N ?', 'Une jointure 1-N multiplie les lignes : agréger avant, ou utiliser EXISTS.'],
  ['Quelles lignes garder, et avant ou après regroupement ?', 'Avant → WHERE. Après → HAVING. Dans une jointure externe → ON.'],
  ['Comment je vérifie que c’est juste ?', 'count(*) à chaque étape, un cas connu à la main, NULL et dates contrôlés.'],
]

export default function Home() {
  const { go } = useNav()
  const [done, setDone] = useStored<number[]>('home:plan', [])
  return (
    <>
      <PageHeader
        title="Training SQL · PostgreSQL"
        subtitle="S'entraîner au SQL sur une vraie base PostgreSQL : cours visuels, tickets réalistes, playground en direct et auto-évaluation."
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <h2 className="mb-4 text-lg font-semibold">Parcours conseillé</h2>
          <ol className="space-y-2">
            {plan.map((p, i) => (
              <li key={i} className="flex items-center gap-3">
                <input type="checkbox" checked={done.includes(i)} onChange={() => setDone(done.includes(i) ? done.filter((x) => x !== i) : [...done, i])} className="h-4 w-4 accent-indigo-600" />
                <span className="w-24 shrink-0 text-xs font-medium text-slate-500">{p.when}</span>
                <button onClick={() => go(p.page)} className={`flex-1 text-left text-sm hover:text-indigo-600 ${done.includes(i) ? 'text-slate-400 line-through' : ''}`}>
                  {p.what}
                </button>
                <Tag>{p.duration}</Tag>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="lg:col-span-2">
          <h2 className="mb-1 text-lg font-semibold">Le modèle mental en 5 questions</h2>
          <p className="mb-4 text-sm text-slate-500">À se poser avant d'écrire la moindre ligne.</p>
          <ol className="space-y-3">
            {questions.map(([q, a], i) => (
              <li key={i} className="flex gap-3">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium">{q}</div>
                  <div className="text-xs text-slate-500">{a}</div>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <h2 className="mt-10 mb-4 text-lg font-semibold">Ordre d'exécution logique</h2>
      <div className="flex flex-wrap items-center gap-2">
        {['FROM / JOIN', 'WHERE', 'GROUP BY', 'HAVING', 'SELECT', 'DISTINCT', 'ORDER BY', 'LIMIT'].map((s, i, a) => (
          <div key={s} className="flex items-center gap-2">
            <span className="rounded-lg border border-indigo-200 bg-white px-3 py-2 font-mono text-sm font-semibold text-indigo-700 shadow-sm dark:border-indigo-900 dark:bg-slate-900 dark:text-indigo-300">{s}</span>
            {i < a.length - 1 && <span className="text-slate-400">›</span>}
          </div>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-500">On écrit SELECT en premier, mais Postgres le calcule presque en dernier. D'où : pas d'alias du SELECT dans le WHERE, pas de sum() dans le WHERE.</p>

      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {([
          ['cours', 'Cours visuels', 'Jointures, NULL, fenêtres, dates, EXPLAIN'],
          ['tickets', '20 tickets', 'Incidents réalistes, indices, solutions'],
          ['playground', 'Playground', 'SQL en direct sur PostgreSQL'],
          ['cheatsheet', 'Cheatsheet', 'Requêtes types et équivalences SQL Server'],
        ] as [Page, string, string][]).map(([page, t, d]) => (
          <button key={page} onClick={() => go(page)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
            <div className="font-semibold">{t}</div>
            <div className="mt-1 text-sm text-slate-500">{d}</div>
          </button>
        ))}
      </div>
    </>
  )
}
