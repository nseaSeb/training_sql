/**
 * Exercices courts corrigés automatiquement : le serveur exécute la réponse et la solution
 * chacune dans une transaction annulée, puis compare les résultats (voir server/check.ts).
 *
 * - Sans `check` : on compare le dernier résultat de la réponse et de la solution.
 * - Avec `check` (DML, DDL) : on compare le résultat de `check` exécuté après chacune.
 *
 * Règles d'écriture : l'énoncé donne les colonnes attendues dans l'ordre et l'arrondi ;
 * `ordered` seulement si l'ORDER BY de la solution est un ordre total (clé unique) ;
 * rien de non déterministe (now(), random(), id générés) dans une solution ou un check.
 */
export type Level = 1 | 2 | 3

export type Exercise = {
  id: string
  level: Level
  theme: string
  title: string
  /** Énoncé en Markdown */
  prompt: string
  starter?: string
  solution: string
  check?: string
  ordered?: boolean
  hints: string[]
  /** Autres bases où l'exercice est corrigé : true = même solution, sinon la solution écrite pour cette base. */
  engines?: Partial<Record<'sqlite' | 'mysql', true | string>>
}

export type ExerciseEngine = 'pg' | 'sqlite' | 'mysql'

/** Solution de référence pour une base, ou null si l'exercice n'y est pas corrigé. */
export function solutionFor(ex: Exercise, engine: ExerciseEngine): string | null {
  if (engine === 'pg') return ex.solution
  const v = ex.engines?.[engine]
  return v === undefined ? null : v === true ? ex.solution : v
}

export const levels: Record<Level, string> = { 1: 'Débutant', 2: 'Intermédiaire', 3: 'Avancé' }

export const exercises: Exercise[] = [
  {
    id: 'E01',
    level: 1,
    theme: 'SELECT et WHERE',
    title: 'Les magasins ouverts',
    prompt: 'Liste les magasins **actifs**.\n\nColonnes attendues : `code`, `nom`, `ville`, triées par `code`.',
    starter: 'SELECT * FROM magasins;',
    solution: 'SELECT code, nom, ville\nFROM magasins\nWHERE actif\nORDER BY code;',
    ordered: true,
    engines: { sqlite: true, mysql: true },
    hints: ['La colonne `actif` est un booléen : `WHERE actif` suffit.', 'Le tri se fait avec `ORDER BY code`.'],
  },
  {
    id: 'E02',
    level: 1,
    theme: 'GROUP BY',
    title: 'Produits par rayon',
    prompt: 'Combien de produits compte chaque rayon ?\n\nColonnes attendues : `rayon`, `nb_produits`.',
    starter: 'SELECT rayon FROM produits LIMIT 10;',
    solution: 'SELECT rayon, count(*) AS nb_produits\nFROM produits\nGROUP BY rayon;',
    engines: { sqlite: true, mysql: true },
    hints: ['Une ligne par rayon : `GROUP BY rayon`.', '`count(*)` compte les lignes de chaque groupe.'],
  },
  {
    id: 'E03',
    level: 2,
    theme: 'Jointures',
    title: "Chiffre d'affaires d'octobre par magasin",
    prompt:
      "Calcule le chiffre d'affaires TTC d'**octobre 2026** de chaque magasin, à partir des tickets **validés** (`statut = 'VALIDE'`).\n\nColonnes attendues : `nom` du magasin, `ca_ttc` (somme de `total_ttc`).\n\nAttention aux bornes de dates : `date_ticket` est un horodatage.",
    starter: 'SELECT * FROM tickets_caisse LIMIT 5;',
    solution:
      "SELECT m.nom, sum(t.total_ttc) AS ca_ttc\nFROM tickets_caisse t\nJOIN magasins m ON m.id = t.magasin_id\nWHERE t.statut = 'VALIDE'\n  AND t.date_ticket >= date '2026-10-01'\n  AND t.date_ticket <  date '2026-11-01'\nGROUP BY m.nom;",
    engines: { sqlite: "SELECT m.nom, sum(t.total_ttc) AS ca_ttc\nFROM tickets_caisse t\nJOIN magasins m ON m.id = t.magasin_id\nWHERE t.statut = 'VALIDE'\n  AND t.date_ticket >= '2026-10-01'\n  AND t.date_ticket <  '2026-11-01'\nGROUP BY m.nom;", mysql: "SELECT m.nom, sum(t.total_ttc) AS ca_ttc\nFROM tickets_caisse t\nJOIN magasins m ON m.id = t.magasin_id\nWHERE t.statut = 'VALIDE'\n  AND t.date_ticket >= '2026-10-01'\n  AND t.date_ticket <  '2026-11-01'\nGROUP BY m.nom;" },
    hints: [
      'Joins `tickets_caisse` à `magasins` sur `magasins.id = tickets_caisse.magasin_id`.',
      "Bornes demi-ouvertes : `>= date '2026-10-01'` et `< date '2026-11-01'`. Un `BETWEEN … AND '2026-10-31'` perdrait la journée du 31 après minuit.",
    ],
  },
  {
    id: 'E04',
    level: 2,
    theme: 'UPDATE',
    title: 'Désactiver les produits jamais vendus',
    prompt:
      "Passe à `actif = false` les produits qui n'apparaissent dans **aucune** ligne de ticket.\n\nLa correction regarde ensuite la liste des produits inactifs. Ta modification est annulée après la vérification : la base n'est pas touchée.",
    starter: 'SELECT count(*) FROM produits WHERE actif;',
    solution: 'UPDATE produits p\nSET actif = false\nWHERE NOT EXISTS (\n  SELECT 1 FROM lignes_ticket l WHERE l.produit_id = p.id\n);',
    check: 'SELECT id FROM produits WHERE NOT actif',
    engines: { sqlite: "UPDATE produits AS p\nSET actif = false\nWHERE NOT EXISTS (\n  SELECT 1 FROM lignes_ticket l WHERE l.produit_id = p.id\n);", mysql: true },
    hints: [
      "Teste d'abord avec un SELECT : quels produits n'ont aucune ligne de ticket ?",
      '`lignes_ticket.produit_id` contient des NULL : `NOT IN (SELECT produit_id …)` ne renverrait rien. Utilise `NOT EXISTS`.',
    ],
  },
  {
    id: 'E05',
    level: 3,
    theme: 'Fonctions de fenêtre',
    title: 'Le produit star de chaque magasin',
    prompt:
      "Pour chaque magasin, trouve le produit vendu en **plus grande quantité** (somme de `qte` sur les tickets validés). En cas d'égalité, garde le plus petit `produit_id`.\n\nColonnes attendues : `magasin_id`, `produit_id`, `qte_totale`.",
    starter: 'SELECT t.magasin_id, l.produit_id, l.qte\nFROM lignes_ticket l\nJOIN tickets_caisse t ON t.id = l.ticket_id\nLIMIT 10;',
    solution:
      "WITH ventes AS (\n  SELECT t.magasin_id, l.produit_id, sum(l.qte) AS qte_totale\n  FROM lignes_ticket l\n  JOIN tickets_caisse t ON t.id = l.ticket_id\n  WHERE t.statut = 'VALIDE' AND l.produit_id IS NOT NULL\n  GROUP BY t.magasin_id, l.produit_id\n), classees AS (\n  SELECT *, row_number() OVER (PARTITION BY magasin_id ORDER BY qte_totale DESC, produit_id) AS rang\n  FROM ventes\n)\nSELECT magasin_id, produit_id, qte_totale\nFROM classees\nWHERE rang = 1;",
    engines: { sqlite: true, mysql: true },
    hints: [
      "Commence par la quantité vendue par magasin et produit (une CTE avec GROUP BY). Écarte les lignes sans produit (`produit_id IS NULL`).",
      '`row_number() OVER (PARTITION BY magasin_id ORDER BY qte_totale DESC, produit_id)` numérote les produits de chaque magasin.',
      'Garde le rang 1 dans une requête englobante : on ne peut pas filtrer une fonction de fenêtre dans le WHERE.',
    ],
  },
  {
    id: 'E06',
    level: 3,
    theme: 'CREATE TABLE',
    title: 'Une table des retours',
    prompt:
      "Crée la table `retours` :\n\n- `id` : entier généré automatiquement, clé primaire ;\n- `ticket_id` : `bigint`, obligatoire, référence `tickets_caisse` ;\n- `motif` : texte obligatoire ;\n- `montant` : `numeric(10,2)` obligatoire, strictement positif ;\n- `cree_le` : `timestamptz` obligatoire, par défaut l'instant courant.\n\nLa correction compare les colonnes, leurs types, leur caractère obligatoire et les types de contraintes. La table est supprimée après la vérification.",
    solution:
      'CREATE TABLE retours (\n  id        int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,\n  ticket_id bigint NOT NULL REFERENCES tickets_caisse (id),\n  motif     text NOT NULL,\n  montant   numeric(10,2) NOT NULL CHECK (montant > 0),\n  cree_le   timestamptz NOT NULL DEFAULT now()\n);',
    check:
      "SELECT 'colonne' AS genre, column_name || ' ' || data_type || coalesce('(' || numeric_precision || ',' || numeric_scale || ')', '') || ' ' || is_nullable AS detail\nFROM information_schema.columns\nWHERE table_schema = 'retail' AND table_name = 'retours'\nUNION ALL\nSELECT 'contrainte', contype::text\nFROM pg_constraint\nWHERE conrelid = to_regclass('retail.retours')",
    hints: [
      "`int GENERATED ALWAYS AS IDENTITY` est la forme standard (préférée à `serial`).",
      'Une clé étrangère : `REFERENCES tickets_caisse (id)`. Un contrôle : `CHECK (montant > 0)`.',
      "Pour la valeur par défaut : `DEFAULT now()`.",
    ],
  },
  {
    id: 'E07',
    level: 1,
    theme: 'ORDER BY et LIMIT',
    title: 'Les 5 produits les plus chers',
    prompt: "Affiche les 5 produits au prix TTC le plus élevé, du plus cher au moins cher. En cas d'égalité de prix, le plus petit `id` d'abord.\n\nColonnes attendues : `libelle`, `prix_ttc`.",
    starter: 'SELECT libelle, prix_ttc FROM produits;',
    solution: 'SELECT libelle, prix_ttc\nFROM produits\nORDER BY prix_ttc DESC, id\nLIMIT 5;',
    ordered: true,
    engines: { sqlite: true, mysql: true },
    hints: ['`ORDER BY prix_ttc DESC` trie du plus cher au moins cher.', "Ajoute `id` comme second critère de tri pour départager les égalités, puis `LIMIT 5`."],
  },
  {
    id: 'E08',
    level: 1,
    theme: 'NULL',
    title: 'Clients sans email',
    prompt: "Combien de clients fidélité n'ont **pas** d'adresse email ?\n\nColonne attendue : `nb_sans_email`.",
    starter: 'SELECT nom, prenom, email FROM clients_fidelite LIMIT 20;',
    solution: 'SELECT count(*) AS nb_sans_email\nFROM clients_fidelite\nWHERE email IS NULL;',
    engines: { sqlite: true, mysql: true },
    hints: ["`email = NULL` ne renvoie jamais rien : une comparaison avec NULL donne NULL, pas vrai.", 'Utilise `WHERE email IS NULL`.'],
  },
  {
    id: 'E09',
    level: 1,
    theme: 'LIKE et ILIKE',
    title: 'Les produits bio',
    prompt: 'Liste les produits dont le libellé contient « bio », quelle que soit la casse (Bio, BIO, bio…).\n\nColonnes attendues : `id`, `libelle`.',
    starter: "SELECT id, libelle FROM produits WHERE libelle LIKE '%bio%';",
    solution: "SELECT id, libelle\nFROM produits\nWHERE libelle ILIKE '%bio%';",
    hints: ['`LIKE` est sensible à la casse : `%bio%` ne trouve pas « Bio ».', '`ILIKE` est la version insensible à la casse de PostgreSQL (ailleurs : `lower(libelle) LIKE`).'],
  },
  {
    id: 'E10',
    level: 1,
    theme: 'DISTINCT',
    title: 'Les flux qui ont planté',
    prompt: "Quels flux (`imports_log.flux`) ont eu au moins un passage en `ERREUR` ? Chaque flux une seule fois.\n\nColonne attendue : `flux`.",
    starter: 'SELECT flux, statut FROM imports_log LIMIT 20;',
    solution: "SELECT DISTINCT flux\nFROM imports_log\nWHERE statut = 'ERREUR';",
    engines: { sqlite: true, mysql: true },
    hints: ['Filtre sur `statut = \'ERREUR\'`.', '`SELECT DISTINCT flux` supprime les doublons.'],
  },
  {
    id: 'E11',
    level: 1,
    theme: 'INSERT',
    title: 'Ouvrir un nouveau magasin',
    prompt: "Ajoute le magasin `6`, code `M052`, nom `Hyper Dax`, ville `Dax`. Laisse `actif` prendre sa valeur par défaut.\n\nLa correction relit ensuite toute la table `magasins`.",
    starter: 'SELECT * FROM magasins;',
    solution: "INSERT INTO magasins (id, code, nom, ville)\nVALUES (6, 'M052', 'Hyper Dax', 'Dax');",
    check: 'SELECT id, code, nom, ville, actif FROM magasins',
    engines: { sqlite: true, mysql: true },
    hints: ['Nomme les colonnes : `INSERT INTO magasins (id, code, nom, ville) VALUES (…)`.', 'Une colonne non citée prend sa valeur `DEFAULT` (ici `true`).'],
  },
  {
    id: 'E12',
    level: 2,
    theme: 'LEFT JOIN',
    title: 'Ventes par produit, sans en oublier',
    prompt: "Pour les produits d'`id` 375 à 385, compte leurs lignes de ticket. **Tous** ces produits doivent apparaître, y compris ceux jamais vendus (avec 0).\n\nColonnes attendues : `id`, `libelle`, `nb_lignes`.",
    starter: 'SELECT produit_id, count(*) FROM lignes_ticket WHERE produit_id BETWEEN 375 AND 385 GROUP BY produit_id;',
    solution: 'SELECT p.id, p.libelle, count(l.id) AS nb_lignes\nFROM produits p\nLEFT JOIN lignes_ticket l ON l.produit_id = p.id\nWHERE p.id BETWEEN 375 AND 385\nGROUP BY p.id, p.libelle;',
    engines: { sqlite: true, mysql: true },
    hints: ['Pars de `produits` (à gauche) et fais un `LEFT JOIN` vers `lignes_ticket` : un JOIN simple ferait disparaître les produits jamais vendus.', "`count(*)` compterait 1 pour un produit jamais vendu (la ligne de NULL ajoutée par le LEFT JOIN) : compte `count(l.id)`."],
  },
  {
    id: 'E13',
    level: 2,
    theme: 'HAVING',
    title: 'Les rayons chers',
    prompt: "Quels rayons ont un prix TTC moyen **strictement supérieur** à 10,50 € ?\n\nColonnes attendues : `rayon`, `prix_moyen` arrondi à 2 décimales.",
    starter: 'SELECT rayon, avg(prix_ttc) FROM produits GROUP BY rayon;',
    solution: 'SELECT rayon, round(avg(prix_ttc), 2) AS prix_moyen\nFROM produits\nGROUP BY rayon\nHAVING avg(prix_ttc) > 10.50;',
    engines: { sqlite: true, mysql: true },
    hints: ["Le `WHERE` filtre les lignes avant le regroupement : il ne voit pas `avg()`. Filtre après avec `HAVING`.", 'Compare la moyenne non arrondie : un rayon à 10,504 € arrondi à 10,50 ne doit pas passer.'],
  },
  {
    id: 'E14',
    level: 2,
    theme: 'CASE',
    title: 'Tranches de prix',
    prompt: "Répartis les produits en trois tranches de prix TTC et compte-les :\n\n- `moins de 5 €` (prix < 5)\n- `5 à 10 €` (5 ≤ prix < 10)\n- `10 € et plus`\n\nColonnes attendues : `tranche` (exactement ces libellés), `nb_produits`.",
    solution: "SELECT CASE\n         WHEN prix_ttc < 5  THEN 'moins de 5 €'\n         WHEN prix_ttc < 10 THEN '5 à 10 €'\n         ELSE '10 € et plus'\n       END AS tranche,\n       count(*) AS nb_produits\nFROM produits\nGROUP BY 1;",
    engines: { sqlite: true, mysql: true },
    hints: ['`CASE WHEN … THEN … ELSE … END` calcule la tranche de chaque produit.', 'Les WHEN sont testés dans l\'ordre : le deuxième n\'a pas besoin de répéter `prix_ttc >= 5`.', '`GROUP BY 1` regroupe sur la première colonne du SELECT.'],
  },
  {
    id: 'E15',
    level: 2,
    theme: 'Dates',
    title: 'Affluence par jour de la semaine',
    prompt: "Combien de tickets validés par jour de la semaine, tous magasins confondus ? Numérote les jours de 1 (lundi) à 7 (dimanche).\n\nColonnes attendues : `jour` (1 à 7), `nb_tickets`.",
    starter: "SELECT date_ticket, to_char(date_ticket, 'Day') FROM tickets_caisse LIMIT 10;",
    solution: "SELECT extract(isodow FROM date_ticket) AS jour, count(*) AS nb_tickets\nFROM tickets_caisse\nWHERE statut = 'VALIDE'\nGROUP BY 1;",
    engines: { sqlite: "SELECT CAST(strftime('%u', date_ticket) AS integer) AS jour, count(*) AS nb_tickets\nFROM tickets_caisse\nWHERE statut = 'VALIDE'\nGROUP BY 1;", mysql: "SELECT WEEKDAY(date_ticket) + 1 AS jour, count(*) AS nb_tickets\nFROM tickets_caisse\nWHERE statut = 'VALIDE'\nGROUP BY 1;" },
    hints: ["`extract(dow …)` numérote de 0 (dimanche) à 6 ; `extract(isodow …)` de 1 (lundi) à 7 (dimanche).", "L'heure est lue dans le fuseau de la session (Europe/Paris ici) : un ticket à 0h30 compte pour le bon jour."],
  },
  {
    id: 'E16',
    level: 2,
    theme: 'DELETE',
    title: 'Nettoyer un import',
    prompt: "Dans `import_produits_staging`, supprime les lignes dont l'EAN est absent ou ne fait pas **exactement 13 chiffres**.\n\nLa correction relit ensuite les `num_ligne` restants.",
    starter: 'SELECT * FROM import_produits_staging;',
    solution: "DELETE FROM import_produits_staging\nWHERE ean IS NULL OR ean !~ '^[0-9]{13}$';",
    check: 'SELECT num_ligne FROM import_produits_staging',
    engines: { sqlite: "DELETE FROM import_produits_staging\nWHERE ean IS NULL OR length(ean) <> 13 OR ean GLOB '*[^0-9]*';", mysql: "DELETE FROM import_produits_staging\nWHERE ean IS NULL OR ean NOT REGEXP '^[0-9]{13}$';" },
    hints: ["Avant un DELETE, écris le SELECT avec le même WHERE et vérifie les lignes visées.", "`~` teste une expression régulière : `ean ~ '^[0-9]{13}$'` vaut vrai pour 13 chiffres exactement.", "`NULL !~ '…'` vaut NULL, pas vrai : ajoute `ean IS NULL OR`."],
  },
  {
    id: 'E17',
    level: 2,
    theme: 'Doublons',
    title: 'Des EAN en double',
    prompt: "Des produits partagent le même EAN (il n'y a pas de contrainte d'unicité). Liste chaque EAN en double avec le nombre de produits et leurs libellés, séparés par ` | `, dans l'ordre des `id`.\n\nColonnes attendues : `ean`, `nb`, `libelles`.",
    solution: "SELECT ean, count(*) AS nb, string_agg(libelle, ' | ' ORDER BY id) AS libelles\nFROM produits\nGROUP BY ean\nHAVING count(*) > 1;",
    engines: { sqlite: "SELECT ean, count(*) AS nb, group_concat(libelle, ' | ' ORDER BY id) AS libelles\nFROM produits\nGROUP BY ean\nHAVING count(*) > 1;", mysql: "SELECT ean, count(*) AS nb, GROUP_CONCAT(libelle ORDER BY id SEPARATOR ' | ') AS libelles\nFROM produits\nGROUP BY ean\nHAVING count(*) > 1;" },
    hints: ['Regroupe par `ean` et garde les groupes de plus d\'une ligne avec `HAVING count(*) > 1`.', "`string_agg(libelle, ' | ' ORDER BY id)` concatène les libellés dans l'ordre demandé."],
  },
  {
    id: 'E18',
    level: 2,
    theme: 'UPSERT',
    title: "Saisir un inventaire",
    prompt:
      "Un inventaire du magasin 3 donne : produit `1` → 42 unités, produit `401` → 15 unités, relevés le `2026-10-25 08:00` (heure de Paris). Le produit 1 a déjà une ligne dans `stocks`, le 401 non.\n\nEn **une seule instruction**, insère ou mets à jour les deux lignes (`qte` et `maj_le`).\n\nLa correction relit les stocks du magasin 3 pour ces produits.",
    starter: 'SELECT * FROM stocks WHERE magasin_id = 3 AND produit_id IN (1, 401);',
    solution:
      "INSERT INTO stocks (magasin_id, produit_id, qte, maj_le)\nVALUES (3, 1, 42, timestamptz '2026-10-25 08:00'),\n       (3, 401, 15, timestamptz '2026-10-25 08:00')\nON CONFLICT (magasin_id, produit_id)\nDO UPDATE SET qte = EXCLUDED.qte, maj_le = EXCLUDED.maj_le;",
    check: 'SELECT magasin_id, produit_id, qte, maj_le FROM stocks WHERE magasin_id = 3 AND produit_id IN (1, 401)',
    engines: { sqlite: "INSERT INTO stocks (magasin_id, produit_id, qte, maj_le)\nVALUES (3, 1, 42, '2026-10-25 08:00:00'),\n       (3, 401, 15, '2026-10-25 08:00:00')\nON CONFLICT (magasin_id, produit_id)\nDO UPDATE SET qte = excluded.qte, maj_le = excluded.maj_le;", mysql: "INSERT INTO stocks (magasin_id, produit_id, qte, maj_le)\nVALUES (3, 1, 42, '2026-10-25 08:00:00'),\n       (3, 401, 15, '2026-10-25 08:00:00') AS n\nON DUPLICATE KEY UPDATE qte = n.qte, maj_le = n.maj_le;" },
    hints: ['`INSERT … ON CONFLICT (clé) DO UPDATE` : insère, ou met à jour si la clé existe déjà.', '`EXCLUDED` désigne la ligne qu\'on tentait d\'insérer : `SET qte = EXCLUDED.qte`.', "L'équivalent ailleurs : `MERGE` (SQL Server, Oracle, PostgreSQL 15+) ou `ON DUPLICATE KEY UPDATE` (MySQL)."],
  },
  {
    id: 'E19',
    level: 3,
    theme: 'generate_series',
    title: 'Les jours sans vente',
    prompt: "Entre le 1er et le 24 octobre 2026 inclus, quels jours le magasin 2 n'a-t-il enregistré **aucun** ticket (quel que soit le statut) ?\n\nColonne attendue : `jour` (type `date`).",
    starter: "SELECT d::date FROM generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d;",
    solution:
      "SELECT d::date AS jour\nFROM generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d\nWHERE NOT EXISTS (\n  SELECT 1 FROM tickets_caisse t\n  WHERE t.magasin_id = 2\n    AND t.date_ticket >= d AND t.date_ticket < d + interval '1 day'\n);",
    engines: { sqlite: "WITH RECURSIVE jours(d) AS (\n  SELECT date('2026-10-01')\n  UNION ALL\n  SELECT date(d, '+1 day') FROM jours WHERE d < '2026-10-24'\n)\nSELECT d AS jour\nFROM jours\nWHERE NOT EXISTS (\n  SELECT 1 FROM tickets_caisse t\n  WHERE t.magasin_id = 2 AND date(t.date_ticket) = d\n);", mysql: "WITH RECURSIVE jours(d) AS (\n  SELECT DATE '2026-10-01'\n  UNION ALL\n  SELECT d + INTERVAL 1 DAY FROM jours WHERE d < '2026-10-24'\n)\nSELECT d AS jour\nFROM jours\nWHERE NOT EXISTS (\n  SELECT 1 FROM tickets_caisse t\n  WHERE t.magasin_id = 2\n    AND t.date_ticket >= d AND t.date_ticket < d + INTERVAL 1 DAY\n);" },
    hints: ["Une requête n'invente pas de lignes : un jour sans ticket n'existe dans aucune table. Fabrique le calendrier avec `generate_series`.", 'Garde les jours pour lesquels `NOT EXISTS` un ticket du magasin 2 dans la journée.', "Bornes du jour : `>= d` et `< d + interval '1 day'`."],
  },
  {
    id: 'E20',
    level: 3,
    theme: 'Fonctions de fenêtre',
    title: "Cumul du chiffre d'affaires",
    prompt:
      "Pour le magasin 1 en octobre 2026 (tickets validés), donne le CA TTC de chaque jour et le cumul depuis le 1er octobre, jour par jour dans l'ordre chronologique.\n\nColonnes attendues : `jour` (type `date`), `ca_jour`, `ca_cumule`.",
    solution:
      "SELECT date_ticket::date AS jour,\n       sum(total_ttc) AS ca_jour,\n       sum(sum(total_ttc)) OVER (ORDER BY date_ticket::date) AS ca_cumule\nFROM tickets_caisse\nWHERE magasin_id = 1 AND statut = 'VALIDE'\n  AND date_ticket >= date '2026-10-01' AND date_ticket < date '2026-11-01'\nGROUP BY 1\nORDER BY 1;",
    ordered: true,
    engines: { sqlite: "SELECT date(date_ticket) AS jour,\n       sum(total_ttc) AS ca_jour,\n       sum(sum(total_ttc)) OVER (ORDER BY date(date_ticket)) AS ca_cumule\nFROM tickets_caisse\nWHERE magasin_id = 1 AND statut = 'VALIDE'\n  AND date_ticket >= '2026-10-01' AND date_ticket < '2026-11-01'\nGROUP BY 1\nORDER BY 1;", mysql: "SELECT DATE(date_ticket) AS jour,\n       sum(total_ttc) AS ca_jour,\n       sum(sum(total_ttc)) OVER (ORDER BY DATE(date_ticket)) AS ca_cumule\nFROM tickets_caisse\nWHERE magasin_id = 1 AND statut = 'VALIDE'\n  AND date_ticket >= '2026-10-01' AND date_ticket < '2026-11-01'\nGROUP BY 1\nORDER BY 1;" },
    hints: ['Commence par le CA par jour (GROUP BY sur `date_ticket::date`).', '`sum(…) OVER (ORDER BY jour)` fait un cumul. On peut l\'appliquer à un agrégat : `sum(sum(total_ttc)) OVER (…)`, ou passer par une CTE.'],
  },
  {
    id: 'E21',
    level: 3,
    theme: 'UPDATE … FROM',
    title: 'Rattraper le batch des stocks',
    prompt:
      "Le batch qui recalcule `stocks` est en échec pour le magasin 3 depuis le 22 octobre. Recalcule `stocks.qte` du magasin 3 : c'est la somme de `mouvements_stock.qte` par produit (les quantités sont signées).\n\nNe touche qu'aux lignes existantes de `stocks`. La correction relit `produit_id, qte` des stocks du magasin 3.",
    starter: 'SELECT * FROM stocks WHERE magasin_id = 3 LIMIT 10;',
    solution:
      "UPDATE stocks s\nSET qte = m.total\nFROM (\n  SELECT produit_id, sum(qte) AS total\n  FROM mouvements_stock\n  WHERE magasin_id = 3\n  GROUP BY produit_id\n) m\nWHERE s.magasin_id = 3 AND s.produit_id = m.produit_id;",
    check: 'SELECT produit_id, qte FROM stocks WHERE magasin_id = 3',
    engines: { sqlite: "UPDATE stocks AS s\nSET qte = m.total\nFROM (\n  SELECT produit_id, sum(qte) AS total\n  FROM mouvements_stock\n  WHERE magasin_id = 3\n  GROUP BY produit_id\n) AS m\nWHERE s.magasin_id = 3 AND s.produit_id = m.produit_id;", mysql: "UPDATE stocks s\nJOIN (\n  SELECT produit_id, sum(qte) AS total\n  FROM mouvements_stock\n  WHERE magasin_id = 3\n  GROUP BY produit_id\n) m ON m.produit_id = s.produit_id\nSET s.qte = m.total\nWHERE s.magasin_id = 3;" },
    hints: ['Calcule d\'abord, dans un SELECT, la somme des mouvements par produit pour le magasin 3.', "PostgreSQL permet `UPDATE … SET … FROM (sous-requête) m WHERE …` pour mettre à jour à partir d'une autre table.", "Sans le filtre `s.magasin_id = 3` dans le WHERE, tous les magasins seraient modifiés."],
  },
  {
    id: 'E22',
    level: 3,
    theme: 'Vues',
    title: "Une vue du CA quotidien",
    prompt:
      "Crée la vue `v_ca_jour` : une ligne par magasin et par jour, avec le CA TTC des tickets validés.\n\nColonnes de la vue, dans cet ordre : `magasin_id`, `jour` (type `date`), `ca_ttc`.\n\nLa correction lit toute la vue. Elle est supprimée après la vérification.",
    solution:
      "CREATE VIEW v_ca_jour AS\nSELECT magasin_id, date_ticket::date AS jour, sum(total_ttc) AS ca_ttc\nFROM tickets_caisse\nWHERE statut = 'VALIDE'\nGROUP BY magasin_id, date_ticket::date;",
    check: 'SELECT * FROM v_ca_jour',
    engines: { sqlite: "CREATE VIEW v_ca_jour AS\nSELECT magasin_id, date(date_ticket) AS jour, sum(total_ttc) AS ca_ttc\nFROM tickets_caisse\nWHERE statut = 'VALIDE'\nGROUP BY magasin_id, date(date_ticket);" },
    hints: ['`CREATE VIEW nom AS SELECT …` : une vue est une requête enregistrée, recalculée à chaque lecture.', "Les colonnes de la vue prennent les noms (alias) du SELECT."],
  },
  {
    id: 'E23',
    level: 3,
    theme: 'Index',
    title: 'Accélérer la recherche par produit',
    prompt:
      "Les recherches de lignes de ticket par produit font un parcours complet de `lignes_ticket` (73 000 lignes). Crée l'index adapté.\n\nLa correction regarde les colonnes indexées de `lignes_ticket` (hors clé primaire). L'index est supprimé après la vérification.",
    starter: 'EXPLAIN SELECT * FROM lignes_ticket WHERE produit_id = 150;',
    solution: 'CREATE INDEX ON lignes_ticket (produit_id);',
    check:
      "SELECT (SELECT string_agg(a.attname, ',' ORDER BY k.ord)\n        FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)\n        JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum) AS colonnes\nFROM pg_index i\nWHERE i.indrelid = 'retail.lignes_ticket'::regclass AND NOT i.indisprimary",
    hints: ['`CREATE INDEX ON table (colonne)` ; le nom est facultatif.', 'Vérifie avec `EXPLAIN` avant et après : `Seq Scan` devient `Bitmap Index Scan` ou `Index Scan`.', "En production, `CREATE INDEX CONCURRENTLY` évite de bloquer les écritures (mais ne peut pas s'exécuter dans une transaction)."],
  },
  {
    id: 'E24',
    level: 3,
    theme: 'CTE',
    title: 'Les meilleurs clients',
    prompt:
      "Classe les clients fidélité par montant total dépensé (tickets validés, rattachés par `tickets_caisse.carte_fidelite = clients_fidelite.num_carte`). Garde les 10 premiers ; en cas d'égalité, le plus petit `num_carte` d'abord.\n\nColonnes attendues : `num_carte`, `nom`, `prenom`, `total_depense`, du plus gros au plus petit.",
    solution:
      "WITH depenses AS (\n  SELECT carte_fidelite, sum(total_ttc) AS total_depense\n  FROM tickets_caisse\n  WHERE statut = 'VALIDE' AND carte_fidelite IS NOT NULL\n  GROUP BY carte_fidelite\n)\nSELECT c.num_carte, c.nom, c.prenom, d.total_depense\nFROM depenses d\nJOIN clients_fidelite c ON c.num_carte = d.carte_fidelite\nORDER BY d.total_depense DESC, c.num_carte\nLIMIT 10;",
    ordered: true,
    engines: { sqlite: true, mysql: true },
    hints: ['Une CTE (`WITH depenses AS (…)`) calcule le total par carte.', 'Joins ensuite les clients, trie, et limite à 10.', "Une carte inconnue de `clients_fidelite` disparaît avec un JOIN : c'est voulu ici."],
  },
]
