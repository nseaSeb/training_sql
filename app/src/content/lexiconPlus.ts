/**
 * Explications approfondies (bouton « + En savoir plus ») du lexique, par nom d'entrée.
 * `code` entre accents graves est rendu en code ; sql = exemple exécutable optionnel.
 */
export type Plus = { text: string[]; sql?: string }

import { plus2 } from './lexiconPlus2'
import { plus3 } from './lexiconExtra'

const plus1: Record<string, Plus> = {
  SELECT: {
    text: [
      "Le SELECT ne contient pas que des colonnes : n'importe quelle expression (calcul, fonction, constante, sous-requête qui renvoie une valeur) y est permise. Chaque expression devient une colonne du résultat.",
      "Le résultat d'une requête est lui-même une table. C'est ce qui permet d'emboîter les requêtes (sous-requêtes, CTE) : la sortie de l'une est l'entrée de l'autre.",
      'On peut écrire un SELECT sans FROM pour tester une fonction : `SELECT now();` ou `SELECT lower(\'ABC\');`. Très pratique pour vérifier un comportement avant de l\'utiliser dans une vraie requête.',
    ],
    sql: `SELECT now() AS maintenant, 1 + 1 AS calcul, upper('test') AS fonction,\n       (SELECT count(*) FROM magasins) AS sous_requete;`,
  },
  WHERE: {
    text: [
      "Le WHERE est évalué ligne par ligne. Pour chaque ligne, la condition vaut VRAI, FAUX ou NULL (inconnu) ; seules les lignes à VRAI passent.",
      "C'est la raison pour laquelle `WHERE email <> 'x'` ne renvoie pas les clients sans email : pour eux, `NULL <> 'x'` vaut NULL, donc la ligne est écartée. Pour les inclure : `WHERE email <> 'x' OR email IS NULL`, ou `WHERE email IS DISTINCT FROM 'x'`.",
      "Le WHERE agit avant le GROUP BY : il réduit les données avant de regrouper. Filtrer le plus tôt possible est aussi meilleur pour les performances.",
    ],
    sql: `-- 600+ clients, mais combien sont « différents de x » ?\nSELECT count(*) AS total,\n       count(*) FILTER (WHERE email <> 'x') AS diff_x,\n       count(*) FILTER (WHERE email IS DISTINCT FROM 'x') AS distinct_x\nFROM clients_fidelite;`,
  },
  'IS NULL': {
    text: [
      "NULL ne veut pas dire « vide » ni « zéro » : il veut dire « je ne sais pas ». D'où la logique à 3 valeurs : une condition peut être VRAIE, FAUSSE ou INCONNUE (NULL).",
      "Raisonne avec l'idée « inconnu » : `NULL = 5` → est-ce que l'inconnu vaut 5 ? On ne sait pas → NULL. `NULL = NULL` → deux inconnus sont-ils égaux ? On ne sait pas → NULL. D'où l'obligation d'utiliser `IS NULL`, qui répond, lui, toujours vrai ou faux.",
      "Table de vérité à retenir : `NULL AND false` = false (un seul faux suffit) ; `NULL AND true` = NULL ; `NULL OR true` = true (un seul vrai suffit) ; `NULL OR false` = NULL ; `NOT NULL` = NULL.",
      "D'où viennent les NULL dans un incident ? (1) colonne non renseignée à la saisie (email du client) ; (2) donnée prévue absente (produit_id NULL = article hors référentiel) ; (3) LEFT JOIN sans correspondant ; (4) agrégat sur zéro ligne (`sum` d'un groupe vide) ; (5) calcul impliquant un NULL (`prix * NULL`).",
      "Comportements à connaître : dans ORDER BY, les NULL sont placés comme « plus grands que tout » (à la fin en ASC, au début en DESC). Dans GROUP BY et DISTINCT, tous les NULL forment UN seul groupe. Une contrainte UNIQUE accepte plusieurs NULL.",
      "Réflexe de diagnostic : dès qu'un chiffre « ne colle pas », compter les NULL de chaque colonne utilisée : `count(*) - count(col)`.",
    ],
    sql: `SELECT NULL = NULL AS egal, NULL IS NULL AS is_null,\n       (NULL AND false) AS null_and_false, (NULL AND true) AS null_and_true,\n       (NULL OR true) AS null_or_true, (NULL OR false) AS null_or_false,\n       1 + NULL AS calcul, 'a' || NULL AS concat;`,
  },
  'IS DISTINCT FROM': {
    text: [
      "C'est l'opérateur « égal / différent » qui traite NULL comme une valeur normale. Il répond toujours VRAI ou FAUX, jamais NULL.",
      "Cas typique : comparer deux versions d'une donnée pour détecter les changements. `WHERE ancien.prix <> nouveau.prix` rate les lignes où un des deux est NULL ; `WHERE ancien.prix IS DISTINCT FROM nouveau.prix` les attrape.",
      "Autre cas : joindre sur une colonne qui peut être NULL des deux côtés (ici `magasin_id` NULL = promo nationale).",
    ],
  },
  'IN / NOT IN': {
    text: [
      "`x IN (a, b, c)` est un raccourci de `x = a OR x = b OR x = c`. Et `x NOT IN (a, b, c)` de `x <> a AND x <> b AND x <> c`.",
      "Avec un NULL dans la liste : `5 NOT IN (1, NULL)` = `5 <> 1 AND 5 <> NULL` = `true AND NULL` = NULL. La ligne n'est donc jamais gardée. Il suffit d'UN seul NULL dans la sous-requête pour que la requête entière renvoie 0 ligne (ticket T02).",
      "`IN` n'a pas ce problème (`OR` avec un vrai = vrai). Seul `NOT IN` est piégeux. Réflexe : NOT IN avec une liste écrite à la main, ok ; NOT IN avec une sous-requête, remplacer par NOT EXISTS.",
    ],
    sql: `-- Le piège en 3 lignes\nSELECT count(*) AS avec_not_in FROM produits WHERE id NOT IN (SELECT produit_id FROM lignes_ticket);\nSELECT count(*) AS avec_not_exists FROM produits p\nWHERE NOT EXISTS (SELECT 1 FROM lignes_ticket l WHERE l.produit_id = p.id);`,
  },
  COALESCE: {
    text: [
      "coalesce lit ses arguments de gauche à droite et s'arrête au premier qui n'est pas NULL. Si tous sont NULL, il renvoie NULL.",
      "Trois usages typiques en support : (1) valeur par défaut à l'affichage : `coalesce(email, '(sans email)')` ; (2) transformer en 0 le NULL d'un `sum()` sur un groupe vide, notamment après un LEFT JOIN ; (3) choisir la première info disponible : `coalesce(prix_promo, prix_normal)` = « le prix promo s'il existe, sinon le prix normal ».",
      "Attention à ne pas « cacher » un problème : remplacer un NULL par 0 dans un rapport est juste si « pas de donnée » veut vraiment dire « zéro » (pas de vente ce jour-là). Si le NULL vient d'un flux en erreur, afficher 0 masquerait l'incident.",
      "Tous les arguments doivent être d'un type compatible : `coalesce(qte, 'aucune')` échoue car qte est un nombre. Écrire `coalesce(qte::text, 'aucune')`.",
      "Équivalent long : `CASE WHEN a IS NOT NULL THEN a WHEN b IS NOT NULL THEN b ELSE c END`.",
    ],
    sql: `-- Prix promo s'il existe, sinon prix normal (promos de Mérignac au 10/10)\nSELECT p.id, p.prix_ttc, pp.prix_promo,\n       coalesce(pp.prix_promo, p.prix_ttc) AS prix_applique\nFROM produits p\nLEFT JOIN prix_promos pp ON pp.produit_id = p.id AND pp.magasin_id = 1\n     AND date '2026-10-10' BETWEEN pp.debut AND pp.fin\nWHERE p.id BETWEEN 78 AND 84\nORDER BY p.id;`,
  },
  NULLIF: {
    text: [
      "`nullif(a, b)` = « si a vaut b, considère que c'est inconnu ». C'est l'inverse de coalesce : coalesce enlève des NULL, nullif en crée.",
      "Division par zéro : `x / 0` provoque une erreur qui fait échouer toute la requête. `x / nullif(0, 0)` = `x / NULL` = NULL : la ligne affiche vide au lieu de tout planter.",
      "Nettoyage : `nullif(trim(libelle), '')` transforme les chaînes vides ou faites d'espaces en NULL, ce qui permet ensuite de les traiter avec `IS NULL` ou `coalesce`.",
      "Combo classique : `coalesce(100.0 * a / nullif(b, 0), 0)` = pourcentage, ou 0 si le dénominateur est nul.",
    ],
  },
  COUNT: {
    text: [
      "`count(*)` compte des LIGNES. `count(col)` compte des VALEURS non nulles. La différence entre les deux = le nombre de NULL dans la colonne : `count(*) - count(email)` = clients sans email.",
      "Après un LEFT JOIN, un élément sans correspondant produit quand même UNE ligne (avec des NULL à droite). `count(*)` vaut donc 1 pour lui, alors que `count(l.id)` vaut 0. C'est presque toujours `count(colonne_de_droite)` qu'on veut.",
      "`count` ne renvoie jamais NULL : sur zéro ligne, il renvoie 0 (contrairement à sum).",
      "Postgres renvoie count en bigint ; pour un pourcentage, penser au `100.0 *` pour éviter la division entière.",
    ],
    sql: `SELECT p.id,\n       count(*)    AS count_etoile,\n       count(l.id) AS count_ventes\nFROM produits p\nLEFT JOIN lignes_ticket l ON l.produit_id = p.id\nWHERE p.id IN (1, 399)\nGROUP BY p.id;`,
  },
  'SUM / AVG': {
    text: [
      "sum et avg ignorent les NULL. Sur les valeurs (10, 20, NULL), la moyenne vaut 15 (= 30 / 2) et non 10 (= 30 / 3). Si un NULL doit compter pour zéro : `avg(coalesce(x, 0))`.",
      "Sur un groupe sans aucune valeur, sum renvoie NULL et non 0. D'où le réflexe `coalesce(sum(x), 0)` dans un rapport.",
      "Une somme qui « gonfle » après une jointure vient presque toujours d'une duplication de lignes (fan-out). Vérifier en comptant les lignes par clé avant de sommer.",
    ],
  },
  'GROUP BY': {
    text: [
      "Image mentale : GROUP BY range les lignes dans des « paquets » (un par valeur de la clé), puis chaque paquet est écrasé en une seule ligne. Les agrégats (count, sum…) disent comment résumer le paquet.",
      "Toute colonne affichée doit être soit la clé du paquet (dans le GROUP BY), soit résumée (dans un agrégat). Sinon Postgres ne sait pas quelle valeur choisir parmi celles du paquet → erreur.",
      "Exception utile : si on groupe par la clé primaire d'une table (`GROUP BY t.id`), on peut afficher les autres colonnes de t, car elles sont uniques par id.",
      "On peut grouper par une expression : `GROUP BY date_trunc('week', date_ticket)` ou par position : `GROUP BY 1, 2` (1re et 2e colonnes du SELECT).",
      "Avant d'écrire le GROUP BY, se demander « une ligne du résultat = quoi ? » (un magasin ? un magasin par jour ?). La réponse, c'est la liste du GROUP BY.",
    ],
  },
  HAVING: {
    text: [
      "WHERE trie les lignes avant de faire les paquets ; HAVING trie les paquets une fois faits. Une condition sur une colonne simple va dans le WHERE ; une condition sur un agrégat va dans le HAVING.",
      "Les deux peuvent coexister : `WHERE statut = 'VALIDE' GROUP BY magasin_id HAVING sum(total_ttc) > 100000`.",
      "Pattern n°1 du support : trouver les doublons → `GROUP BY cle HAVING count(*) > 1`.",
    ],
  },
  'CROSS JOIN': {
    text: [
      "Image mentale : un tableau à double entrée. Chaque ligne de gauche est associée à TOUTES les lignes de droite, sans condition. 4 magasins × 24 jours = 96 lignes ; 4 magasins × 400 produits = 1 600 lignes.",
      "Il n'y a pas de ON : c'est voulu. Écrire `FROM a, b` (virgule) donne le même résultat, et c'est souvent un CROSS JOIN involontaire quand on oublie la condition dans le WHERE, d'où des résultats énormes et des sommes multipliées.",
      "Usage n°1 en reporting : fabriquer la grille complète « toutes les combinaisons attendues » (magasin × jour), puis y accrocher les données réelles avec un LEFT JOIN. Les cases sans données apparaissent avec 0 au lieu de disparaître : c'est ainsi qu'on repère « le magasin 4 n'a rien vendu le 6/10 » (inventaire) ou « tel flux n'est pas passé tel jour ».",
      "Usage n°2 : initialiser des données pour toutes les combinaisons (le kit crée le stock initial avec `magasins CROSS JOIN produits`).",
      "Réflexe de prudence : avant un CROSS JOIN, multiplier mentalement les deux nombres de lignes. 20 000 tickets × 400 produits = 8 millions de lignes, ce n'est probablement pas ce qu'on veut.",
    ],
    sql: `-- Grille magasin × jour, puis CA réel accroché : les jours à 0 apparaissent\nSELECT m.code, d::date AS jour, count(t.id) AS nb_tickets\nFROM magasins m\nCROSS JOIN generate_series(date '2026-10-04', date '2026-10-07', interval '1 day') d\nLEFT JOIN tickets_caisse t\n       ON t.magasin_id = m.id AND t.statut = 'VALIDE'\n      AND t.date_ticket >= d AND t.date_ticket < d + interval '1 day'\nWHERE m.actif\nGROUP BY m.code, d\nORDER BY m.code, d;`,
  },
  'JOIN (INNER JOIN)': {
    text: [
      "Image mentale : pour chaque ligne de gauche, on cherche toutes les lignes de droite qui vérifient le ON, et on produit une ligne par paire trouvée. 0 trouvée → la ligne disparaît. 3 trouvées → la ligne apparaît 3 fois.",
      "Avant de joindre, identifier la cardinalité : un ticket a N lignes (1-N), une ligne a 1 produit (N-1). Joindre du côté « 1 » vers le côté « N » multiplie les lignes : normal si on veut le détail, dangereux si on somme une colonne du côté « 1 » (le total du ticket compté une fois par ligne).",
      "Vérification simple : comparer `count(*)` avant et après la jointure. Si ça augmente alors que ça ne devrait pas, il y a duplication.",
    ],
    sql: `-- Le total ticket sommé après jointure avec ses lignes : faux (compté N fois)\nSELECT sum(t.total_ttc) AS faux_ca FROM tickets_caisse t JOIN lignes_ticket l ON l.ticket_id = t.id WHERE t.magasin_id = 1;\nSELECT sum(t.total_ttc) AS vrai_ca FROM tickets_caisse t WHERE t.magasin_id = 1;`,
  },
  'LEFT JOIN': {
    text: [
      "Le LEFT JOIN garantit que chaque ligne de gauche apparaît au moins une fois. Sans correspondant, elle apparaît avec des NULL dans toutes les colonnes de droite.",
      "Où mettre une condition sur la table de droite ? Dans le ON = « ne joins que les lignes qui vérifient ça » (les lignes de gauche restent). Dans le WHERE = « après la jointure, ne garde que les lignes qui vérifient ça » : les lignes complétées par des NULL échouent au test et disparaissent. C'est le piège du ticket T04.",
      "Une condition sur la table de GAUCHE, elle, va bien dans le WHERE (ex. `WHERE p.rayon = 'Frais'`).",
      "Anti-jointure : `LEFT JOIN b … WHERE b.id IS NULL` = les lignes de a qui n'ont aucun b (équivalent de NOT EXISTS).",
    ],
  },
  EXISTS: {
    text: [
      "EXISTS pose une question oui/non : « existe-t-il au moins une ligne qui… ». Ce qu'on met dans le SELECT de la sous-requête n'a aucune importance (on écrit `SELECT 1` par convention).",
      "Différence clé avec JOIN : EXISTS ne duplique jamais la ligne extérieure, même s'il y a 10 correspondances. C'est la bonne solution quand on veut filtrer sans additionner (ticket T10 : ligne vendue pendant 2 promos qui se chevauchent).",
      "La sous-requête est « corrélée » : elle utilise une colonne de la requête extérieure (`pp.produit_id = l.produit_id`). Elle est donc logiquement évaluée pour chaque ligne.",
    ],
  },
  CASE: {
    text: [
      "Deux formes. Recherchée : `CASE WHEN cond1 THEN … WHEN cond2 THEN … END` (la plus courante). Simple : `CASE statut WHEN 'OK' THEN 1 WHEN 'KO' THEN 0 END`.",
      "Le premier WHEN vrai gagne, les suivants ne sont pas testés : mettre les cas les plus spécifiques ou prioritaires en premier (ex. ERREUR avant BLOQUÉ avant REJETS au ticket T08).",
      "Sans ELSE, un cas non prévu donne NULL : ajouter un ELSE explicite évite les trous silencieux.",
      "CASE s'utilise partout : SELECT (catégoriser), ORDER BY (tri personnalisé), dans un agrégat (`sum(CASE WHEN … THEN montant ELSE 0 END)`), dans un UPDATE.",
    ],
    sql: `-- Tri personnalisé : erreurs d'abord\nSELECT flux, magasin_id, statut, debut FROM imports_log\nORDER BY CASE statut WHEN 'ERREUR' THEN 1 WHEN 'EN_COURS' THEN 2 ELSE 3 END, debut DESC\nLIMIT 10;`,
  },
  'Types date / timestamp / timestamptz': {
    text: [
      "timestamptz stocke un instant universel (en interne, en UTC). À l'affichage, Postgres le convertit dans le fuseau de la session (`SHOW timezone`). Le même instant s'affiche donc différemment selon la session, mais c'est la même valeur.",
      "timestamp (sans tz) stocke une heure « comme sur une horloge murale », sans savoir de quel pays. Mélanger les deux, ou importer des heures UTC dans un timestamp, donne les décalages classiques d'1 ou 2 heures.",
      "Paris = UTC+2 en été (jusqu'au dernier dimanche d'octobre) et UTC+1 en hiver. Une vente à 0h30 à Paris en octobre est à 22h30 UTC la VEILLE : découper les journées en UTC la range au mauvais jour (ticket T09).",
      "`AT TIME ZONE` change de sens selon le type : sur un timestamptz il renvoie l'heure locale (timestamp) ; sur un timestamp il l'interprète comme heure locale et renvoie un timestamptz.",
    ],
  },
  'AT TIME ZONE': {
    text: [
      "Question à se poser : « dans quel fuseau mes utilisateurs comptent-ils leurs journées ? ». Pour un magasin français : Europe/Paris. Le découpage par jour doit se faire dans ce fuseau.",
      "Utiliser un nom de zone (`'Europe/Paris'`) plutôt qu'un décalage fixe (`'+02'`) : le nom gère le passage heure d'été / heure d'hiver.",
      "Pour filtrer efficacement un jour précis, mieux vaut des bornes explicites : `date_ticket >= timestamptz '2026-10-15 00:00 Europe/Paris' AND date_ticket < timestamptz '2026-10-16 00:00 Europe/Paris'` (index utilisable).",
    ],
  },
  'OVER (PARTITION BY …)': {
    text: [
      "Différence fondamentale avec GROUP BY : GROUP BY écrase chaque groupe en une ligne. OVER calcule une valeur sur le groupe mais la « recopie » sur chaque ligne, qui reste visible. On garde le détail ET on a le résumé à côté.",
      "PARTITION BY = « par quoi on découpe » (comme un GROUP BY). ORDER BY dans le OVER = « dans quel ordre on parcourt chaque partition » (nécessaire pour row_number, lag, cumul). Sans PARTITION BY, toute la table est une seule partition.",
      "Avec un ORDER BY dans le OVER, `sum()` devient un cumul (somme de la première ligne jusqu'à la ligne courante, ex aequo du tri compris : voir « Cadre (ROWS BETWEEN) »).",
      "Les fenêtres sont calculées après WHERE, GROUP BY et HAVING : on ne peut donc pas les filtrer dans le WHERE. Il faut une sous-requête ou une CTE autour.",
    ],
    sql: `-- Chaque ticket reste, avec la moyenne de son magasin à côté\nSELECT id, magasin_id, total_ttc,\n       round(avg(total_ttc) OVER (PARTITION BY magasin_id), 2) AS moy_magasin,\n       total_ttc - avg(total_ttc) OVER (PARTITION BY magasin_id) > 50 AS gros_panier\nFROM tickets_caisse WHERE statut = 'VALIDE'\nLIMIT 10;`,
  },
  ROW_NUMBER: {
    text: [
      "Recette du « top N par groupe » : (1) dans une sous-requête, numéroter avec `row_number() OVER (PARTITION BY groupe ORDER BY critère DESC)` ; (2) dehors, filtrer `WHERE rn <= N`.",
      "En cas d'égalité sur le critère, row_number départage au hasard : ajouter une colonne au tri (`ORDER BY debut DESC, id DESC`) pour un résultat stable, ou utiliser rank si on veut garder les ex aequo.",
    ],
  },
  'BEGIN / COMMIT / ROLLBACK': {
    text: [
      "Une transaction est « tout ou rien » : soit toutes les modifications sont validées ensemble (COMMIT), soit aucune (ROLLBACK). Entre les deux, les autres utilisateurs ne voient pas encore les changements.",
      "Procédure de correction en production : (1) SELECT qui compte les lignes concernées ; (2) sauvegarde (`CREATE TABLE sauvegarde_ticket123 AS SELECT …`) ; (3) BEGIN ; (4) UPDATE … RETURNING, et vérifier que le nombre de lignes modifiées = le comptage ; (5) contrôle ; (6) COMMIT seulement si tout est conforme, sinon ROLLBACK.",
      "Si une erreur survient dans la transaction, Postgres la bloque (« current transaction is aborted ») : seul ROLLBACK est accepté.",
      "Danger : une transaction ouverte et oubliée (« idle in transaction ») garde des verrous et peut bloquer l'application. Toujours terminer par COMMIT ou ROLLBACK.",
    ],
  },
  UPDATE: {
    text: [
      "Méthode sûre : écrire d'abord `SELECT * FROM table WHERE condition`, vérifier que ce sont exactement les bonnes lignes, puis remplacer `SELECT * FROM` par `UPDATE … SET` en gardant le WHERE à l'identique.",
      "UPDATE avec jointure en Postgres : `UPDATE a SET col = b.val FROM b WHERE b.id = a.b_id AND …`. Si plusieurs lignes de b correspondent à une ligne de a, le résultat est imprévisible : vérifier l'unicité avant.",
    ],
  },
  EXPLAIN: {
    text: [
      "Le plan est un arbre : chaque nœud reçoit des lignes de ses enfants (indentés en dessous) et en produit pour son parent. On lit donc de l'intérieur (en bas, le plus indenté) vers l'extérieur.",
      "Les nœuds principaux : Seq Scan (lecture complète de la table), Index Scan / Bitmap Index Scan (accès via un index), Nested Loop / Hash Join / Merge Join (trois façons de joindre), Sort, Aggregate, Limit.",
      "Chiffres clés avec ANALYZE : `actual time` (ms), `rows` (lignes réelles) contre `rows` estimées (un gros écart = statistiques obsolètes → ANALYZE table), `loops`, `Rows Removed by Filter`, `Buffers: shared hit/read` (pages lues en mémoire / sur disque).",
      "En support, on ne crée pas l'index soi-même en prod : on fournit le plan avant/après à l'équipe technique avec la requête et sa fréquence d'utilisation.",
    ],
  },
  'DISTINCT ON': {
    text: [
      "Fonctionnement : Postgres trie selon l'ORDER BY, puis garde la première ligne rencontrée pour chaque valeur de la clé du DISTINCT ON. Le choix du « premier » est donc entièrement piloté par la suite de l'ORDER BY.",
      "`DISTINCT ON (flux, magasin_id) … ORDER BY flux, magasin_id, debut DESC` = pour chaque couple, la ligne avec le debut le plus grand = le dernier passage.",
      "Équivalent standard (autres bases) : row_number() = 1 dans une sous-requête.",
    ],
  },
  'Division entière': {
    text: [
      "Quand les deux opérandes sont des entiers, Postgres fait une division entière et jette les décimales : 5 / 2000 = 0. Un taux de rejet calculé ainsi vaut toujours 0 (sauf si 100 %).",
      "Il suffit qu'UN des opérandes soit décimal : `100.0 * a / b`, `a::numeric / b`. Attention à l'ordre : `100 * (a / b)` fait d'abord la division entière, donc toujours faux.",
    ],
  },
  'WITH (CTE)': {
    text: [
      "Une CTE se lit comme une recette en étapes : chaque étape porte un nom et peut utiliser les précédentes. On peut tester chaque étape seule en remplaçant le SELECT final par `SELECT * FROM etape`.",
      "C'est la meilleure façon d'aborder une requête complexe en entretien ou en incident : écrire étape 1, vérifier ; étape 2, vérifier… plutôt qu'une grosse requête d'un coup.",
      "Une CTE n'existe que pendant la requête. Pour garder un résultat intermédiaire plus longtemps : `CREATE TEMP TABLE`.",
    ],
  },
}

export const plus: Record<string, Plus> = { ...plus1, ...plus2, ...plus3 }
