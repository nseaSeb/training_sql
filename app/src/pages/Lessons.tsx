import type { ReactNode } from 'react'
import { PageHeader, H2, H3, P, Callout, C, Sql, Tag } from '../components/ui'
import { JoinGrid } from '../components/JoinGrid'
import { ExecOrder, SchemaDiagram, JoinViz, TruthTable, WindowViz, TimezoneViz, SafeFixSteps, DiagFlow } from '../components/viz'

const lessons = [
  { id: 'l-modele', title: 'Le modèle mental' },
  { id: 'l-schema', title: 'Lire un schéma' },
  { id: 'l-jointures', title: 'Jointures' },
  { id: 'l-null', title: 'NULL et logique à 3 valeurs' },
  { id: 'l-agreger', title: 'Agréger' },
  { id: 'l-cte', title: 'Sous-requêtes et CTE' },
  { id: 'l-fenetres', title: 'Fonctions de fenêtre' },
  { id: 'l-dates', title: 'Dates et fuseaux' },
  { id: 'l-corriger', title: 'Corriger sans risque' },
  { id: 'l-perf', title: 'Performance et EXPLAIN' },
  { id: 'l-methode', title: 'Méthode de diagnostic' },
]

function Lesson({ n, id, children }: { n: number; id: string; children: ReactNode }) {
  const title = lessons.find((l) => l.id === id)!.title
  return (
    <section className="border-b border-slate-200 pb-10 dark:border-slate-800">
      <H2 id={id}>
        <span className="mr-2 text-indigo-500">{String(n).padStart(2, '0')}</span>
        {title}
      </H2>
      {children}
    </section>
  )
}

function Tickets({ ids }: { ids: string[] }) {
  return (
    <p className="mt-4 text-sm text-slate-600 dark:text-slate-400">
      Pour pratiquer :{' '}
      {ids.map((t) => (
        <span key={t} className="mr-2">
          <Tag color="indigo">→ ticket {t}</Tag>
        </span>
      ))}
    </p>
  )
}

function Intuition({ children }: { children: ReactNode }) {
  return <p className="my-3 border-l-2 border-indigo-400 pl-4 text-lg leading-relaxed text-slate-700 italic dark:text-slate-300">{children}</p>
}

export default function Lessons() {
  return (
    <div className="lg:grid lg:grid-cols-[200px_1fr] lg:gap-10">
      <nav className="mb-6 lg:sticky lg:top-6 lg:mb-0 lg:self-start">
        <div className="mb-2 text-xs font-semibold tracking-wide text-slate-500 uppercase">Sommaire</div>
        <ol className="flex flex-wrap gap-1.5 lg:flex-col lg:gap-0.5">
          {lessons.map((l, i) => (
            <li key={l.id}>
              <a
                href={`#${l.id}`}
                onClick={(e) => {
                  e.preventDefault()
                  document.getElementById(l.id)?.scrollIntoView({ behavior: 'smooth' })
                }}
                className="block rounded-md px-2 py-1 text-sm text-slate-600 ring-1 ring-slate-200 hover:bg-indigo-50 hover:text-indigo-700 lg:ring-0 dark:text-slate-400 dark:ring-slate-800 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <span className="mr-1.5 font-mono text-xs text-slate-400">{i + 1}</span>
                {l.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="min-w-0 max-w-4xl">
        <PageHeader
          title="Cours : construire un modèle mental"
          subtitle="Onze leçons courtes. Chaque exemple s'exécute sur la base training_sql avec le bouton ▶ Exécuter. Lis l'intuition, joue avec le visuel, lance les requêtes, puis attaque le ticket associé."
        />

        {/* 1 ---------------------------------------------------------- */}
        <Lesson n={1} id="l-modele">
          <Intuition>
            Une requête n'est pas une phrase qu'on lit de gauche à droite : c'est un pipeline. Chaque clause prend une table en entrée et renvoie une table en sortie.
          </Intuition>
          <P>
            On écrit <C>SELECT … FROM … WHERE …</C>, mais Postgres évalue dans un autre ordre. Clique les étapes pour voir la table se transformer :
          </P>
          <ExecOrder />
          <H3>Ce que cet ordre explique</H3>
          <ul className="my-3 list-disc space-y-2 pl-6">
            <li>
              Un alias du <C>SELECT</C> n'existe pas encore dans le <C>WHERE</C> : <C>WHERE ca &gt; 100</C> échoue avec « column "ca" does not exist ». Il faut répéter
              l'expression, ou passer par une sous-requête ou une CTE.
            </li>
            <li>
              Un agrégat ne peut pas être dans le <C>WHERE</C> (les groupes n'existent pas encore) : c'est le rôle du <C>HAVING</C>.
            </li>
            <li>
              Une fonction de fenêtre (<C>row_number() OVER …</C>) est calculée pendant le <C>SELECT</C> : impossible de la filtrer dans le <C>WHERE</C>. On l'enveloppe
              dans une sous-requête puis on filtre dehors.
            </li>
            <li>
              <C>ORDER BY</C> vient après le <C>SELECT</C> : c'est le seul endroit où l'alias est utilisable.
            </li>
          </ul>
          <Sql
            title="La requête du visuel, sur les vraies données"
            code={`SELECT magasin_id, sum(total_ttc) AS ca
FROM tickets_caisse
WHERE statut = 'VALIDE'
GROUP BY magasin_id
HAVING sum(total_ttc) > 30
ORDER BY ca DESC
LIMIT 2;`}
          />
          <Sql
            title="Filtrer sur un rang : sous-requête obligatoire"
            code={`SELECT *
FROM (
  SELECT id, libelle, prix_ttc,
         row_number() OVER (ORDER BY prix_ttc DESC) AS rn
  FROM produits
) x
WHERE rn <= 5;`}
          />
          <Callout tone="warn" title="Piège">
            <C>WHERE ca &gt; 100</C> ou <C>WHERE row_number() OVER (…) = 1</C> : erreur. Pense « à quelle étape du pipeline cette colonne existe-t-elle ? ».
          </Callout>
          <Callout tone="tip" title="Réflexe pour écrire une requête">
            1. Quelle est la table de départ, et que vaut une ligne ? 2. Quelles lignes je garde ? 3. Une ligne de résultat = quoi (« une ligne par magasin ») ? 4. Quelles
            colonnes j'affiche ? 5. Dans quel ordre ?
          </Callout>
          <Tickets ids={['T01', 'T14']} />
        </Lesson>

        {/* 2 ---------------------------------------------------------- */}
        <Lesson n={2} id="l-schema">
          <Intuition>
            Avant toute requête, une seule question : « une ligne de cette table, c'est quoi ? ». C'est la granularité. Tous les bugs de comptage viennent d'un mélange de
            granularités.
          </Intuition>
          <SchemaDiagram />
          <P>
            Une relation <b>1 → N</b> veut dire : un ticket a plusieurs lignes, une ligne appartient à un seul ticket. Joindre du côté 1 vers le côté N multiplie les lignes
            du côté 1. Si tu sommes <C>total_ttc</C> (niveau ticket) après avoir joint <C>lignes_ticket</C> (niveau article), chaque total est compté autant de fois que le
            ticket a d'articles.
          </P>
          <Sql
            title="Découvrir une table sans psql (équivalent de \d)"
            code={`SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'retail' AND table_name = 'lignes_ticket'
ORDER BY ordinal_position;`}
          />
          <Sql
            title="Vérifier qu'une colonne est bien une clé (doit renvoyer 0 ligne)"
            code={`SELECT ean, count(*)
FROM produits
GROUP BY ean
HAVING count(*) > 1;`}
          />
          <Callout tone="warn" title="Piège">
            Le schéma dit ce qui est <i>autorisé</i>, pas ce qui est <i>vrai</i>. Ici <C>produits.ean</C> n'est pas UNIQUE et <C>lignes_ticket.ticket_id</C> n'a pas de clé
            étrangère : des doublons et des orphelins peuvent exister. Toujours vérifier par une requête.
          </Callout>
          <Callout tone="info" title="Dans psql">
            <C>\dt retail.*</C> liste les tables, <C>\d lignes_ticket</C> montre colonnes, index et contraintes.
          </Callout>
          <Tickets ids={['T05', 'T15']} />
        </Lesson>

        {/* 3 ---------------------------------------------------------- */}
        <Lesson n={3} id="l-jointures">
          <Intuition>
            Une jointure fabrique toutes les paires (ligne de gauche, ligne de droite) qui vérifient le ON. Trois choses peuvent arriver à une ligne : elle trouve un
            partenaire, elle n'en trouve pas (perdue ou complétée en NULL), ou elle en trouve plusieurs (dupliquée).
          </Intuition>
          <JoinViz />
          <H3>Un JOIN, c'est une double boucle (et l'auto-jointure n'a rien de spécial)</H3>
          <P>
            Pour Postgres, <C>a JOIN b ON condition</C> veut dire : « essaie toutes les combinaisons (une ligne de a, une ligne de b), garde celles où la condition est vraie ». Joindre une table avec elle-même (auto-jointure) suit exactement la même règle : a et b sont deux copies de la même table, et chaque ligne est comparée à toutes les autres. Coche les conditions pour voir les cases s'éteindre.
          </P>
          <JoinGrid />
          <Sql
            title="Le LEFT JOIN correct : filtres de la table de droite dans le ON"
            code={`SELECT p.id, p.libelle, coalesce(sum(l.qte), 0) AS qte_vendue
FROM produits p
LEFT JOIN lignes_ticket l ON l.produit_id = p.id
WHERE p.rayon = 'Frais'          -- filtre sur la table de GAUCHE : OK dans le WHERE
GROUP BY p.id, p.libelle
ORDER BY qte_vendue
LIMIT 10;`}
          />
          <Sql
            title="Détecter un fan-out : compter les lignes par clé après la jointure"
            code={`SELECT l.id AS ligne_id, count(*) AS nb_promos
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
JOIN prix_promos pp
  ON pp.produit_id = l.produit_id
 AND (pp.magasin_id = t.magasin_id OR pp.magasin_id IS NULL)
 AND t.date_ticket::date BETWEEN pp.debut AND pp.fin
GROUP BY l.id
HAVING count(*) > 1
LIMIT 10;`}
          />
          <Callout tone="warn" title="Pièges">
            <b>LEFT JOIN + condition sur la table de droite dans le WHERE</b> = INNER JOIN déguisé. <b>SUM trop gros</b> après une jointure = duplication : compare{' '}
            <C>count(*)</C> avant et après la jointure.
          </Callout>
          <Tickets ids={['T04', 'T10', 'T02']} />
        </Lesson>

        {/* 4 ---------------------------------------------------------- */}
        <Lesson n={4} id="l-null">
          <Intuition>NULL ne veut pas dire zéro ni vide : il veut dire « inconnu ». Et une comparaison avec un inconnu donne… inconnu.</Intuition>
          <TruthTable />
          <P>
            Conséquence directe : <C>WHERE col = NULL</C> ne trouve jamais rien (il faut <C>IS NULL</C>), et <C>x NOT IN (1, 2, NULL)</C> n'est jamais vrai, car Postgres
            ne peut pas exclure que x soit égal à l'inconnu.
          </P>
          <Sql
            title="count(*) compte les lignes, count(col) compte les valeurs non NULL"
            code={`SELECT count(*)             AS nb_lignes,
       count(produit_id)    AS avec_produit,
       count(*) - count(produit_id) AS sans_produit
FROM lignes_ticket;`}
          />
          <Sql
            title="Le piège NOT IN (T02) et sa correction"
            code={`-- 0 ligne : la sous-requête contient des NULL
SELECT count(*) FROM produits
WHERE id NOT IN (SELECT produit_id FROM lignes_ticket);

-- correct : NOT EXISTS ignore les NULL
SELECT count(*) FROM produits p
WHERE NOT EXISTS (SELECT 1 FROM lignes_ticket l WHERE l.produit_id = p.id);`}
          />
          <Sql
            title="Boîte à outils NULL"
            code={`SELECT coalesce(NULL, 'défaut')        AS coalesce_,      -- 1er non NULL
       nullif(0, 0)                    AS nullif_,        -- NULL si égaux (évite /0)
       100.0 / nullif(0, 0)            AS division_sure,  -- NULL au lieu d'une erreur
       NULL IS DISTINCT FROM NULL      AS distinct_;      -- égalité « qui comprend NULL »`}
          />
          <Callout tone="warn" title="Piège">
            Les agrégats (<C>sum</C>, <C>avg</C>, <C>count(col)</C>) ignorent les NULL. <C>sum</C> d'un ensemble vide renvoie NULL, pas 0 : entoure-le de{' '}
            <C>coalesce(…, 0)</C> dans un rapport.
          </Callout>
          <Tickets ids={['T02', 'T15', 'T11']} />
        </Lesson>

        {/* 5 ---------------------------------------------------------- */}
        <Lesson n={5} id="l-agreger">
          <Intuition>
            GROUP BY se traduit par « une ligne de résultat par … ». Tout ce que tu mets dans le GROUP BY définit la granularité de la sortie. Le reste doit être agrégé.
          </Intuition>
          <Sql
            title="Une ligne par magasin, avec agrégats conditionnels (FILTER)"
            code={`SELECT magasin_id,
       count(*)                                        AS nb_tickets,
       count(*) FILTER (WHERE statut = 'ANNULE')       AS nb_annules,
       sum(total_ttc) FILTER (WHERE statut = 'VALIDE') AS ca_valide,
       round(100.0 * count(*) FILTER (WHERE statut = 'ANNULE') / count(*), 2) AS pct_annules
FROM tickets_caisse
GROUP BY magasin_id
ORDER BY magasin_id;`}
          />
          <Sql
            title="HAVING : filtrer des groupes (T01)"
            code={`SELECT t.id, t.total_ttc,
       sum(l.qte * l.prix_unitaire_ttc - l.remise) AS total_recalcule
FROM tickets_caisse t
JOIN lignes_ticket l ON l.ticket_id = t.id
GROUP BY t.id
HAVING t.total_ttc <> sum(l.qte * l.prix_unitaire_ttc - l.remise)
LIMIT 10;`}
          />
          <Sql
            title="Agréger AVANT de joindre pour garder la bonne granularité"
            code={`WITH ventes AS (
  SELECT produit_id, sum(qte) AS qte_vendue
  FROM lignes_ticket
  GROUP BY produit_id            -- 1 ligne par produit
)
SELECT p.rayon, sum(v.qte_vendue) AS qte
FROM produits p
JOIN ventes v ON v.produit_id = p.id
GROUP BY p.rayon
ORDER BY qte DESC;`}
          />
          <Callout tone="warn" title="Piège">
            « column must appear in the GROUP BY clause or be used in an aggregate function » : tu affiches une colonne qui a plusieurs valeurs dans le groupe. Ajoute-la au
            GROUP BY (et accepte la nouvelle granularité) ou agrège-la. Exception utile : grouper par la clé primaire autorise les autres colonnes de la même table.
          </Callout>
          <Tickets ids={['T01', 'T08', 'T14']} />
        </Lesson>

        {/* 6 ---------------------------------------------------------- */}
        <Lesson n={6} id="l-cte">
          <Intuition>
            Une CTE (<C>WITH</C>), c'est une table temporaire avec un nom. Elle découpe un problème difficile en étapes qu'on peut tester une par une, comme des variables.
          </Intuition>
          <Sql
            title="Écart stock affiché / stock théorique par magasin (T07)"
            code={`WITH theorique AS (
  SELECT magasin_id, produit_id, sum(qte) AS qte_theo
  FROM mouvements_stock
  GROUP BY magasin_id, produit_id
)
SELECT s.magasin_id,
       count(*) FILTER (WHERE s.qte <> th.qte_theo) AS nb_en_ecart,
       max(s.maj_le) AS derniere_maj
FROM stocks s
JOIN theorique th USING (magasin_id, produit_id)
GROUP BY s.magasin_id
ORDER BY s.magasin_id;`}
          />
          <Sql
            title="EXISTS : « y a-t-il au moins un… ? » sans dupliquer"
            code={`SELECT m.code, m.nom
FROM magasins m
WHERE EXISTS (
  SELECT 1 FROM imports_log i
  WHERE i.magasin_id = m.id AND i.statut <> 'OK'
);`}
          />
          <Sql
            title="LATERAL : une sous-requête qui voit la ligne courante (top 1 par magasin)"
            code={`SELECT m.code, dernier.flux, dernier.debut, dernier.statut
FROM magasins m
CROSS JOIN LATERAL (
  SELECT flux, debut, statut
  FROM imports_log i
  WHERE i.magasin_id = m.id
  ORDER BY debut DESC
  LIMIT 1
) dernier;`}
          />
          <Callout tone="tip" title="Méthode">
            Construis une CTE, exécute <C>SELECT * FROM ma_cte</C>, vérifie le nombre de lignes, puis ajoute l'étape suivante. Jamais 40 lignes d'un coup.
          </Callout>
          <Callout tone="warn" title="Piège">
            Une sous-requête dans le <C>SELECT</C> doit renvoyer une seule valeur (« more than one row returned by a subquery »). Et <C>IN</C> / <C>EXISTS</C> ne
            dupliquent jamais, alors qu'un <C>JOIN</C> peut le faire.
          </Callout>
          <Tickets ids={['T07', 'T11', 'T12']} />
        </Lesson>

        {/* 7 ---------------------------------------------------------- */}
        <Lesson n={7} id="l-fenetres">
          <Intuition>
            Une fonction de fenêtre, c'est un GROUP BY qui ne supprime pas les lignes. Chaque ligne regarde son paquet (PARTITION BY) dans un certain ordre (ORDER BY) et y
            calcule quelque chose.
          </Intuition>
          <WindowViz />
          <Sql
            title="Top 3 par rayon (T14)"
            code={`SELECT rayon, rang, libelle, prix_ttc
FROM (
  SELECT rayon, libelle, prix_ttc,
         rank() OVER (PARTITION BY rayon ORDER BY prix_ttc DESC) AS rang
  FROM produits
) x
WHERE rang <= 3
ORDER BY rayon, rang;`}
          />
          <Sql
            title="lag : comparer à la ligne précédente"
            code={`WITH hebdo AS (
  SELECT magasin_id, date_trunc('week', date_ticket)::date AS semaine, sum(total_ttc) AS ca
  FROM tickets_caisse WHERE statut = 'VALIDE'
  GROUP BY 1, 2
)
SELECT magasin_id, semaine, ca,
       lag(ca) OVER w AS ca_prec,
       round(100.0 * (ca - lag(ca) OVER w) / nullif(lag(ca) OVER w, 0), 1) AS evol_pct
FROM hebdo
WINDOW w AS (PARTITION BY magasin_id ORDER BY semaine)
ORDER BY magasin_id, semaine;`}
          />
          <Sql
            title="DISTINCT ON : la dernière ligne par groupe (T08)"
            code={`SELECT DISTINCT ON (flux, magasin_id)
       flux, magasin_id, debut, statut, message
FROM imports_log
ORDER BY flux, magasin_id, debut DESC;`}
          />
          <div className="my-4 grid gap-2 text-sm sm:grid-cols-3">
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <C>row_number()</C> → 1, 2, 3, 4 <br />
              <span className="text-xs text-slate-500">départage les ex aequo arbitrairement</span>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <C>rank()</C> → 1, 2, 2, 4 <br />
              <span className="text-xs text-slate-500">ex aequo, puis saut</span>
            </div>
            <div className="rounded-lg bg-white p-3 ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-800">
              <C>dense_rank()</C> → 1, 2, 2, 3 <br />
              <span className="text-xs text-slate-500">ex aequo, sans saut</span>
            </div>
          </div>
          <Callout tone="warn" title="Piège">
            Avec <C>DISTINCT ON</C>, l'<C>ORDER BY</C> doit commencer par les mêmes colonnes que le <C>DISTINCT ON</C>. C'est la suite de l'ORDER BY (<C>debut DESC</C>)
            qui choisit la ligne gardée.
          </Callout>
          <Tickets ids={['T08', 'T14', 'T11']} />
        </Lesson>

        {/* 8 ---------------------------------------------------------- */}
        <Lesson n={8} id="l-dates">
          <Intuition>
            <C>timestamptz</C> stocke un instant absolu ; ce que tu vois dépend du fuseau de la session. Un « jour » n'existe que dans un fuseau donné : il faut toujours dire
            lequel.
          </Intuition>
          <TimezoneViz />
          <Sql
            title="Le même instant vu de deux fuseaux"
            code={`SELECT timestamptz '2026-10-15 01:30 Europe/Paris'                     AS instant,
       timestamptz '2026-10-15 01:30 Europe/Paris' AT TIME ZONE 'UTC'  AS heure_utc,
       (timestamptz '2026-10-15 01:30 Europe/Paris' AT TIME ZONE 'UTC')::date AS jour_utc,
       current_setting('timezone') AS fuseau_session;`}
          />
          <Sql
            title="Bornes demi-ouvertes : la journée du 15 octobre, heure de Paris"
            code={`SELECT count(*), sum(total_ttc)
FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99
  AND date_ticket >= timestamptz '2026-10-15 00:00 Europe/Paris'
  AND date_ticket <  timestamptz '2026-10-16 00:00 Europe/Paris';`}
          />
          <Sql
            title="generate_series : un calendrier complet, même les jours sans vente (T03)"
            code={`SELECT d::date AS jour, count(t.id) AS nb_tickets, coalesce(sum(t.total_ttc), 0) AS ca
FROM generate_series(date '2026-10-01', date '2026-10-10', interval '1 day') d
LEFT JOIN tickets_caisse t
       ON t.magasin_id = 4 AND t.statut = 'VALIDE'
      AND t.date_ticket >= d AND t.date_ticket < d + interval '1 day'
GROUP BY d
ORDER BY d;`}
          />
          <Callout tone="warn" title="Pièges">
            <C>BETWEEN '2026-10-01' AND '2026-10-31'</C> sur un timestamp s'arrête au 31 à 00:00 : toute la journée du 31 manque. Préfère <C>&gt;= début AND &lt; lendemain</C>.
            Et <C>date_ticket::date</C> dépend du fuseau de session : sois explicite avec <C>AT TIME ZONE 'Europe/Paris'</C>.
          </Callout>
          <Tickets ids={['T03', 'T09']} />
        </Lesson>

        {/* 9 ---------------------------------------------------------- */}
        <Lesson n={9} id="l-corriger">
          <Intuition>
            Une correction de données en production ne s'improvise pas : on la prouve avant de la faire. La transaction est ton filet de sécurité, le compteur ta preuve.
          </Intuition>
          <SafeFixSteps />
          <Sql
            title="Correction en transaction, annulée à la fin"
            code={`BEGIN;

SELECT count(*) AS a_corriger
FROM produits WHERE id > 400;                 -- 1. compter (ici 3)

UPDATE produits SET actif = false
WHERE id > 400
RETURNING id, ean, libelle, actif;            -- 2. « UPDATE 3 » attendu

SELECT count(*) FROM produits
WHERE id > 400 AND actif;                     -- 3. contrôle : 0

ROLLBACK;                                     -- 4. rien n'est modifié`}
          />
          <Callout tone="danger" title="Piège">
            Un <C>UPDATE</C> sans <C>WHERE</C> modifie toute la table. Écris toujours d'abord le <C>SELECT</C> avec le même WHERE, puis transforme-le en UPDATE. En
            production : sauvegarde des lignes touchées, validation écrite du demandeur, et trace de ce qui a été fait.
          </Callout>
          <Callout tone="info" title="Au support applicatif">
            Tu prépares et testes le script, tu le fais relire, et tu documentes : demande, requête, nombre de lignes, contrôle. Souvent, c'est l'équipe technique qui
            l'exécute en production.
          </Callout>
          <Tickets ids={['T05', 'T12']} />
        </Lesson>

        {/* 10 --------------------------------------------------------- */}
        <Lesson n={10} id="l-perf">
          <Intuition>
            <C>EXPLAIN</C> montre le plan : comment Postgres compte trouver les lignes. Lis-le de l'intérieur (les lignes les plus indentées) vers l'extérieur, et cherche
            où le temps et les lignes partent.
          </Intuition>
          <Sql
            title="Lire le plan de l'écran historique (T13)"
            code={`EXPLAIN (ANALYZE, BUFFERS)
SELECT t.date_ticket, t.magasin_id, l.qte
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE l.produit_id = 150
ORDER BY t.date_ticket DESC
LIMIT 50;`}
          />
          <div className="my-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500">
                  <th className="py-1 pr-4">Dans le plan</th>
                  <th className="py-1">Ce que ça veut dire</th>
                </tr>
              </thead>
              <tbody className="[&_td]:border-t [&_td]:border-slate-200 [&_td]:py-1.5 [&_td]:pr-4 dark:[&_td]:border-slate-800">
                <tr><td><C>Seq Scan</C> + gros <C>Rows Removed by Filter</C></td><td>Toute la table est lue pour garder peu de lignes : index manquant ?</td></tr>
                <tr><td><C>Index Scan</C> / <C>Bitmap Index Scan</C></td><td>Un index est utilisé.</td></tr>
                <tr><td><C>rows=</C> estimé très différent de <C>actual rows</C></td><td>Statistiques périmées : <C>ANALYZE table</C>.</td></tr>
                <tr><td><C>Sort Method: external merge</C></td><td>Tri sur disque (mémoire de travail insuffisante).</td></tr>
                <tr><td><C>Nested Loop</C> avec <C>loops</C> élevé</td><td>Jointure mal estimée, répétée des milliers de fois.</td></tr>
              </tbody>
            </table>
          </div>
          <Sql
            title="Tester un index sans rien casser"
            code={`BEGIN;
CREATE INDEX idx_lignes_produit ON lignes_ticket (produit_id);
EXPLAIN (ANALYZE, BUFFERS)
SELECT t.date_ticket, l.qte
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE l.produit_id = 150
ORDER BY t.date_ticket DESC LIMIT 50;
ROLLBACK;`}
          />
          <Sql
            title="Qui tourne en ce moment ?"
            code={`SELECT pid, usename, state, now() - query_start AS duree, wait_event_type, left(query, 60) AS requete
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY duree DESC;`}
          />
          <Callout tone="warn" title="Piège">
            <C>EXPLAIN ANALYZE</C> <b>exécute</b> réellement la requête. Sur un UPDATE ou un DELETE, encadre-le par <C>BEGIN; … ROLLBACK;</C>. Et en production, on ne crée
            pas un index soi-même : on transmet le plan avant/après à l'équipe technique (qui utilisera <C>CREATE INDEX CONCURRENTLY</C>).
          </Callout>
          <Tickets ids={['T13']} />
        </Lesson>

        {/* 11 --------------------------------------------------------- */}
        <Lesson n={11} id="l-methode">
          <Intuition>
            Face à un ticket, l'anxiété vient de l'absence de méthode. Avec une checklist, on ne cherche plus « la bonne requête » : on élimine des hypothèses, une par une.
          </Intuition>
          <DiagFlow />
          <Sql
            title="Étape « compter » : le compte change-t-il après chaque jointure ?"
            code={`SELECT 'lignes seules'        AS etape, count(*) FROM lignes_ticket
UNION ALL
SELECT '+ tickets',  count(*) FROM lignes_ticket l JOIN tickets_caisse t ON t.id = l.ticket_id
UNION ALL
SELECT '+ produits', count(*) FROM lignes_ticket l
                       JOIN tickets_caisse t ON t.id = l.ticket_id
                       JOIN produits p ON p.id = l.produit_id;`}
          />
          <H3>Tableau des symptômes</H3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody className="[&_td]:border-t [&_td]:border-slate-200 [&_td]:py-1.5 [&_td]:pr-4 dark:[&_td]:border-slate-800">
                <tr><td>NOT IN renvoie 0 ligne</td><td>NULL dans la sous-requête</td><td><C>NOT EXISTS</C></td></tr>
                <tr><td>LEFT JOIN qui perd des lignes</td><td>condition sur la droite dans le WHERE</td><td>la mettre dans le ON</td></tr>
                <tr><td>SUM trop gros</td><td>fan-out 1-N</td><td>EXISTS, agréger avant</td></tr>
                <tr><td>Chiffres d'un jour décalés</td><td>découpage en UTC</td><td><C>AT TIME ZONE</C>, bornes</td></tr>
                <tr><td>Division qui donne 0</td><td>division entière</td><td><C>100.0 * a / b</C></td></tr>
                <tr><td>Jours manquants</td><td>pas de ventes ces jours-là</td><td><C>generate_series</C> + LEFT JOIN</td></tr>
                <tr><td>Doublons « invisibles »</td><td>casse, espaces</td><td><C>lower(trim(x))</C></td></tr>
              </tbody>
            </table>
          </div>
          <Callout tone="tip" title="La réponse à l'utilisateur, en 4 points">
            <b>Cause</b> en une phrase, sans jargon. <b>Impact chiffré</b> (combien de tickets, quel montant, depuis quand). <b>Ce qui est fait</b> ou proposé. <b>Ce qui est
            remonté</b> à l'équipe technique pour éviter la récidive (contrainte, correctif, relance du flux).
          </Callout>
          <Tickets ids={['T01', 'T07', 'T08']} />
        </Lesson>
      </div>
    </div>
  )
}
