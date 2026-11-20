import { patterns, worked } from '../content/method'
import { JoinGrid } from '../components/JoinGrid'
import { Callout, Card, H2, PageHeader, Sql, Tag } from '../components/ui'

const routine = [
  ['Reformuler en français', 'Une phrase simple, sans SQL : « je veux, pour chaque …, le/les … ». Si je n’arrive pas à l’écrire, je repose une question à l’utilisateur.'],
  ['Dire ce qu’est une ligne du résultat', '« Une ligne = un jour / une paire de promos / un produit classé ». C’est la boussole : elle donne le GROUP BY et le nombre de lignes attendu.'],
  ['Reconnaître le pattern', 'Repérer les mots-clés de la phrase (« dernier », « jamais », « paire », « même vides »…) et les traduire avec le tableau ci-dessous.'],
  ['Partir des données brutes', 'SELECT * … LIMIT 20 sur chaque table utile. On ne construit pas sur ce qu’on imagine, on construit sur ce qu’on voit.'],
  ['Construire par couches', 'Une seule chose ajoutée à la fois (une jointure, une condition, un calcul), exécutée à chaque fois. Une requête complexe n’est jamais écrite d’un coup : elle grandit.'],
  ['Vérifier à chaque couche', 'Le nombre de lignes est-il celui attendu ? Un cas connu, vérifié à la main, est-il correct ? Les NULL et les dates sont-ils traités ?'],
  ['Nettoyer et nommer', 'Une fois juste : CTE avec des noms parlants, alias clairs, commentaires sur les règles métier. C’est ce qui sera relu.'],
]

export default function Method() {
  return (
    <>
      <PageHeader
        title="Construire une requête"
        subtitle="Comprendre une requête toute faite et en écrire une sont deux compétences différentes. La seconde ne demande pas d'inspiration, elle demande une méthode : on ne cherche jamais la requête finale, on la fait grandir par petites étapes vérifiées."
      />

      <Callout tone="tip" title="Le mindset anti-panique">
        Personne n'écrit une auto-jointure avec chevauchement de périodes d'un seul jet, même avec 10 ans d'expérience. Les gens qui ont l'air rapides font exactement ce qui suit, simplement plus vite et dans leur tête.
        Face à une question qui paraît difficile, l'objectif n'est pas « trouver la requête », c'est <strong>« écrire la prochaine petite requête qui m'apprend quelque chose »</strong>. Chaque étape exécutée est un progrès visible, et le stress baisse dès qu'on a un premier résultat à l'écran.
        Face à un utilisateur ou à un collègue, penser à voix haute (« je regarde d'abord la table, puis je compte… ») est une force : ça montre la méthode, qui compte plus que la vitesse.
      </Callout>

      <H2 id="routine">La routine en 7 étapes</H2>
      <ol className="grid gap-3 md:grid-cols-2">
        {routine.map(([t, d], i) => (
          <li key={t} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-sm font-bold text-white">{i + 1}</span>
            <div>
              <div className="font-semibold">{t}</div>
              <div className="mt-1 text-sm text-slate-600 dark:text-slate-400">{d}</div>
            </div>
          </li>
        ))}
      </ol>

      <H2 id="patterns">Traduire la phrase métier en SQL</H2>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-400">La plupart des questions de support se ramènent à une douzaine de formes. Repérer la forme, c'est avoir déjà le squelette.</p>
      <div className="space-y-2">
        {patterns.map((p) => (
          <details key={p.phrase} className="group rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
              <span className="text-xs text-slate-400 transition-transform group-open:rotate-90">▸</span>
              <span className="min-w-[14rem] flex-1 text-sm font-medium">{p.phrase}</span>
              <span className="flex-1 font-mono text-[12.5px] text-indigo-700 dark:text-indigo-300">{p.brique}</span>
              <span className="text-xs text-slate-500">{p.tickets}</span>
            </summary>
            <div className="border-t border-slate-100 px-4 pt-3 pb-1 dark:border-slate-800">
              <p className="text-sm"><span className="font-semibold text-slate-500">Exemple de demande :</span> <em>{p.demande}</em></p>
              <Sql code={p.sql} />
            </div>
          </details>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">Clique sur une ligne pour voir un exemple exécutable, sur d'autres tables que celles des tickets.</p>

      <H2 id="exemples">Exemples construits pas à pas</H2>
      <div className="mb-4 flex flex-wrap gap-2">
        {worked.map((w) => (
          <a key={w.id} href={`#methode/${w.id}`} className="rounded-full bg-slate-200 px-3 py-1 text-xs font-medium hover:bg-indigo-100 dark:bg-slate-800 dark:hover:bg-indigo-950">{w.title}</a>
        ))}
      </div>
      {worked.map((w) => (
        <section key={w.id} id={w.id} className="mb-12 scroll-mt-6">
          <h3 className="text-xl font-bold text-slate-900 dark:text-white">{w.title}</h3>
          <Card className="mt-3">
            <dl className="grid gap-2 text-sm md:grid-cols-[150px_1fr]">
              <dt className="font-semibold text-slate-500">La demande</dt><dd className="italic">{w.question}</dd>
              <dt className="font-semibold text-slate-500">Reformulée</dt><dd>{w.phrase}</dd>
              <dt className="font-semibold text-slate-500">Une ligne =</dt><dd><Tag color="indigo">{w.grain}</Tag></dd>
              <dt className="font-semibold text-slate-500">Pattern</dt><dd>{w.pattern}</dd>
            </dl>
          </Card>
          <ol className="mt-4 space-y-4 border-l-2 border-indigo-200 pl-5 dark:border-indigo-900">
            {w.steps.map((s) => (
              <li key={s.title} className="relative">
                <span className="absolute top-1.5 -left-[27px] h-3 w-3 rounded-full bg-indigo-500 ring-4 ring-slate-50 dark:ring-slate-950" />
                <div className="font-semibold">{s.title}</div>
                <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">🧠 {s.think}</p>
                {s.sql && <Sql code={s.sql} />}
                <p className="text-sm text-emerald-700 dark:text-emerald-400">✓ {s.check}</p>
              </li>
            ))}
          </ol>
          {w.id === 'm-promos' && <JoinGrid />}
        </section>
      ))}

      <Callout tone="info" title="Pour t'entraîner">
        Prends un ticket non résolu, et avant d'écrire du SQL, remplis sur papier les 4 lignes du cadre : la demande, reformulée, une ligne =, pattern. Puis ouvre le playground (⌘/Ctrl + I pour le schéma) et ne fais que l'étape 1. Ensuite l'étape 2. C'est tout.
      </Callout>
    </>
  )
}
