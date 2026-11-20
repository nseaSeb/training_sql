import { PageHeader, Card, Callout, Tag, Sql } from '../components/ui'
import { useStored } from '../lib/storage'
import { useNav } from '../lib/nav'

/** lesson vide : pas de leçon dédiée, on renvoie vers le lexique */
type Theme = { id: string; label: string; lesson: string }
const themes: Theme[] = [
  { id: 'modele', label: 'Modèle mental', lesson: 'l-modele' },
  { id: 'schema', label: 'Schéma et granularité', lesson: 'l-schema' },
  { id: 'jointures', label: 'Jointures', lesson: 'l-jointures' },
  { id: 'null', label: 'NULL', lesson: 'l-null' },
  { id: 'agreger', label: 'Agrégation', lesson: 'l-agreger' },
  { id: 'cte', label: 'Sous-requêtes et CTE', lesson: 'l-cte' },
  { id: 'fenetres', label: 'Fenêtres', lesson: 'l-fenetres' },
  { id: 'dates', label: 'Dates et fuseaux', lesson: 'l-dates' },
  { id: 'corriger', label: 'Corriger sans risque', lesson: 'l-corriger' },
  { id: 'perf', label: 'Performance', lesson: 'l-perf' },
  { id: 'methode', label: 'Méthode', lesson: 'l-methode' },
  { id: 'json', label: 'JSON', lesson: '' },
]

type Kind = 'qcm' | 'output' | 'bug'
type Question = { id: string; theme: string; kind: Kind; q: string; sql?: string; choices: string[]; answer: number; why: string }

const questions: Question[] = [
  // Modèle mental
  {
    id: 'q1', theme: 'modele', kind: 'qcm',
    q: "Dans quel ordre logique Postgres évalue-t-il ces clauses ?",
    choices: ['SELECT → FROM → WHERE → GROUP BY', 'FROM → WHERE → GROUP BY → HAVING → SELECT → ORDER BY', 'FROM → SELECT → WHERE → ORDER BY', 'WHERE → FROM → GROUP BY → SELECT'],
    answer: 1,
    why: "FROM/JOIN d'abord (la table de départ), puis WHERE (lignes), GROUP BY, HAVING (groupes), SELECT (colonnes, alias), DISTINCT, ORDER BY, LIMIT.",
  },
  {
    id: 'q2', theme: 'modele', kind: 'bug',
    q: 'Cette requête échoue. Pourquoi ?',
    sql: `SELECT magasin_id, sum(total_ttc) AS ca
FROM tickets_caisse
WHERE ca > 100000
GROUP BY magasin_id;`,
    choices: ["L'alias ca n'existe pas encore au moment du WHERE, et un agrégat se filtre dans HAVING", 'Il manque ORDER BY', 'sum() ne marche pas sur numeric', 'Il faut écrire GROUP BY 1'],
    answer: 0,
    why: 'WHERE est évalué avant GROUP BY et SELECT. Correction : HAVING sum(total_ttc) > 100000.',
  },
  {
    id: 'q3', theme: 'modele', kind: 'qcm',
    q: 'Comment garder seulement la ligne n°1 calculée par row_number() OVER (…) ?',
    choices: ['WHERE row_number() OVER (…) = 1', 'HAVING row_number() = 1', 'Calculer row_number() dans une sous-requête ou une CTE, puis filtrer WHERE rn = 1 dehors', 'LIMIT 1 suffit toujours'],
    answer: 2,
    why: "Les fonctions de fenêtre sont calculées pendant le SELECT, après WHERE et HAVING. On les filtre donc à l'étage au-dessus.",
  },
  // Schéma
  {
    id: 'q4', theme: 'schema', kind: 'qcm',
    q: 'Tu sommes tickets_caisse.total_ttc après un JOIN sur lignes_ticket. Le CA est trop gros. Pourquoi ?',
    choices: ['Les remises ne sont pas déduites', 'Chaque ticket est répété autant de fois qu\'il a de lignes : on somme un montant de niveau ticket à la granularité ligne', 'Les tickets annulés sont comptés', 'Le fuseau horaire'],
    answer: 1,
    why: "Relation 1-N : joindre vers le côté N multiplie le côté 1. Somme total_ttc sans la jointure, ou somme les lignes (qte × prix − remise).",
  },
  {
    id: 'q5', theme: 'schema', kind: 'output',
    q: 'Combien de lignes renvoie cette requête sur training_sql ?',
    sql: `SELECT ean, count(*)
FROM produits
GROUP BY ean
HAVING count(*) > 1;`,
    choices: ['0 : un EAN est unique', '1', '3', '403'],
    answer: 2,
    why: "produits.ean n'a pas de contrainte UNIQUE, et une reprise du 10/10 a recréé 3 fiches avec le même EAN (ticket T05).",
  },
  {
    id: 'q6', theme: 'schema', kind: 'qcm',
    q: "lignes_ticket.ticket_id n'a pas de clé étrangère. Conséquence ?",
    choices: ["Aucune, c'est juste de la documentation", 'Des lignes peuvent pointer vers un ticket inexistant : il faut le vérifier par une anti-jointure', 'Les jointures sont impossibles', 'Les index sont désactivés'],
    answer: 1,
    why: "Sans FK, la base n'empêche pas les orphelins. C'est la même cause que les produits inexistants du ticket T15.",
  },
  // Jointures
  {
    id: 'q7', theme: 'jointures', kind: 'bug',
    q: 'Le chef de rayon veut aussi les produits à zéro, mais ils disparaissent. Où est le bug ?',
    sql: `SELECT p.id, coalesce(sum(l.qte), 0)
FROM produits p
LEFT JOIN lignes_ticket l  ON l.produit_id = p.id
LEFT JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE p.rayon = 'Frais'
  AND t.date_ticket >= '2026-10-01'
GROUP BY p.id;`,
    choices: ['coalesce est mal placé', 'La condition sur t (table de droite) dans le WHERE élimine les lignes NULL : le LEFT JOIN devient INNER', 'Il faut un RIGHT JOIN', 'p.rayon devrait être dans le ON'],
    answer: 1,
    why: "Pour un produit jamais vendu, t.date_ticket est NULL ; NULL >= date n'est pas TRUE. La condition sur t doit aller dans le ON, ou dans une sous-requête jointe (T04).",
  },
  {
    id: 'q8', theme: 'jointures', kind: 'qcm',
    q: 'Après un JOIN sur prix_promos, sum(qte) double sur certains produits. Quel est le meilleur premier diagnostic ?',
    choices: ['Relancer la requête', 'GROUP BY l.id HAVING count(*) > 1 pour voir les lignes dupliquées par la jointure', 'Ajouter DISTINCT dans le SELECT', 'Passer en LEFT JOIN'],
    answer: 1,
    why: "C'est un fan-out : une ligne matche plusieurs promos. On le prouve en comptant par clé. DISTINCT masquerait le problème sans le comprendre (et peut fusionner des lignes légitimes).",
  },
  {
    id: 'q9', theme: 'jointures', kind: 'qcm',
    q: 'Quelle écriture liste les produits jamais vendus ?',
    choices: ['FROM produits p JOIN lignes_ticket l ON l.produit_id = p.id WHERE l.id IS NULL', 'FROM produits p LEFT JOIN lignes_ticket l ON l.produit_id = p.id WHERE l.id IS NULL', 'FROM produits p LEFT JOIN lignes_ticket l ON l.produit_id = p.id AND l.id IS NULL', 'FROM produits p WHERE p.id <> ALL (SELECT produit_id FROM lignes_ticket)'],
    answer: 1,
    why: "C'est l'anti-jointure : LEFT JOIN, puis on garde les lignes où la droite est restée NULL. La C garde tous les produits. La D a le même piège NULL que NOT IN.",
  },
  // NULL
  {
    id: 'q10', theme: 'null', kind: 'output',
    q: 'Que renvoie cette requête sur training_sql ?',
    sql: `SELECT count(*) FROM produits
WHERE id NOT IN (SELECT produit_id FROM lignes_ticket);`,
    choices: ['20 (les nouveautés)', '0', '403', 'Une erreur'],
    answer: 1,
    why: "lignes_ticket.produit_id contient des NULL. x NOT IN (…, NULL) vaut NULL, jamais TRUE, donc 0 ligne. Avec NOT EXISTS, on en trouve bien 20 (T02).",
  },
  {
    id: 'q11', theme: 'null', kind: 'output',
    q: 'Que renvoie cette requête ?',
    sql: `SELECT count(*), count(x), sum(x)
FROM (VALUES (1), (NULL), (3)) v(x);`,
    choices: ['3 | 3 | 4', '3 | 2 | 4', '2 | 2 | 4', '3 | 2 | NULL'],
    answer: 1,
    why: 'count(*) compte les lignes (3). count(x) et sum(x) ignorent les NULL (2 valeurs, somme 4).',
  },
  {
    id: 'q12', theme: 'null', kind: 'qcm',
    q: 'Comment trouver les clients sans email ?',
    choices: ["WHERE email = NULL", "WHERE email = ''", 'WHERE email IS NULL', 'WHERE NOT email'],
    answer: 2,
    why: "= NULL vaut toujours NULL, donc 0 ligne. Il faut IS NULL. (Une chaîne vide '' est une valeur, différente de NULL.)",
  },
  {
    id: 'q13', theme: 'null', kind: 'qcm',
    q: "Comment éviter « division by zero » dans 100.0 * rejets / lignes ?",
    choices: ['100.0 * rejets / nullif(lignes, 0)', 'coalesce(lignes, 0)', 'CAST(lignes AS numeric)', 'WHERE lignes IS NOT NULL'],
    answer: 0,
    why: 'nullif(lignes, 0) renvoie NULL si lignes = 0, et une division par NULL donne NULL au lieu de lever une erreur.',
  },
  // Agrégation
  {
    id: 'q14', theme: 'agreger', kind: 'bug',
    q: 'Erreur « column p.libelle must appear in the GROUP BY clause ». Pourquoi ?',
    sql: `SELECT p.rayon, p.libelle, sum(l.qte)
FROM lignes_ticket l
JOIN produits p ON p.id = l.produit_id
GROUP BY p.rayon;`,
    choices: ['sum ne marche pas avec un JOIN', 'Une ligne par rayon, mais plusieurs libellés par rayon : Postgres ne sait pas lequel afficher', 'Il manque un alias', 'Il faut HAVING'],
    answer: 1,
    why: 'Chaque colonne du SELECT doit être dans le GROUP BY ou agrégée. Ajoute p.libelle au GROUP BY (une ligne par produit) ou retire-le.',
  },
  {
    id: 'q15', theme: 'agreger', kind: 'qcm',
    q: 'Quelle syntaxe calcule le nombre de tickets annulés et le total en une seule passe ?',
    choices: ["count(*) WHERE statut = 'ANNULE'", "count(*) FILTER (WHERE statut = 'ANNULE'), count(*)", "count(statut = 'ANNULE')", 'Deux requêtes obligatoires'],
    answer: 1,
    why: "FILTER restreint un agrégat sans toucher aux autres. Attention : count(statut = 'ANNULE') compte aussi les FALSE (seuls les NULL sont ignorés).",
  },
  {
    id: 'q16', theme: 'agreger', kind: 'qcm',
    q: "WHERE ou HAVING : « les magasins qui ont plus de 5000 tickets validés » ?",
    choices: ["WHERE statut = 'VALIDE' AND count(*) > 5000", "WHERE statut = 'VALIDE' … GROUP BY magasin_id HAVING count(*) > 5000", "HAVING statut = 'VALIDE' AND count(*) > 5000", 'GROUP BY magasin_id WHERE count(*) > 5000'],
    answer: 1,
    why: 'Filtre sur les lignes dans le WHERE (avant regroupement), filtre sur les agrégats dans le HAVING (après).',
  },
  // CTE
  {
    id: 'q17', theme: 'cte', kind: 'qcm',
    q: 'Quel est le principal intérêt d\'une CTE (WITH) au support ?',
    choices: ['Elle est toujours plus rapide', 'Découper un diagnostic en étapes nommées, testables une par une', 'Elle crée une table permanente', 'Elle remplace les index'],
    answer: 1,
    why: 'On construit et vérifie chaque étape (SELECT * FROM etape) avant de passer à la suivante. Lisible pour le collègue qui reprend le ticket.',
  },
  {
    id: 'q18', theme: 'cte', kind: 'qcm',
    q: "Pour « les lignes de vente qui tombent dans au moins une promo », pourquoi EXISTS plutôt que JOIN ?",
    choices: ['EXISTS est plus récent', 'EXISTS teste la présence sans dupliquer la ligne si plusieurs promos matchent', 'JOIN ne sait pas comparer des dates', 'Aucune différence'],
    answer: 1,
    why: "Un JOIN renvoie une ligne par promo trouvée (fan-out). EXISTS répond juste oui ou non : chaque ligne de vente est comptée une seule fois (T10).",
  },
  {
    id: 'q19', theme: 'cte', kind: 'bug',
    q: "Erreur « more than one row returned by a subquery used as an expression ». Cause ?",
    sql: `SELECT m.code,
       (SELECT statut FROM imports_log i WHERE i.magasin_id = m.id) AS statut
FROM magasins m;`,
    choices: ['m.code est NULL', 'La sous-requête du SELECT renvoie plusieurs lignes par magasin ; il faut ORDER BY debut DESC LIMIT 1, ou LATERAL', 'imports_log est vide', 'Il faut un GROUP BY'],
    answer: 1,
    why: "Une sous-requête scalaire doit renvoyer au plus une valeur. Chaque magasin a des centaines de passages de flux.",
  },
  // Fenêtres
  {
    id: 'q20', theme: 'fenetres', kind: 'output',
    q: 'Valeurs 10, 8, 8, 5 triées décroissant : que donne rank() ?',
    sql: `SELECT x, rank() OVER (ORDER BY x DESC)
FROM (VALUES (10), (8), (8), (5)) v(x);`,
    choices: ['1, 2, 3, 4', '1, 2, 2, 3', '1, 2, 2, 4', '1, 1, 2, 3'],
    answer: 2,
    why: 'rank() met les ex aequo au même rang puis saute (1, 2, 2, 4). dense_rank() ne saute pas (1, 2, 2, 3). row_number() départage (1, 2, 3, 4).',
  },
  {
    id: 'q21', theme: 'fenetres', kind: 'qcm',
    q: 'Différence fondamentale entre GROUP BY et OVER (PARTITION BY …) ?',
    choices: ['Aucune', 'GROUP BY écrase chaque groupe en une ligne ; OVER garde toutes les lignes et ajoute une colonne calculée sur le groupe', 'OVER est plus lent', 'PARTITION BY trie les lignes'],
    answer: 1,
    why: "C'est tout le principe des fenêtres : agréger sans perdre le détail (part d'un produit dans son rayon, rang, cumul…).",
  },
  {
    id: 'q22', theme: 'fenetres', kind: 'qcm',
    q: "Pour avoir le DERNIER passage de chaque flux par magasin avec DISTINCT ON (flux, magasin_id), quel ORDER BY ?",
    choices: ['ORDER BY debut DESC', 'ORDER BY flux, magasin_id, debut DESC', 'ORDER BY flux, magasin_id, debut', 'Pas besoin d\'ORDER BY'],
    answer: 1,
    why: "L'ORDER BY doit commencer par les colonnes du DISTINCT ON ; la suite (debut DESC) décide quelle ligne de chaque groupe est gardée : la plus récente.",
  },
  {
    id: 'q23', theme: 'fenetres', kind: 'qcm',
    q: "Quelle fonction donne le CA de la semaine précédente sur la même ligne ?",
    choices: ['lead(ca) OVER (ORDER BY semaine)', 'lag(ca) OVER (PARTITION BY magasin_id ORDER BY semaine)', 'first_value(ca)', 'sum(ca) OVER ()'],
    answer: 1,
    why: 'lag regarde la ligne précédente dans la partition. PARTITION BY magasin_id évite de comparer avec la semaine d\'un autre magasin.',
  },
  // Dates
  {
    id: 'q24', theme: 'dates', kind: 'output',
    q: "Que renvoie cette expression ?",
    sql: `SELECT (timestamptz '2026-10-15 01:30 Europe/Paris' AT TIME ZONE 'UTC')::date;`,
    choices: ['2026-10-15', '2026-10-14', '2026-10-16', 'Une erreur'],
    answer: 1,
    why: "01h30 à Paris (UTC+2 en octobre) = 23h30 UTC la veille. C'est exactement le bug du rapport de la station-service (T09).",
  },
  {
    id: 'q25', theme: 'dates', kind: 'bug',
    q: 'Le CA d\'octobre semble trop faible. Pourquoi ?',
    sql: `SELECT sum(total_ttc) FROM tickets_caisse
WHERE date_ticket BETWEEN '2026-10-01' AND '2026-10-31';`,
    choices: ["BETWEEN est exclusif", "'2026-10-31' vaut le 31 à 00:00 : toute la journée du 31 est exclue. Utiliser >= '2026-10-01' AND < '2026-11-01'", 'Il faut un GROUP BY', 'sum ignore octobre'],
    answer: 1,
    why: 'Sur un timestamp, une date seule signifie minuit. Les bornes demi-ouvertes (>= début, < lendemain) sont toujours justes et utilisent les index.',
  },
  {
    id: 'q26', theme: 'dates', kind: 'output',
    q: 'Combien de lignes produit ce calendrier ?',
    sql: `SELECT count(*)
FROM generate_series(date '2026-10-01', date '2026-10-24', interval '1 day');`,
    choices: ['23', '24', '25', '31'],
    answer: 1,
    why: 'generate_series inclut les deux bornes : du 1er au 24 inclus = 24 jours. On y accroche les ventes avec un LEFT JOIN pour avoir les jours à zéro (T03).',
  },
  // Corriger
  {
    id: 'q27', theme: 'corriger', kind: 'qcm',
    q: 'Bon ordre pour corriger des données ?',
    choices: ['UPDATE puis vérifier', 'BEGIN → compter les lignes visées → UPDATE (le nombre doit correspondre) → contrôler → COMMIT ou ROLLBACK', 'COMMIT → UPDATE', 'DELETE puis INSERT'],
    answer: 1,
    why: 'Le compte avant/après est la preuve que le WHERE vise exactement ce qu\'on croit. En prod, on ajoute une sauvegarde des lignes et une validation écrite.',
  },
  {
    id: 'q28', theme: 'corriger', kind: 'qcm',
    q: 'À quoi sert RETURNING * sur un UPDATE ?',
    choices: ['Annuler la modification', 'Afficher les lignes modifiées, pour contrôle et trace', 'Accélérer la requête', 'Rendre la modification permanente'],
    answer: 1,
    why: 'RETURNING renvoie les lignes après modification : on voit exactement ce qui a bougé et on peut le joindre au ticket.',
  },
  // Perf
  {
    id: 'q29', theme: 'perf', kind: 'qcm',
    q: "Dans EXPLAIN ANALYZE : « Seq Scan on lignes_ticket … Rows Removed by Filter: 73000 ». Lecture ?",
    choices: ['Tout va bien', 'Toute la table est lue pour garder peu de lignes : un index sur la colonne filtrée manque probablement', 'La table est corrompue', 'Il faut un VACUUM FULL'],
    answer: 1,
    why: "Un Seq Scan qui jette presque tout est le signe d'un index manquant (T13). On propose l'index à l'équipe technique avec le plan avant/après.",
  },
  {
    id: 'q30', theme: 'perf', kind: 'qcm',
    q: 'Quel danger avec EXPLAIN ANALYZE sur un DELETE ?',
    choices: ['Aucun, EXPLAIN ne fait que planifier', 'ANALYZE exécute réellement la requête : les lignes sont supprimées. À encadrer par BEGIN … ROLLBACK', 'Il verrouille la base', 'Il recalcule les statistiques'],
    answer: 1,
    why: 'EXPLAIN seul estime ; EXPLAIN ANALYZE exécute pour mesurer.',
  },
  // Méthode
  {
    id: 'q31', theme: 'methode', kind: 'qcm',
    q: "Un utilisateur dit « le rapport est faux ». Première action ?",
    choices: ['Réécrire la requête', 'Reproduire : rejouer la même requête avec les mêmes paramètres et noter le résultat attendu par l\'utilisateur', 'Escalader directement à la MOE', 'Redémarrer le serveur'],
    answer: 1,
    why: "Sans reproduction, on ne sait pas ce qu'on corrige. Ensuite : réduire, compter, vérifier NULL et dates, répondre.",
  },
  {
    id: 'q32', theme: 'methode', kind: 'qcm',
    q: "Le flux STOCKS de Périgueux est en erreur depuis 3 nuits. Que transmets-tu à l'équipe technique ?",
    choices: ['« Ça marche pas »', 'Les fichiers concernés, le message d\'erreur exact, la donnée en cause (doublon 3/57), depuis quand, et l\'impact métier (réassort bloqué)', 'Une capture de l\'écran stock', 'Rien, on relance le flux'],
    answer: 1,
    why: "Un ticket d'escalade doit permettre d'agir sans te rappeler : quoi, depuis quand, preuve, impact, ce que tu as déjà vérifié (T07).",
  },
  // Dates (compléments)
  {
    id: 'q33', theme: 'dates', kind: 'qcm',
    q: "SET lc_time = 'fr_FR.UTF-8' renvoie « invalid value for parameter \"lc_time\" ». Pourquoi ?",
    choices: ["La syntaxe correcte est SET lc_time TO fr", "La locale fr_FR n'est pas installée sur le système du serveur : TMDay ne pourra pas traduire", "Il faut être superutilisateur", "lc_time n'existe plus depuis PostgreSQL 16"],
    answer: 1,
    why: "lc_time doit nommer une locale du système d'exploitation du serveur. L'image Docker officielle n'a que en_US. Solution portable : (ARRAY['lundi', …])[extract(isodow FROM d)].",
  },
  {
    id: 'q34', theme: 'dates', kind: 'output',
    q: 'Que renvoie cette requête ?',
    sql: `SELECT to_char(date '2026-10-15', 'Day') || '|';`,
    choices: ['Thursday|', 'Thursday |', 'jeudi|', '4|'],
    answer: 1,
    why: "Day complète le nom à 9 caractères avec des espaces. FMDay enlève ce remplissage : 'Thursday|'.",
  },
  {
    id: 'q35', theme: 'dates', kind: 'qcm',
    q: "Quel est l'équivalent PostgreSQL de ISDATE('2026-02-31') de SQL Server ?",
    choices: ["isdate('2026-02-31')", "'2026-02-31'::date IS NOT NULL", "pg_input_is_valid('2026-02-31', 'date')", "to_date('2026-02-31') <> NULL"],
    answer: 2,
    why: "pg_input_is_valid (PostgreSQL 16+) renvoie true / false sans lever d'erreur. Le cast ::date, lui, échoue avec une erreur sur une date invalide.",
  },
  {
    id: 'q36', theme: 'dates', kind: 'output',
    q: 'Que renvoie cette requête ?',
    sql: `SELECT date '2026-01-31' + interval '1 month';`,
    choices: ['2026-03-03', '2026-02-28 00:00:00', '2026-02-28', 'une erreur : le 31 février n’existe pas'],
    answer: 1,
    why: "L'ajout de mois se cale sur le dernier jour existant (28 février). Et date + interval donne un timestamp : ajouter ::date pour garder une date.",
  },
  // Fenêtres (compléments)
  {
    id: 'q37', theme: 'fenetres', kind: 'output',
    q: 'Quelle valeur de cumul sur la ligne (2, 5) ?',
    sql: `SELECT j, v, sum(v) OVER (ORDER BY j) AS cumul
FROM (VALUES (1, 10), (2, 5), (2, 7)) t(j, v);`,
    choices: ['15', '22', '5', '10'],
    answer: 1,
    why: "Sans cadre explicite, ORDER BY dans le OVER donne RANGE … CURRENT ROW : les lignes à égalité sur j (5 et 7) sont additionnées ensemble. Pour un cumul ligne par ligne : ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW.",
  },
  {
    id: 'q38', theme: 'fenetres', kind: 'qcm',
    q: "avg(ca) OVER (ORDER BY jour ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), pour un magasin fermé le dimanche. Sur quelle période porte la moyenne ?",
    choices: ['Exactement 7 jours de calendrier', '7 lignes, donc 8 jours de calendrier (le dimanche n’a pas de ligne)', '6 jours', 'Toute la partition'],
    answer: 1,
    why: "ROWS compte des lignes. Pour des jours de calendrier : RANGE BETWEEN interval '6 days' PRECEDING AND CURRENT ROW, ou combler les trous avec generate_series (T18).",
  },
  {
    id: 'q39', theme: 'fenetres', kind: 'bug',
    q: 'Cette requête échoue. Pourquoi ?',
    sql: `SELECT magasin_id, total_ttc,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ttc) OVER (PARTITION BY magasin_id)
FROM tickets_caisse;`,
    choices: ['Il manque un GROUP BY total_ttc', 'percentile_cont est un agrégat seulement en PostgreSQL : pas de OVER', 'WITHIN GROUP est réservé à string_agg', '0.5 doit être écrit 50'],
    answer: 1,
    why: "« OVER is not supported for ordered-set aggregate percentile_cont ». Calculer la médiane avec GROUP BY dans une CTE, puis la joindre aux lignes.",
  },
  // Perf (compléments)
  {
    id: 'q40', theme: 'perf', kind: 'qcm',
    q: "Un export paginé par ORDER BY date_ticket LIMIT 500 OFFSET n renvoie parfois le même ticket sur deux pages. Meilleure correction ?",
    choices: ['Augmenter la taille des pages', 'Ajouter DISTINCT', 'Pagination par clé : ORDER BY date_ticket, id et WHERE (date_ticket, id) > (dernière ligne reçue)', 'Passer en SERIALIZABLE'],
    answer: 2,
    why: "Un tri non unique et des insertions pendant l'export décalent les pages OFFSET. La pagination par clé repart de la dernière ligne vue : pas de doublon, coût constant (T17).",
  },
  {
    id: 'q41', theme: 'perf', kind: 'bug',
    q: "Page suivante d'une liste triée du plus récent au plus ancien : la requête renvoie des tickets déjà vus. Pourquoi ?",
    sql: `SELECT id, date_ticket FROM tickets_caisse
WHERE (date_ticket, id) > (timestamptz '2026-10-20 10:00+02', 18000)
ORDER BY date_ticket DESC, id DESC
LIMIT 20;`,
    choices: ['Il manque un index', 'Le tri est décroissant : il faut < (les lignes plus anciennes que la dernière vue), pas >', 'La comparaison de lignes ne marche pas avec timestamptz', 'LIMIT doit précéder ORDER BY'],
    answer: 1,
    why: 'La comparaison doit suivre le sens du tri : ORDER BY … DESC avec <, ORDER BY … ASC avec >.',
  },
  {
    id: 'q42', theme: 'perf', kind: 'qcm',
    q: 'SELECT … FROM pg_stat_statements répond « relation "pg_stat_statements" does not exist ». Que faire ?',
    choices: ["Créer la table à la main", "Activer l'extension : shared_preload_libraries = 'pg_stat_statements', redémarrer, puis CREATE EXTENSION pg_stat_statements", 'Utiliser pg_stat_activity, qui contient le même historique', 'Lancer ANALYZE'],
    answer: 1,
    why: "pg_stat_statements est une extension à précharger au démarrage du serveur. pg_stat_activity ne montre que l'instant présent, pas les statistiques cumulées.",
  },
  // Corriger (compléments)
  {
    id: 'q43', theme: 'corriger', kind: 'qcm',
    q: "INSERT INTO magasins … ON CONFLICT (id) DO NOTHING échoue quand même avec « duplicate key value violates unique constraint \"magasins_code_key\" ». Pourquoi ?",
    choices: ['ON CONFLICT ne marche pas avec DO NOTHING', "ON CONFLICT (id) ne couvre que la contrainte sur id : la ligne heurte une autre contrainte unique (code)", 'Il faut un COMMIT avant', 'La table a un trigger'],
    answer: 1,
    why: "Le conflit visé doit correspondre à la contrainte heurtée. Ici, soit ON CONFLICT (code), soit ON CONFLICT DO NOTHING sans cible (toutes les contraintes uniques).",
  },
  {
    id: 'q44', theme: 'corriger', kind: 'qcm',
    q: 'Dans INSERT … ON CONFLICT (cle) DO UPDATE SET qte = EXCLUDED.qte, que désigne EXCLUDED ?',
    choices: ['La ligne déjà présente dans la table', "La ligne qu'on voulait insérer, rejetée par le conflit", 'Les lignes supprimées', 'Une table temporaire à créer'],
    answer: 1,
    why: "EXCLUDED = la ligne proposée. La ligne existante se désigne par le nom de la table (stocks.qte), utile pour DO UPDATE … WHERE stocks.maj_le < EXCLUDED.maj_le.",
  },
  // JSON
  {
    id: 'q45', theme: 'json', kind: 'qcm',
    q: "doc -> 'client' et doc ->> 'client' : quelle différence ?",
    choices: ['Aucune', '-> renvoie du jsonb (pour continuer à descendre), ->> renvoie du texte', '->> descend de deux niveaux', '-> ne marche que sur json, ->> sur jsonb'],
    answer: 1,
    why: "On enchaîne avec -> puis on termine par ->> : doc -> 'client' ->> 'nom'. Pour un chemin profond : #> et #>>.",
  },
  {
    id: 'q46', theme: 'json', kind: 'output',
    q: 'Quelle commande sort en premier ?',
    sql: `SELECT doc ->> 'num' FROM (VALUES
  ('{"num": "W-1001", "total": "89.90"}'::jsonb),
  ('{"num": "W-1002", "total": "9.90"}'),
  ('{"num": "W-1003", "total": "120.00"}')
) c(doc)
ORDER BY doc ->> 'total' DESC;`,
    choices: ['W-1003 (120.00)', 'W-1001 (89.90)', 'W-1002 (9.90)', "L'ordre n'est pas défini"],
    answer: 2,
    why: "->> renvoie du texte : '9.90' > '89.90' > '120.00' caractère par caractère. Trier sur (doc ->> 'total')::numeric (T20).",
  },
  {
    id: 'q47', theme: 'json', kind: 'qcm',
    q: "Quel filtre profite d'un index GIN sur la colonne doc (jsonb) ?",
    choices: ["doc ->> 'statut' = 'OK'", "doc @> '{\"statut\": \"OK\"}'", "doc::text LIKE '%OK%'", "lower(doc ->> 'statut') = 'ok'"],
    answer: 1,
    why: "L'index GIN sert aux opérateurs de contenance et de clé (@>, ?, ?|, ?&). Pour un filtre fréquent sur une seule clé, un index sur l'expression (doc ->> 'statut') convient aussi.",
  },
]

const kindLabel: Record<Kind, [string, 'indigo' | 'sky' | 'rose']> = {
  qcm: ['QCM', 'indigo'],
  output: ['Que renvoie ?', 'sky'],
  bug: ['Trouve le bug', 'rose'],
}

export default function Quiz() {
  const [answers, setAnswers] = useStored<Record<string, number>>('quiz:answers', {})
  const { go } = useNav()

  const stats = themes.map((t) => {
    const qs = questions.filter((q) => q.theme === t.id)
    const done = qs.filter((q) => answers[q.id] !== undefined)
    const ok = done.filter((q) => answers[q.id] === q.answer)
    return { ...t, total: qs.length, done: done.length, ok: ok.length }
  })
  const answered = Object.keys(answers).length
  const good = questions.filter((q) => answers[q.id] === q.answer).length
  const weak = stats.filter((s) => s.done > 0 && s.ok / s.done < 0.67)

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Auto-évaluation"
        subtitle={`${questions.length} questions réparties sur les 11 thèmes du cours. Réponds, lis l'explication, et regarde où tu en es par thème. Tes réponses sont gardées dans ce navigateur.`}
      />

      <Card className="mb-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <span className="text-3xl font-bold text-slate-900 dark:text-white">{good}</span>
            <span className="text-slate-500"> / {answered} bonnes réponses</span>
            <span className="ml-3 text-sm text-slate-500">({answered}/{questions.length} répondues)</span>
          </div>
          <button onClick={() => setAnswers({})} className="rounded-md px-3 py-1 text-sm text-slate-600 ring-1 ring-slate-300 hover:bg-slate-100 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800">
            Remettre à zéro
          </button>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          {stats.map((s) => {
            const pct = s.done ? Math.round((100 * s.ok) / s.done) : 0
            const color = !s.done ? 'bg-slate-300 dark:bg-slate-700' : pct >= 67 ? 'bg-emerald-500' : pct >= 34 ? 'bg-amber-500' : 'bg-rose-500'
            return (
              <div key={s.id} className="text-sm">
                <div className="flex justify-between">
                  <span>{s.label}</span>
                  <span className="text-xs text-slate-500">
                    {s.ok}/{s.done} {s.done < s.total && `· ${s.total - s.done} restante(s)`}
                  </span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${s.done ? Math.max(pct, 4) : 0}%` }} />
                </div>
              </div>
            )
          })}
        </div>
        {answered === questions.length && (
          <Callout tone={weak.length ? 'warn' : 'tip'} title={weak.length ? 'À réviser en priorité' : 'Solide sur tous les thèmes'}>
            {weak.length ? (
              <ul className="list-disc pl-5">
                {weak.map((w) => (
                  <li key={w.id}>
                    Révise la leçon{' '}
                    <button className="font-semibold underline" onClick={() => (w.lesson ? go('cours', w.lesson) : go('lexique'))}>
                      {w.label}
                    </button>{' '}
                    ({w.ok}/{w.done})
                  </li>
                ))}
              </ul>
            ) : (
              'Passe aux tickets du niveau 3 (T11 à T15) pour pratiquer en conditions réelles.'
            )}
          </Callout>
        )}
      </Card>

      <div className="space-y-5">
        {questions.map((q, i) => {
          const picked = answers[q.id]
          const done = picked !== undefined
          const theme = themes.find((t) => t.id === q.theme)!
          const [kl, kc] = kindLabel[q.kind]
          return (
            <Card key={q.id}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-slate-400">#{i + 1}</span>
                <Tag color={kc}>{kl}</Tag>
                <Tag>{theme.label}</Tag>
              </div>
              <p className="mt-2 font-medium">{q.q}</p>
              {q.sql && <Sql code={q.sql} run={done} />}
              <div className="mt-3 grid gap-2">
                {q.choices.map((c, j) => {
                  const isAnswer = j === q.answer
                  const style = !done
                    ? 'ring-slate-200 hover:bg-indigo-50 hover:ring-indigo-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                    : isAnswer
                      ? 'bg-emerald-50 ring-emerald-400 dark:bg-emerald-950/40 dark:ring-emerald-700'
                      : j === picked
                        ? 'bg-rose-50 ring-rose-400 dark:bg-rose-950/40 dark:ring-rose-700'
                        : 'opacity-50 ring-slate-200 dark:ring-slate-800'
                  return (
                    <button
                      key={j}
                      disabled={done}
                      onClick={() => setAnswers({ ...answers, [q.id]: j })}
                      className={`rounded-lg px-3 py-2 text-left text-sm ring-1 transition ${style}`}
                    >
                      <span className="mr-2 font-mono text-xs text-slate-400">{String.fromCharCode(65 + j)}</span>
                      {c}
                      {done && isAnswer && ' ✓'}
                      {done && j === picked && !isAnswer && ' ✗'}
                    </button>
                  )
                })}
              </div>
              {done && (
                <Callout tone={picked === q.answer ? 'tip' : 'warn'} title={picked === q.answer ? 'Exact' : 'Pas tout à fait'}>
                  {q.why}{' '}
                  <button className="underline" onClick={() => (theme.lesson ? go('cours', theme.lesson) : go('lexique'))}>
                    → {theme.lesson ? 'leçon' : 'lexique'} {theme.label}
                  </button>
                </Callout>
              )}
            </Card>
          )
        })}
      </div>
    </div>
  )
}
