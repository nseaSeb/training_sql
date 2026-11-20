import type { Plus } from './lexiconPlus'

/** Suite des explications approfondies du lexique (fiches restantes). */
export const plus2: Record<string, Plus> = {
  FROM: {
    text: [
      "Le FROM définit l'ensemble de lignes de départ. Tout le reste (WHERE, GROUP BY, SELECT…) travaille sur ce que le FROM et les JOIN ont produit.",
      "On peut y mettre une table, plusieurs tables jointes, une sous-requête (`FROM (SELECT …) x`, l'alias est obligatoire), une fonction qui renvoie des lignes (`generate_series`) ou une liste de valeurs (`FROM (VALUES (1), (2)) t(x)`).",
      "Le schéma : `retail.produits` désigne la table produits du schéma retail. Ici le `search_path` est réglé sur retail, donc `produits` suffit. Si une table « n'existe pas » alors qu'elle existe, vérifier le schéma (`SHOW search_path`).",
    ],
    sql: `SELECT * FROM (VALUES ('M033', 'Mérignac'), ('M017', 'Saintes')) AS t(code, ville);`,
  },
  'AS (alias)': {
    text: [
      "Alias de table : indispensable dès qu'on joint plusieurs tables (`t.id` contre `l.id`), et obligatoire pour joindre une table avec elle-même (`prix_promos a JOIN prix_promos b`).",
      "Alias de colonne : donne un nom lisible au résultat, utilisé ensuite dans ORDER BY (`ORDER BY ca DESC` marche, car ORDER BY est calculé après SELECT) mais pas dans WHERE ni HAVING.",
      "Un alias avec espaces, accents ou majuscules doit être entre guillemets doubles : `AS \"CA total\"`. Plus simple : rester en minuscules avec des underscores.",
    ],
  },
  'ORDER BY': {
    text: [
      "Une table SQL n'a pas d'ordre naturel. Sans ORDER BY, Postgres renvoie les lignes dans l'ordre qui l'arrange, qui peut changer d'une exécution à l'autre. Un export ou un écran qui « change d'ordre tout seul » manque souvent d'ORDER BY.",
      "On peut trier par plusieurs colonnes (la 2e départage les égalités de la 1re), par expression (`ORDER BY lower(nom)`), par alias, ou par position (`ORDER BY 2 DESC`).",
      "Pour un résultat stable, terminer par une colonne unique (souvent l'id) : `ORDER BY date_ticket DESC, id DESC`.",
    ],
  },
  'LIMIT / OFFSET': {
    text: [
      "LIMIT est appliqué en tout dernier, après le tri. « Les 10 plus gros tickets » = `ORDER BY total_ttc DESC LIMIT 10`. Sans ORDER BY, on obtient 10 lignes quelconques.",
      "OFFSET sert à paginer (page 3 de 50 lignes = `LIMIT 50 OFFSET 100`), mais devient lent sur de grosses tables car Postgres lit puis jette les lignes sautées.",
      "Pagination fiable avec OFFSET : un ORDER BY qui finit par une colonne unique. Sans ORDER BY, l'ordre n'est pas garanti (plan, parcours parallèle, ordre physique différent sur un réplica) : la même ligne peut sortir sur deux pages. Même avec un tri parfait, une insertion entre deux pages décale tout d'une ligne.",
      "En exploration, toujours mettre un LIMIT sur une grosse table (lignes_ticket : plus de 60 000 lignes) pour ne pas noyer l'écran.",
    ],
  },
  'Pagination par clé (keyset)': {
    text: [
      "Aussi appelée « seek method ». La comparaison de lignes `(a, b) > (x, y)` signifie `a > x OR (a = x AND b > y)` : exactement l'ordre du `ORDER BY a, b`.",
      "Index indispensable sur les colonnes du tri, dans le même ordre : `CREATE INDEX ON tickets_caisse (date_ticket, id)`. Le plan montre alors `Index Cond: (ROW(date_ticket, id) < ROW(…))` et ne lit que les 20 lignes utiles. Mesuré sur le kit : OFFSET 15000 lit 15 020 lignes (3 ms), la version keyset en lit 20 (0,08 ms).",
      "Tri décroissant : inverser la comparaison (`<` avec `ORDER BY … DESC, id DESC`). Page précédente : inverser comparaison et tri, puis remettre le résultat dans l'ordre d'affichage.",
      "Tri mixte (`a DESC, b ASC`) : la comparaison de lignes ne marche plus, écrire `a < x OR (a = x AND b > y)` à la main. Colonne de tri qui peut être NULL : la traiter à part, ou trier sur `coalesce(…)`.",
      "Garder OFFSET pour les petites listes ou quand il faut des numéros de page. Le keyset convient au défilement infini, aux API et aux exports par lots.",
    ],
  },
  DISTINCT: {
    text: [
      "DISTINCT porte sur la ligne entière affichée, pas sur la première colonne : `SELECT DISTINCT magasin_id, num_caisse` donne les couples distincts.",
      "`count(DISTINCT col)` compte les valeurs différentes : nombre de clients différents, de produits différents vendus…",
      "Pour savoir combien il y a de doublons, et non seulement les supprimer, préférer `GROUP BY … HAVING count(*) > 1`, qui montre aussi combien de fois chaque valeur apparaît.",
    ],
    sql: `SELECT DISTINCT magasin_id, num_caisse FROM tickets_caisse ORDER BY 1, 2 LIMIT 15;`,
  },
  'AND / OR / NOT': {
    text: [
      "Priorité : NOT, puis AND, puis OR. Ainsi `WHERE magasin_id = 1 OR magasin_id = 2 AND statut = 'VALIDE'` se lit `magasin_id = 1 OR (magasin_id = 2 AND statut = 'VALIDE')` : les tickets annulés du magasin 1 passent. Un bug très courant.",
      "Remède : parenthèses systématiques, ou `IN` pour les listes : `WHERE magasin_id IN (1, 2) AND statut = 'VALIDE'`.",
      "Avec NULL : `NOT (x = 1)` vaut NULL si x est NULL, donc la ligne n'apparaît ni avec `x = 1` ni avec `NOT (x = 1)`. Les deux comptes additionnés ne font pas le total.",
    ],
    sql: `SELECT count(*) FILTER (WHERE magasin_id = 1 OR magasin_id = 2 AND statut = 'VALIDE') AS sans_parentheses,\n       count(*) FILTER (WHERE (magasin_id = 1 OR magasin_id = 2) AND statut = 'VALIDE') AS avec_parentheses\nFROM tickets_caisse;`,
  },
  '= <> < > <= >=': {
    text: [
      "On compare des valeurs de même type. Postgres convertit automatiquement une chaîne littérale (`date_ticket >= '2026-10-01'` : la chaîne devient une date), mais pas une colonne texte avec une colonne entière (« operator does not exist »).",
      "Le texte se compare caractère par caractère : `'10' < '9'` est vrai (car '1' < '9'). Un numéro stocké en texte se trie mal : le convertir (`::int`) avant de comparer ou trier.",
      "Les comparaisons de texte sont sensibles à la casse et aux espaces : `'Frais' = 'frais '` est faux. Normaliser avec lower(trim()) si nécessaire.",
    ],
    sql: `SELECT '10' < '9' AS texte, 10 < 9 AS nombre, 'Frais' = 'frais ' AS brut, lower(trim('frais ')) = lower('Frais') AS normalise;`,
  },
  BETWEEN: {
    text: [
      "BETWEEN inclut les deux bornes. Parfait pour des dates « jour » (colonne de type date) : `debut BETWEEN '2026-10-01' AND '2026-10-31'`.",
      "Sur un timestamptz, la borne haute `'2026-10-31'` signifie le 31 à 00:00:00 : toute la journée du 31 est exclue. La forme sûre : `>= '2026-10-01' AND < '2026-11-01'` (borne demi-ouverte).",
      "`NOT BETWEEN a AND b` = en dehors de l'intervalle. `BETWEEN` exige a <= b, sinon rien n'est trouvé.",
    ],
  },
  'LIKE / ILIKE': {
    text: [
      "Jokers : `%` = zéro, un ou plusieurs caractères ; `_` = exactement un caractère. Sans joker, LIKE équivaut à `=`.",
      "`LIKE 'abc%'` (commence par) peut utiliser un index ; `LIKE '%abc%'` (contient) oblige à lire toute la table : lent sur de gros volumes.",
      "ILIKE ignore la casse mais pas les accents : `'Pâtes' ILIKE 'pates'` est faux. Pour les accents, l'extension unaccent : `unaccent(libelle) ILIKE '%pates%'`.",
      "Chercher un vrai `%` ou `_` : le précéder d'un antislash, `LIKE '100\\%'`.",
    ],
  },
  '~ (regex)': {
    text: [
      "Les briques utiles : `^` début, `$` fin, `[0-9]` un chiffre, `{13}` exactement 13 fois, `+` une fois ou plus, `*` zéro fois ou plus, `?` optionnel, `\\.` un vrai point, `|` ou.",
      "`'^[0-9]{13}$'` = uniquement 13 chiffres, rien avant, rien après. Sans `^…$`, `'[0-9]{13}'` accepterait aussi '3012345678901XYZ'.",
      "Contrôle d'un prix : `'^[0-9]+(\\.[0-9]{1,2})?$'` = des chiffres, éventuellement suivis d'un point et 1 ou 2 décimales.",
      "Fonctions associées : `regexp_replace(texte, motif, remplacement, 'g')` pour nettoyer (ex. retirer tout ce qui n'est pas un chiffre), `substring(texte from motif)` pour extraire.",
    ],
    sql: `SELECT prix, prix ~ '^[0-9]+(\\.[0-9]{1,2})?$' AS format_ok,\n       regexp_replace(prix, '[^0-9.,-]', '', 'g') AS nettoye\nFROM import_produits_staging ORDER BY num_ligne;`,
  },
  'RIGHT / FULL JOIN': {
    text: [
      "`a RIGHT JOIN b` = `b LEFT JOIN a`. Par convention, on écrit toujours des LEFT JOIN en mettant la table « à garder entière » à gauche : c'est plus facile à relire.",
      "FULL JOIN est l'outil de rapprochement : comparer deux sources (stock calculé contre stock affiché, fichier importé contre table). Trois cas en sortie : présent des deux côtés, seulement à gauche, seulement à droite.",
      "Pour classer les cas : `CASE WHEN a.k IS NULL THEN 'manque à gauche' WHEN b.k IS NULL THEN 'manque à droite' ELSE 'présent des deux côtés' END`.",
    ],
  },
  USING: {
    text: [
      "`JOIN b USING (magasin_id)` équivaut à `JOIN b ON b.magasin_id = a.magasin_id`, et la colonne commune n'apparaît qu'une fois dans `SELECT *`.",
      "Limite : seulement pour une égalité entre colonnes de même nom. Dès que les noms diffèrent (`t.id = l.ticket_id`), il faut ON.",
    ],
  },
  'NOT EXISTS': {
    text: [
      "Trois façons d'écrire « A sans B » : `NOT EXISTS` (recommandée), `LEFT JOIN … WHERE b.id IS NULL` (équivalente), `NOT IN (sous-requête)` (piégeuse à cause des NULL).",
      "Lecture en français : « garde le produit s'il n'existe aucune ligne de vente qui pointe vers lui ».",
      "Cas d'usage en support : produits jamais vendus, clients sans achat, tickets sans lignes, lignes sans produit existant (intégrité, ticket T15), magasins sans flux reçu aujourd'hui.",
    ],
    sql: `-- Tickets validés qui n'ont aucune ligne\nSELECT count(*) FROM tickets_caisse t\nWHERE NOT EXISTS (SELECT 1 FROM lignes_ticket l WHERE l.ticket_id = t.id);`,
  },
  LATERAL: {
    text: [
      "Une sous-requête normale dans le FROM ne peut pas « voir » les autres tables du FROM. Avec LATERAL, elle peut : elle est rejouée pour chaque ligne de gauche.",
      "Pattern : « pour chaque magasin, ses 3 derniers imports » : `FROM magasins m CROSS JOIN LATERAL (SELECT … WHERE i.magasin_id = m.id ORDER BY debut DESC LIMIT 3) x`.",
      "`CROSS JOIN LATERAL` élimine les magasins sans résultat ; `LEFT JOIN LATERAL (…) ON true` les garde avec des NULL.",
    ],
  },
  'MIN / MAX': {
    text: [
      "Ils ignorent les NULL et renvoient NULL sur un groupe vide.",
      "max(date) est un outil de supervision très utile : « dernière mise à jour par magasin », « dernier ticket reçu par caisse ». Une date max trop ancienne = flux ou batch arrêté (ticket T07).",
      "Piège : `SELECT magasin_id, max(total_ttc), id` ne donne PAS l'id du ticket max (erreur GROUP BY). Pour avoir la ligne entière du max : DISTINCT ON ou row_number().",
    ],
    sql: `-- Dernier ticket reçu par caisse : une caisse muette se repère tout de suite\nSELECT magasin_id, num_caisse, max(date_ticket) AS dernier_ticket\nFROM tickets_caisse GROUP BY 1, 2 ORDER BY dernier_ticket LIMIT 5;`,
  },
  FILTER: {
    text: [
      "`agregat(x) FILTER (WHERE condition)` : seul l'agrégat est filtré, pas la requête. On peut donc avoir dans une même ligne le total, les annulés, les valides…",
      "Équivalent dans les autres bases : `sum(CASE WHEN condition THEN x END)` ou `count(CASE WHEN condition THEN 1 END)`.",
      "Idéal pour les tableaux « avant / après » : `sum(qte) FILTER (WHERE date < '2026-10-10')` et `… FILTER (WHERE date >= '2026-10-10')` côte à côte (ticket T05).",
    ],
  },
  STRING_AGG: {
    text: [
      "Le séparateur est obligatoire (2e argument). Les NULL sont ignorés. L'ORDER BY à l'intérieur fixe l'ordre de la liste.",
      "Les valeurs doivent être du texte : `string_agg(id::text, ', ')`. On peut construire chaque élément : `string_agg(num_carte || ' (' || cree_le || ')', ', ')`.",
      "Très utile pour une réponse à un utilisateur : une ligne par client avec la liste de ses cartes, plutôt que 15 lignes à relire.",
    ],
  },
  ARRAY_AGG: {
    text: [
      "Produit un tableau Postgres, qu'on peut ensuite interroger : `cardinality(t)` (taille), `t[1]` (1er élément, les indices commencent à 1), `'x' = ANY(t)` (appartenance).",
      "Astuce « premier élément selon un ordre » : `(array_agg(num_carte ORDER BY cree_le))[1]` = la carte la plus ancienne du groupe.",
    ],
  },
  ROLLUP: {
    text: [
      "`ROLLUP (a, b)` produit les groupes (a, b), puis (a) seul = sous-total par a, puis () = total général. L'ordre des colonnes compte.",
      "Les lignes de sous-total ont NULL dans les colonnes « résumées ». Pour les étiqueter : `coalesce(magasin_id::text, 'TOTAL')`, ou `GROUPING(col)` qui vaut 1 sur une ligne de sous-total.",
      "Variantes : `CUBE (a, b)` = toutes les combinaisons de sous-totaux ; `GROUPING SETS ((a), (b), ())` = choix à la carte.",
    ],
  },
  'GREATEST / LEAST': {
    text: [
      "Ils comparent plusieurs valeurs d'une même ligne. À ne pas confondre avec max/min, qui comparent une colonne sur plusieurs lignes.",
      "Ils ignorent les NULL (`greatest(1, NULL)` = 1), contrairement à la plupart des fonctions.",
      "Usages : plancher (`greatest(qte, 0)`), plafond (`least(remise, prix)`), date la plus récente entre deux colonnes (`greatest(date_creation, date_modif)`).",
    ],
  },
  'LOWER / UPPER': {
    text: [
      "Comparer sans tenir compte de la casse : appliquer la même fonction des deux côtés, `lower(email) = lower('Pierre.47@exemple.fr')`. Ou ILIKE.",
      "`initcap('jean DUPONT')` donne 'Jean Dupont' : pratique pour présenter des noms saisis n'importe comment.",
      "Un index sur `email` ne sert pas pour `WHERE lower(email) = …`. Si c'est une recherche fréquente, l'équipe technique peut créer un index sur l'expression : `CREATE INDEX ON clients_fidelite (lower(email))`.",
    ],
  },
  TRIM: {
    text: [
      "Les espaces parasites viennent des imports de fichiers (CSV, Excel) et des copier-coller. Ils sont invisibles à l'écran mais font échouer les comparaisons et créent de faux doublons.",
      "Détecter : `WHERE col <> trim(col)` liste les valeurs qui ont des espaces au début ou à la fin. `length(col) <> length(trim(col))` marche aussi.",
      "`trim` enlève aussi d'autres caractères si on le demande : `trim(both '0' from '00470')` = '47'.",
    ],
    sql: `SELECT num_carte, '[' || email || ']' AS email_brut\nFROM clients_fidelite WHERE email <> trim(email);`,
  },
  REPLACE: {
    text: [
      "replace est sensible à la casse et remplace toutes les occurrences.",
      "Nettoyage typique avant conversion d'un prix importé : `replace(replace(trim(prix), '€', ''), ',', '.')::numeric`. On peut imbriquer plusieurs replace.",
      "Pour des remplacements plus complexes (tout caractère non numérique…), utiliser `regexp_replace`.",
    ],
  },
  '|| (concaténer)': {
    text: [
      "`||` propage NULL : `'Carte ' || NULL` = NULL. Pour un affichage robuste : `concat()` (ignore les NULL), ou `coalesce(col, '')` autour de chaque morceau.",
      "`concat_ws(' - ', a, b, c)` = concaténation avec un séparateur, qui saute les NULL sans laisser de séparateur en double.",
      "Postgres convertit automatiquement les nombres et les dates dans une concaténation avec du texte : `'Ticket ' || id` fonctionne.",
    ],
  },
  LENGTH: {
    text: [
      "length compte des caractères (un 'é' = 1). `octet_length` compte des octets ('é' = 2 en UTF-8) : utile si un système en aval limite la taille en octets.",
      "Contrôle de format rapide : `WHERE length(ean) <> 13`. Mais une regex est plus stricte (13 caractères, ce n'est pas forcément 13 chiffres).",
      "`length(NULL)` = NULL, et `length('')` = 0 : deux cas différents à distinguer.",
    ],
  },
  'LEFT / SUBSTRING': {
    text: [
      "`left(t, n)` et `right(t, n)` : les n premiers / derniers caractères. Avec n négatif, left enlève les n derniers : `left('fichier.csv', -4)` = 'fichier'.",
      "`substring(t from début for longueur)` : les positions commencent à 1.",
      "Usage support : tronquer un message d'erreur trop long dans un tableau, `left(message, 80)`.",
    ],
  },
  SPLIT_PART: {
    text: [
      "Les morceaux sont numérotés à partir de 1. Si le morceau demandé n'existe pas, le résultat est une chaîne vide (pas NULL).",
      "Avec un index négatif (Postgres 14+), on compte depuis la fin : `split_part('a_b_c.csv', '_', -1)` = 'c.csv'.",
      "Pour transformer un texte en plusieurs lignes : `regexp_split_to_table('a,b,c', ',')` ou `unnest(string_to_array('a,b,c', ','))`.",
    ],
  },
  LPAD: {
    text: [
      "Cas réel : un code numérique importé par Excel a perdu ses zéros de tête (000047 devenu 47). `lpad(code::text, 6, '0')` le reconstitue.",
      "Si le texte est déjà plus long que la longueur demandée, lpad le TRONQUE : `lpad('1234567', 6, '0')` = '123456'. Vérifier les longueurs avant.",
      "`rpad` fait de même à droite (alignement d'exports à largeur fixe).",
    ],
  },
  ':: / CAST': {
    text: [
      "Conversions fréquentes : texte vers nombre (`'2.35'::numeric`), texte vers date (`'2026-10-15'::date`), nombre vers texte (`id::text`), timestamp vers date (`ts::date`), entier vers décimal (`a::numeric / b`).",
      "Si une seule valeur n'est pas convertible, toute la requête échoue. Sur des données importées : tester le format avant de convertir (regex dans un CASE : `CASE WHEN x ~ '^[0-9]+$' THEN x::int END`).",
      "Une date en texte au format français ('15/10/2026') ne se convertit pas avec `::date` de façon fiable : utiliser `to_date('15/10/2026', 'DD/MM/YYYY')`.",
      "`::numeric(10,2)` arrondit à 2 décimales au passage.",
    ],
    sql: `SELECT to_date('15/10/2026', 'DD/MM/YYYY') AS date_fr, '3.456'::numeric(10,2) AS arrondi, '42'::int + 1 AS entier;`,
  },
  ROUND: {
    text: [
      "`round(x, 2)` arrondit au plus proche (2.345 → 2.35). `trunc(x, 2)` coupe (2.349 → 2.34). `ceil` et `floor` arrondissent à l'entier supérieur / inférieur.",
      "Arrondir le plus tard possible : arrondir chaque ligne puis sommer donne un résultat différent de sommer puis arrondir. Les écarts de centimes entre deux rapports viennent souvent de là.",
      "Avec un type numeric, `round(x, 2)` fonctionne. Sur un double precision (résultat de certains calculs), il faut d'abord caster : `round(x::numeric, 2)`.",
    ],
  },
  ABS: {
    text: [
      "Utile pour contrôler un écart sans se soucier du sens : `WHERE abs(total_ttc - total_recalcule) > 0.01` (tolérance d'un centime pour les arrondis).",
      "Comparer des montants décimaux avec une tolérance est plus robuste qu'une égalité stricte quand ils viennent de calculs différents.",
    ],
  },
  'NOW / CURRENT_DATE': {
    text: [
      "now() renvoie l'heure du DÉBUT de la transaction : appelé deux fois dans la même transaction, il donne la même valeur. `clock_timestamp()` donne l'heure réelle à l'instant de l'appel.",
      "current_date dépend du fuseau de la session : à 0h30 à Paris, la date du jour en UTC est encore la veille.",
      "Expressions relatives fréquentes : `now() - interval '24 hours'`, `current_date - 7`, `date_trunc('month', now())` (début du mois).",
    ],
  },
  INTERVAL: {
    text: [
      "Unités acceptées : '30 minutes', '2 hours', '1 day', '1 week', '1 month', '1 year', et combinaisons ('1 day 2 hours').",
      "date + entier = date décalée de N jours (`current_date + 7`). date - date = un entier (nombre de jours). timestamp - timestamp = un interval.",
      "Pour avoir une durée en minutes : `extract(epoch FROM fin - debut) / 60` (epoch = nombre de secondes).",
      "Superviser un flux bloqué : `WHERE statut = 'EN_COURS' AND debut < now() - interval '1 hour'` (ticket T08).",
    ],
    sql: `SELECT fichier, fin - debut AS duree,\n       round(extract(epoch FROM fin - debut) / 60, 1) AS minutes\nFROM imports_log WHERE fin IS NOT NULL\nORDER BY fin - debut DESC LIMIT 5;`,
  },
  '::date': {
    text: [
      "Pour un timestamptz, `::date` utilise le fuseau de la session : le même ticket peut tomber sur deux jours différents selon le réglage. `(col AT TIME ZONE 'Europe/Paris')::date` rend le résultat indépendant de la session.",
      "Pour regrouper par jour : `GROUP BY col::date` convient. Pour filtrer un jour : préférer les bornes `col >= '2026-10-15' AND col < '2026-10-16'`, qui utilisent un index.",
    ],
  },
  DATE_TRUNC: {
    text: [
      "Unités : 'hour', 'day', 'week' (lundi de la semaine ISO), 'month', 'quarter', 'year'. Le résultat reste un timestamp, mis au début de la période : ajouter `::date` pour l'afficher proprement.",
      "Sur un timestamptz, la troncature se fait dans le fuseau de la session. Pour être explicite : `date_trunc('day', col, 'Europe/Paris')` (Postgres 12+).",
      "Pour un rapport sans trous, combiner avec generate_series : `generate_series(date_trunc('month', …), …, interval '1 month')`.",
    ],
  },
  EXTRACT: {
    text: [
      "Champs utiles : year, month, day, hour, minute, dow (0 = dimanche … 6 = samedi), isodow (1 = lundi … 7 = dimanche), week (semaine ISO), epoch (secondes depuis 1970, ou durée d'un interval en secondes).",
      "Analyse de fréquentation : `GROUP BY extract(hour FROM date_ticket)` donne la courbe des ventes par heure.",
      "Le kit l'utilise pour exclure les dimanches : `WHERE extract(isodow FROM d) <> 7`.",
    ],
  },
  TO_CHAR: {
    text: [
      "Motifs courants : `DD` jour, `MM` mois, `YYYY` année, `HH24:MI:SS` heure, `FMDay` / `FMMonth` nom du jour et du mois, `IYYY-IW` année et semaine ISO. Le texte entre guillemets doubles est recopié tel quel (`'\"S\"IW'`).",
      "Noms en anglais par défaut. Le préfixe `TM` (`TMDay`, `TMMonth`) traduit selon le paramètre `lc_time`, mais seulement si la locale existe sur le système du serveur. L'image Docker officielle n'a que `en_US` : `SET lc_time = 'fr_FR.UTF-8'` échoue (`invalid value for parameter \"lc_time\"`). Les collations ICU (`fr-x-icu`) ne servent pas ici : elles règlent le tri, pas to_char.",
      "`lc_time` ne prend qu'une valeur par session : impossible d'avoir français et allemand côte à côte dans un même to_char. Pour plusieurs langues, une petite table `noms_jours(langue, isodow, nom)` jointe sur `extract(isodow FROM d)` marche partout, quel que soit le serveur.",
      "Le préfixe `FM` retire le remplissage : `Day` renvoie 'Thursday ' (9 caractères), `FMDay` renvoie 'Thursday'. Même chose pour `FMDD` (5 au lieu de 05).",
      "Pour les nombres : `to_char(1234.5, 'FM999G990D00')` met en forme avec séparateurs (selon la locale).",
      "to_char produit du TEXTE : trier sur `to_char(d, 'DD/MM/YYYY')` trie mal (le 02/11 avant le 15/10). Trier sur la date d'origine, formater seulement pour l'affichage.",
    ],
  },
  'Nom du jour / du mois': {
    text: [
      "Le tableau `ARRAY[…][n]` commence à 1 en PostgreSQL : avec isodow (1 = lundi … 7 = dimanche), l'indice tombe juste. Avec dow (0 = dimanche), il faudrait décaler.",
      "Trier sur le nom du jour donne l'ordre alphabétique (dimanche, jeudi, lundi…) : trier sur `extract(isodow …)`.",
      "Pour plusieurs langues, une table de correspondance (CTE avec VALUES) remplace le tableau.",
    ],
    sql: `WITH noms(langue, isodow, nom) AS (\n  VALUES ('fr', 4, 'jeudi'), ('de', 4, 'Donnerstag'), ('es', 4, 'jueves')\n)\nSELECT langue, nom\nFROM noms\nWHERE isodow = extract(isodow FROM date '2026-10-15');`,
  },
  'Locales installées': {
    text: [
      "Après installation d'une locale sur l'OS, `SELECT pg_import_system_collations('pg_catalog');` (superutilisateur) la fait apparaître dans pg_collation.",
      "Les collations ICU (provider 'i', `fr-x-icu`…) sont listées aussi, mais elles ne règlent que le tri et la comparaison : elles n'agissent pas sur to_char.",
      "Sur l'image Docker officielle `postgres`, seule `en_US.utf8` est présente ; ajouter `fr_FR` demande une image personnalisée (`localedef`).",
    ],
  },
  'Traduire un jour : enum ou fonction': {
    text: [
      "Atout de l'enum : il se trie dans l'ordre de déclaration, donc `ORDER BY jour` donne lundi → dimanche et non l'ordre alphabétique. Revers : c'est un type de plus dans le schéma, et on ne peut ni retirer ni réordonner une valeur après coup.",
      "La fonction est le choix le plus simple : `IMMUTABLE` car le résultat ne dépend que de la date, ce qui permet même de l'utiliser dans un index.",
      "Cast d'un enum vers un autre : `CREATE CAST` existe, mais c'est disproportionné pour traduire des libellés.",
      "L'exemple est encadré par BEGIN … ROLLBACK : le type et la fonction disparaissent à la fin, la base n'est pas modifiée.",
    ],
  },
  'DAY() / MONTH() / DATEDIFF…': {
    text: [
      "`extract(field FROM d)` est la forme standard SQL ; `date_part('day', d)` est l'équivalent historique de PostgreSQL. extract renvoie un numeric (PostgreSQL 14+), date_part un double precision.",
      "Écart entre deux dates : `d2 - d1` donne un entier (jours) si ce sont des date, un interval si ce sont des timestamp. En minutes : `extract(epoch FROM t2 - t1) / 60`.",
      "Autres correspondances : `EOMONTH(d)` = `(date_trunc('month', d) + interval '1 month - 1 day')::date`, `DATEFROMPARTS(a, m, j)` = `make_date(a, m, j)`, `FORMAT(d, 'dd/MM/yyyy')` = `to_char(d, 'DD/MM/YYYY')`, `CONVERT(date, '15/10/2026', 103)` = `to_date('15/10/2026', 'DD/MM/YYYY')`.",
      "Timestamp Unix (secondes depuis 1970) : `to_timestamp(1792051200)` donne un timestamptz ; dans l'autre sens, `extract(epoch FROM col)`.",
      "`ISDATE(s)` = `pg_input_is_valid(s, 'date')` (PostgreSQL 16+). Tableau complet des équivalences SQL Server → PostgreSQL : page Cheatsheet.",
    ],
  },
  'AGE / fin de mois': {
    text: [
      "age(t) avec un seul argument compte depuis minuit aujourd'hui : `age(date '1990-03-02')` = âge actuel.",
      "Pour un nombre entier d'années (âge, ancienneté) : `extract(year FROM age(fin, début))`.",
      "Ajouter puis retirer un mois ne ramène pas toujours au point de départ : 31/01 + 1 mois = 28/02, puis 28/02 - 1 mois = 28/01.",
      "`make_timestamptz(2026, 10, 15, 8, 30, 0, 'Europe/Paris')` construit un instant précis dans un fuseau donné.",
    ],
  },
  GENERATE_SERIES: {
    text: [
      "Avec des entiers : `generate_series(1, 10)` ; avec un pas : `generate_series(0, 100, 10)` ; avec des dates : un pas de type interval obligatoire.",
      "C'est une fonction qui renvoie une table : elle s'utilise dans le FROM, comme une table, et on lui donne un alias (`… d`).",
      "Patterns : calendrier sans trous (LEFT JOIN des données dessus), grille magasin × jour (avec CROSS JOIN), création de données de test (le kit entier est généré ainsi).",
    ],
  },
  'RANK / DENSE_RANK': {
    text: [
      "Choisir selon la question : « les 3 premiers, ex aequo compris » → rank ou dense_rank ; « exactement 3 lignes » → row_number.",
      "Avec rank, un top 3 peut renvoyer plus de 3 lignes (deux 3es ex aequo), et le rang suivant saute.",
      "`percent_rank()` et `ntile(4)` (quartiles) existent aussi pour classer en tranches.",
    ],
  },
  'LAG / LEAD': {
    text: [
      "`lag(col, n, défaut)` : la valeur n lignes avant (1 par défaut), et la valeur à utiliser s'il n'y a pas de ligne précédente (NULL par défaut).",
      "L'ORDER BY du OVER est essentiel : il définit ce que « précédent » veut dire. Avec PARTITION BY, on repart de zéro à chaque groupe (le 1er de chaque magasin n'a pas de précédent).",
      "Usages : évolution d'une semaine à l'autre, délai entre deux passages d'un flux (`debut - lag(debut) OVER (…)`) pour détecter un passage manquant, détection de trous dans une numérotation.",
    ],
    sql: `-- Écart entre deux passages successifs du flux VENTES de Mérignac (normalement 1 jour)\nSELECT debut, debut - lag(debut) OVER (ORDER BY debut) AS ecart\nFROM imports_log WHERE flux = 'VENTES' AND magasin_id = 1\nORDER BY debut LIMIT 6;`,
  },
  'Cadre (ROWS BETWEEN)': {
    text: [
      "Bornes possibles : `UNBOUNDED PRECEDING` (début de la partition), `n PRECEDING`, `CURRENT ROW`, `n FOLLOWING`, `UNBOUNDED FOLLOWING` (fin de la partition).",
      "ROWS compte des lignes ; RANGE raisonne sur la valeur du tri (les ex aequo forment un bloc) ; GROUPS compte des groupes d'ex aequo. RANGE accepte aussi un écart de valeur : `RANGE BETWEEN interval '6 days' PRECEDING AND CURRENT ROW` = les 7 derniers jours calendaires, même s'il manque des jours.",
      "Avec ROWS, une moyenne « 7 jours » suppose une ligne par jour : s'il manque des jours, elle couvre plus de 7 jours. Combler d'abord les trous avec generate_series, ou utiliser RANGE avec un interval.",
      "Sans ORDER BY dans le OVER, le cadre est toute la partition : `sum(x) OVER (PARTITION BY g)` donne le total du groupe, pas un cumul.",
      "first_value / last_value suivent le cadre : avec le cadre par défaut, last_value renvoie la ligne courante (ou son dernier ex aequo), pas la dernière de la partition. Écrire `ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING`.",
    ],
    sql: `-- RANGE (défaut) et ROWS diffèrent sur les ex aequo (j = 2)\nSELECT j, v,\n       sum(v) OVER (ORDER BY j) AS cumul_range,\n       sum(v) OVER (ORDER BY j, v ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS cumul_rows\nFROM (VALUES (1, 10), (2, 5), (2, 7), (3, 1)) t(j, v)\nORDER BY j, v;`,
  },
  NTILE: {
    text: [
      "Si le nombre de lignes ne se divise pas juste, les premiers paquets ont une ligne de plus (5 lignes en 2 : 3 puis 2).",
      "Combiné à un GROUP BY : `ntile(4) OVER (ORDER BY sum(total_ttc) DESC)`, la fenêtre s'applique après l'agrégation, comme pour la part du total.",
      "Pour garder seulement le premier quart, filtrer dans une sous-requête : `WHERE quartile = 1` (pas de filtre direct sur une fenêtre, voir QUALIFY dans le tableau SQL Server → PostgreSQL).",
    ],
  },
  'PERCENTILE_CONT (médiane)': {
    text: [
      "percentile_cont interpole entre les deux valeurs du milieu (10, 20, 30, 100 → 25) ; percentile_disc renvoie une valeur qui existe vraiment dans les données (20).",
      "Plusieurs seuils d'un coup : `percentile_cont(ARRAY[0.25, 0.5, 0.75]) WITHIN GROUP (ORDER BY x)` renvoie un tableau (quartiles).",
      "La valeur la plus fréquente : `mode() WITHIN GROUP (ORDER BY x)`.",
      "Médiane et moyenne très différentes = quelques valeurs extrêmes tirent la moyenne. Dans le kit, le panier médian (≈ 67 €) est sous le panier moyen (≈ 72 €) : quelques gros tickets tirent la moyenne vers le haut.",
    ],
  },
  FIRST_VALUE: {
    text: [
      "first_value donne la première valeur de la partition selon l'ORDER BY, recopiée sur chaque ligne : chaque carte voit « la carte à garder » de son groupe (ticket T11).",
      "`last_value` est piégeux : par défaut la fenêtre s'arrête à la ligne courante, donc last_value renvoie… la ligne courante. Préférer `first_value(…) OVER (… ORDER BY x DESC)`.",
    ],
  },
  'Sous-requête': {
    text: [
      "Trois formes. Scalaire : renvoie une seule valeur, utilisable comme un nombre (`WHERE prix > (SELECT avg(prix) …)`). Liste : utilisée avec IN / EXISTS. Table : dans le FROM, avec un alias obligatoire.",
      "Une sous-requête scalaire qui renvoie plusieurs lignes provoque l'erreur « more than one row returned by a subquery used as an expression ».",
      "Corrélée : elle fait référence à la requête extérieure (`WHERE l.produit_id = p.id`). Elle est logiquement rejouée pour chaque ligne : pratique, mais à surveiller sur de gros volumes.",
      "Quand les sous-requêtes s'imbriquent sur plusieurs niveaux, passer à des CTE (WITH) : même logique, beaucoup plus lisible.",
    ],
  },
  'UNION / UNION ALL': {
    text: [
      "Les requêtes empilées doivent avoir le même nombre de colonnes, de types compatibles. Les noms de colonnes viennent de la première requête.",
      "UNION supprime les doublons (ce qui demande un tri) ; UNION ALL garde tout et est plus rapide. Par défaut, utiliser UNION ALL, sauf besoin explicite de dédoublonner.",
      "Le ORDER BY final s'applique au résultat global ; pour trier une partie seulement, la mettre entre parenthèses.",
      "Usage support : un petit tableau de bord « une ligne par contrôle » (nb de stocks négatifs, nb de flux en erreur, nb de lignes orphelines…) avec un UNION ALL de comptages.",
    ],
    sql: `SELECT 'stocks négatifs' AS controle, count(*) FROM stocks WHERE qte < 0\nUNION ALL SELECT 'flux en erreur', count(*) FROM imports_log WHERE statut = 'ERREUR'\nUNION ALL SELECT 'lignes sans produit', count(*) FROM lignes_ticket WHERE produit_id IS NULL\nUNION ALL SELECT 'EAN en double', count(*) FROM (SELECT ean FROM produits GROUP BY ean HAVING count(*) > 1) x;`,
  },
  'EXCEPT / INTERSECT': {
    text: [
      "EXCEPT = « ce qui est dans A mais pas dans B », sur des lignes entières. Pratique pour comparer deux listes de codes (fichier reçu contre référentiel).",
      "Comme UNION, ils suppriment les doublons ; EXCEPT ALL et INTERSECT ALL les conservent.",
      "Contrairement à NOT IN, EXCEPT traite les NULL comme égaux entre eux : pas de piège.",
    ],
  },
  INSERT: {
    text: [
      "Toujours lister les colonnes : `INSERT INTO t (c1, c2) VALUES …`. Sans liste, l'ordre doit correspondre exactement à celui de la table, ce qui casse au premier ajout de colonne.",
      "Les colonnes non listées prennent leur valeur DEFAULT (ou NULL). Un id serial est généré automatiquement : ne pas le fournir.",
      "`INSERT … SELECT` intègre des données en masse depuis une autre table (staging → table définitive, ticket T12), avec les filtres et conversions dans le SELECT.",
      "`ON CONFLICT (cle) DO NOTHING` ou `DO UPDATE SET …` évite l'erreur de doublon de clé (le « duplicate key » du ticket T07) en ignorant ou en mettant à jour la ligne existante.",
    ],
  },
  DELETE: {
    text: [
      "Même méthode que l'UPDATE : écrire le SELECT, vérifier, puis remplacer `SELECT *` par `DELETE`. Dans une transaction, avec RETURNING.",
      "Une clé étrangère peut bloquer la suppression (« violates foreign key constraint ») : des lignes d'autres tables dépendent de celle-ci. C'est une protection : ne pas la contourner sans comprendre.",
      "Sans clé étrangère (comme lignes_ticket ici), supprimer un produit laisse des lignes orphelines. C'est exactement l'anomalie du ticket T15.",
      "`TRUNCATE table` vide une table entière, très vite et sans RETURNING : réservé aux tables de travail (staging).",
    ],
  },
  'ON CONFLICT (upsert)': {
    text: [
      "Cas typique : un batch qui recharge les stocks (le magasin 3 du kit, figé depuis le 21/10) doit mettre à jour les lignes existantes et créer les nouvelles en une seule commande, sans planter sur les doublons.",
      "`DO UPDATE … WHERE` met à jour seulement sous condition : `DO UPDATE SET qte = EXCLUDED.qte WHERE stocks.maj_le < EXCLUDED.maj_le` (ne pas écraser une valeur plus récente).",
      "`(xmax = 0) AS insere` dans le RETURNING est une astuce courante pour savoir si chaque ligne a été insérée (true) ou mise à jour (false).",
      "Une même commande ne peut pas toucher deux fois la même clé : deux lignes VALUES avec la même clé donnent « ON CONFLICT DO UPDATE command cannot affect row a second time ». Dédoublonner la source d'abord (DISTINCT ON).",
      "Équivalent SQL Server : MERGE. PostgreSQL a aussi MERGE depuis la version 15, mais ON CONFLICT reste la forme la plus courante et la plus sûre en concurrence.",
    ],
  },
  'jsonb : lire (-> / ->>)': {
    text: [
      "Chemin profond : `doc #> '{client,adresse,ville}'` (jsonb) et `doc #>> '{client,adresse,ville}'` (texte). Un tableau s'indexe à partir de 0 : `doc -> 'tags' ->> 0`.",
      "Une clé absente donne NULL, pas une erreur : penser à coalesce.",
      "json ou jsonb ? json garde le texte tel quel (espaces, clés en double, ordre). jsonb le décompose : clés dédoublonnées (la dernière gagne), ordre des clés non conservé, mais il est indexable et plus rapide à interroger. Choisir jsonb sauf besoin de garder le texte exact.",
      "Pour aplatir un objet en colonnes : `jsonb_to_record(doc) AS x(nom text, total numeric)`.",
    ],
  },
  'jsonb : chercher (@> / ?)': {
    text: [
      "Autres opérateurs : `?|` (au moins une des clés), `?&` (toutes les clés). `jsonb_path_exists(doc, '$.tags[*] ? (@ == \"promo\")')` pour des conditions plus fines (JSONPath).",
      "Index : `CREATE INDEX ON t USING gin (doc)` accélère @>, ?, ?| et ?&. Pour une seule clé souvent filtrée, un index sur l'expression : `CREATE INDEX ON t ((doc ->> 'statut'))`.",
      "Compter les tags : `SELECT tag, count(*) FROM t, jsonb_array_elements_text(t.doc -> 'tags') AS tag GROUP BY tag`.",
    ],
  },
  'jsonb : fabriquer et modifier': {
    text: [
      "to_jsonb(ligne) sert à garder une photo complète d'une ligne avant correction (colonne avant jsonb du journal de modifications).",
      "jsonb_set(doc, chemin, valeur) remplace une valeur ; la valeur est elle-même du jsonb : `jsonb_set(doc, '{statut}', '\"OK\"')` (guillemets JSON autour du texte), ou `to_jsonb('OK'::text)`.",
      "`jsonb_pretty(doc)` affiche le document indenté, plus lisible pour un gros JSON.",
      "Côté API : `SELECT jsonb_agg(t) FROM (SELECT …) t` renvoie tout un résultat en un seul tableau JSON.",
    ],
  },
  RETURNING: {
    text: [
      "RETURNING transforme un UPDATE / INSERT / DELETE en requête qui renvoie des lignes : on voit immédiatement ce qui a été touché, et combien.",
      "Pour garder une trace durable, on peut l'utiliser dans une CTE : `WITH maj AS (UPDATE … RETURNING *) INSERT INTO journal SELECT * FROM maj`.",
      "Après un INSERT, `RETURNING id` donne l'identifiant généré.",
    ],
    sql: `BEGIN;\nUPDATE stocks SET qte = 0 WHERE qte < 0 RETURNING magasin_id, produit_id, qte;\nROLLBACK;`,
  },
  'CREATE TABLE … AS': {
    text: [
      "La table créée reçoit les colonnes et les données du SELECT, mais pas les clés, index ni contraintes de la table d'origine.",
      "TEMP : visible seulement par ma session, supprimée à la déconnexion. Idéal pour des étapes de travail (table de correspondance doublon → original au ticket T05).",
      "Sauvegarde avant correction : nommer la table avec le ticket et la date (`sauvegarde_inc4521_20261025`) pour pouvoir restaurer : `UPDATE … FROM sauvegarde …`.",
    ],
  },
  'CREATE INDEX': {
    text: [
      "Un index aide quand la requête cherche peu de lignes parmi beaucoup (filtre sélectif, jointure, tri avec LIMIT). Il ne sert à rien si on lit la moitié de la table.",
      "Index multi-colonnes : `(magasin_id, date_ticket)` sert pour un filtre sur magasin_id seul, ou magasin_id + date, mais pas pour date seule. L'ordre des colonnes compte.",
      "Index unique : `CREATE UNIQUE INDEX ON produits (ean)` empêcherait les doublons d'EAN (cause du ticket T05). Index partiel : `… WHERE actif` (uniquement les fiches actives).",
      "Coût : chaque index ralentit les INSERT / UPDATE et prend de la place. On en crée pour une raison mesurée (plan avant / après), pas « au cas où ».",
    ],
  },
  'Aide intégrée (\\h, \\?, \\df)': {
    text: [
      "Documentation officielle : https://www.postgresql.org/docs/current/ (remplacer current par 18 pour une version précise). Les pages les plus utiles : « Functions and Operators » (chapitre 9, avec « Date/Time Functions »), et « SQL Commands » pour la syntaxe complète de chaque commande.",
      "Dans un terminal, `man psql` (si le client est installé) documente psql lui-même. `psql --help` donne les options de connexion.",
      "Autres méta-commandes psql : `\\d table` (structure), `\\dt` (tables), `\\di` (index), `\\dn` (schémas), `\\dT` (types), `\\sf fonction` (code source d'une fonction), `\\x` (affichage vertical des lignes larges), `\\timing` (durée de chaque requête).",
      "Ajouter `+` donne plus de détails : `\\df+ to_char`, `\\d+ tickets_caisse` (taille, commentaires, stockage).",
    ],
  },
  pg_stat_statements: {
    text: [
      "Trier par total_exec_time (ce qui charge le plus le serveur au total) ou par mean_exec_time (les requêtes individuellement lentes). Une requête rapide appelée 1 million de fois peut coûter plus qu'une lente appelée 3 fois.",
      "Colonnes utiles : calls, total_exec_time et mean_exec_time (en ms), rows, shared_blks_hit / shared_blks_read (cache contre disque). Avant PostgreSQL 13 : total_time et mean_time.",
      "Les compteurs s'accumulent depuis la dernière remise à zéro : `SELECT pg_stat_statements_reset();` avant de mesurer une période précise.",
      "Sans le rôle pg_read_all_stats, on ne voit le texte que de ses propres requêtes (les autres affichent <insufficient privilege>).",
      "Sur un service géré : régler shared_preload_libraries dans la configuration du serveur, redémarrer, puis CREATE EXTENSION en superutilisateur.",
    ],
  },
  'Version du serveur': {
    text: [
      "Comparer dans une requête : `current_setting('server_version_num')::int >= 160000` = PostgreSQL 16 ou plus.",
      "Repères : 14 = `string_to_table`, 15 = `MERGE`, 16 = `pg_input_is_valid` (équivalent de ISDATE / TRY_CAST), 17 = `JSON_TABLE`, 18 = `uuidv7()` et `RETURNING old.* / new.*`.",
      "Une version mineure (18.5 → 18.6) ne contient que des correctifs : même format de données, simple redémarrage. Une version majeure (16 → 18) demande pg_upgrade ou un export / import.",
    ],
  },
  pg_stat_activity: {
    text: [
      "Une ligne par connexion. Colonnes clés : pid (identifiant), usename, application_name, state (active, idle, idle in transaction), query_start, xact_start, wait_event_type (Lock = attend un verrou), query.",
      "Signes d'incident : beaucoup de sessions `active` depuis longtemps (requête lente ou bloquée), `wait_event_type = 'Lock'` (blocage), `idle in transaction` ancien (transaction oubliée qui garde des verrous).",
      "Remonter le pid bloquant (`pg_blocking_pids(pid)`) et sa requête à l'équipe technique. Tuer une session (`pg_terminate_backend`) se fait seulement avec leur accord : on peut interrompre un traitement métier en cours.",
    ],
    sql: `SELECT pid, state, wait_event_type, now() - xact_start AS transaction_depuis, left(query, 60) AS requete\nFROM pg_stat_activity WHERE datname = current_database();`,
  },
}
