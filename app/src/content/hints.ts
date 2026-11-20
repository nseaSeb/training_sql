/** Indices progressifs et notions travaillées pour chaque ticket du kit. */
export const ticketExtras: Record<string, { skills: string[]; starter: string; hints: string[] }> = {
  T01: {
    skills: ['JOIN', 'GROUP BY', 'HAVING'],
    starter: `-- Commence par regarder un ticket et ses lignes
SELECT t.id, t.total_ttc, l.qte, l.prix_unitaire_ttc, l.remise
FROM tickets_caisse t
JOIN lignes_ticket l ON l.ticket_id = t.id
WHERE t.magasin_id = 2 AND t.num_caisse = 7
LIMIT 20;`,
    hints: [
      "Granularité : un ticket a plusieurs lignes. Il faut recalculer le total d'un ticket (une ligne par ticket) à partir de ses lignes.",
      'Joins tickets_caisse et lignes_ticket, GROUP BY t.id, et calcule sum(qte * prix_unitaire_ttc - remise).',
      "Le WHERE ne voit pas les agrégats : pour garder les tickets où total_ttc <> la somme recalculée, utilise HAVING. Ensuite, regroupe le résultat par caisse et par jour pour la réponse.",
      "Campagne de rappel : mets la requête des tickets en écart dans une CTE, joins clients_fidelite sur num_carte = carte_fidelite, puis GROUP BY client avec sum() et string_agg() des numéros de tickets. Compte aussi les tickets sans carte : ce sont les clients à prévenir autrement.",
    ],
  },
  T02: {
    skills: ['NULL', 'NOT IN', 'NOT EXISTS'],
    starter: `SELECT count(*), count(produit_id) FROM lignes_ticket;`,
    hints: [
      "Compare count(*) et count(produit_id) sur lignes_ticket. Qu'est-ce que la différence révèle ?",
      "« x NOT IN (1, 2, NULL) » équivaut à x <> 1 AND x <> 2 AND x <> NULL. Que vaut x <> NULL ?",
      'Réécris avec NOT EXISTS (SELECT 1 FROM lignes_ticket l WHERE l.produit_id = p.id), ou avec LEFT JOIN … WHERE l.id IS NULL.',
    ],
  },
  T03: {
    skills: ['generate_series', 'LEFT JOIN', 'dates'],
    starter: `SELECT d::date FROM generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d;`,
    hints: [
      "Une requête ne peut pas inventer des lignes qui n'existent pas dans les données : il faut une table « calendrier ».",
      'generate_series fabrique les jours. Pars du calendrier (à gauche) et fais un LEFT JOIN vers les tickets.',
      "Mets les conditions sur les tickets (magasin, statut, bornes du jour) dans le ON, pas dans le WHERE. Utilise coalesce(sum(...), 0).",
    ],
  },
  T04: {
    skills: ['LEFT JOIN', 'ON vs WHERE', 'NULL'],
    starter: `-- Combien de produits Frais au total ?
SELECT count(*) FROM produits WHERE rayon = 'Frais';`,
    hints: [
      "Pour un produit jamais vendu, toutes les colonnes de l (lignes_ticket) et de t (tickets_caisse) valent NULL après le LEFT JOIN.",
      "Le WHERE t.date_ticket >= '2026-10-01' est évalué sur ces NULL : NULL >= date n'est pas vrai, donc la ligne est éliminée.",
      "Déplace le filtre de date dans le ON, ou pré-filtre les ventes d'octobre dans une sous-requête que tu joins en LEFT JOIN.",
    ],
  },
  T05: {
    skills: ['GROUP BY HAVING', 'FILTER', 'transaction', 'LATERAL'],
    starter: `SELECT id, ean, libelle, cree_le FROM produits WHERE ean = '3000000095028';`,
    hints: [
      "Cherche l'EAN : combien de fiches produit le portent ? Quand ont-elles été créées ?",
      'GROUP BY ean HAVING count(*) > 1 liste tous les EAN en double. Puis compare les ventes par EAN (et non par id) avant et après le 10/10 avec sum(...) FILTER (WHERE ...).',
      "Correction : construis une table de correspondance doublon → fiche d'origine (la plus ancienne). Dans une transaction : compter, UPDATE lignes_ticket et mouvements_stock, désactiver les doublons, contrôler, ROLLBACK.",
    ],
  },
  T06: {
    skills: ['diagnostic croisé', 'GROUP BY'],
    starter: `SELECT * FROM stocks WHERE qte < 0 ORDER BY qte;`,
    hints: [
      'Regarde les produit_id en négatif. Ils te disent quelque chose (ticket précédent) ?',
      'Pour ces couples, détaille les mouvements par type_mvt : y a-t-il des RECEPTION ou un INVENTAIRE ?',
      "Les ventes sortent sur les nouvelles fiches, mais les réceptions entrent sur les anciennes. C'est la même cause que T05.",
    ],
  },
  T07: {
    skills: ['CTE', 'supervision flux', 'escalade'],
    starter: `SELECT magasin_id, max(maj_le) FROM stocks GROUP BY 1 ORDER BY 1;`,
    hints: [
      "Le stock théorique = sum(qte) des mouvements_stock par (magasin, produit). Compare-le à stocks.qte, et agrège l'écart par magasin.",
      'Regarde max(maj_le) par magasin : depuis quand Périgueux n’est-il plus mis à jour ?',
      "Va dans imports_log : flux STOCKS, magasin 3, triés par debut DESC. Recopie le message exact, il contient la cause (et le couple en doublon).",
    ],
  },
  T08: {
    skills: ['DISTINCT ON', 'CASE', 'nullif', 'division'],
    starter: `SELECT flux, magasin_id, debut, statut, nb_lignes, nb_rejets FROM imports_log ORDER BY debut DESC LIMIT 20;`,
    hints: [
      "« Le dernier par groupe » : DISTINCT ON (flux, magasin_id) … ORDER BY flux, magasin_id, debut DESC. Ou row_number() OVER (PARTITION BY … ORDER BY debut DESC) = 1.",
      "Construis la colonne alerte avec un CASE ; l'ordre des WHEN compte (ERREUR d'abord).",
      "Taux de rejet : nb_rejets::numeric / nullif(nb_lignes, 0). Sans cast, int / int = division entière, et sans nullif, gare à la division par zéro.",
    ],
  },
  T09: {
    skills: ['timestamptz', 'AT TIME ZONE', 'bornes'],
    starter: `SELECT date_ticket,
       date_ticket AT TIME ZONE 'UTC'          AS en_utc,
       date_ticket AT TIME ZONE 'Europe/Paris' AS a_paris
FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99
ORDER BY date_ticket LIMIT 10;`,
    hints: [
      "Compare la même date_ticket vue en UTC et à Paris. En octobre (heure d'été), quel est l'écart ?",
      "Les ventes entre 0h et 2h, heure de Paris, partent sur la veille si on découpe les journées en UTC. Seule la station (24h/24) est touchée.",
      "Découpe sur (date_ticket AT TIME ZONE 'Europe/Paris')::date et ajoute statut = 'VALIDE'. Compte les tickets qui changent de jour avec count(*) FILTER.",
    ],
  },
  T10: {
    skills: ['auto-jointure', 'chevauchement', 'fan-out', 'EXISTS'],
    starter: `SELECT * FROM prix_promos WHERE produit_id IN (25, 88, 91) ORDER BY produit_id, debut;`,
    hints: [
      'Deux périodes [d1,f1] et [d2,f2] se chevauchent si d1 <= f2 AND d2 <= f1. Joins prix_promos avec elle-même (a.id < b.id pour ne pas compter chaque paire deux fois).',
      'Si une ligne de vente correspond à 2 promos, la jointure la duplique (fan-out). Vérifie-le : GROUP BY l.id HAVING count(*) > 1.',
      "Remplace la jointure par un filtre WHERE EXISTS (SELECT 1 FROM prix_promos …) : on teste l'existence d'une promo sans multiplier les lignes.",
    ],
  },
  T11: {
    skills: ['normalisation', 'fenêtres', 'first_value'],
    starter: `SELECT lower(trim(email)) AS email_norm, count(*)
FROM clients_fidelite
WHERE email IS NOT NULL
GROUP BY 1 HAVING count(*) > 1;`,
    hints: [
      "Normalise l'email : lower(trim(email)). Les NULL ne prouvent pas un doublon, exclus-les.",
      "Pour garder toutes les cartes et savoir laquelle conserver : count(*) OVER (PARTITION BY email_norm) et first_value(num_carte) OVER (PARTITION BY email_norm ORDER BY cree_le).",
      "Le service parle de 4 clients mais l'email n'en trouve que 3 : une carte d'origine n'a pas d'email. Contrôle par nom/prénom, et signale-le sans fusionner à l'aveugle.",
    ],
  },
  T12: {
    skills: ['regex', 'contrôle qualité', 'INSERT SELECT', 'CASE'],
    starter: `SELECT * FROM import_produits_staging ORDER BY num_ligne;`,
    hints: [
      "Une colonne par règle avec CASE WHEN … THEN 'motif' END, puis ARRAY[...] et array_remove(…, NULL) pour lister les motifs.",
      "EAN : ean ~ '^[0-9]{13}$'. Prix : replace(trim(prix), ',', '.') puis regex AVANT de faire ::numeric (sinon « invalid input syntax »).",
      "Doublons dans le fichier : count(*) OVER (PARTITION BY ean). Déjà en base : EXISTS. Pour intégrer, fais un INSERT … SELECT DISTINCT ON (ean) dans BEGIN … ROLLBACK.",
    ],
  },
  T13: {
    skills: ['EXPLAIN', 'index'],
    starter: `EXPLAIN (ANALYZE, BUFFERS)
SELECT t.date_ticket, t.magasin_id, l.qte, l.prix_unitaire_ttc
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE l.produit_id = 150
ORDER BY t.date_ticket DESC
LIMIT 50;`,
    hints: [
      "Lis le plan de bas en haut (de l'intérieur vers l'extérieur). Repère « Seq Scan on lignes_ticket » et « Rows Removed by Filter ».",
      'Quelles colonnes sont filtrées ou jointes sans index ? (\\di ou pg_indexes)',
      'BEGIN; CREATE INDEX … ON lignes_ticket (produit_id); ANALYZE lignes_ticket; EXPLAIN …; ROLLBACK; et compare. En prod : CREATE INDEX CONCURRENTLY, demandé à l’équipe technique.',
    ],
  },
  T14: {
    skills: ['rank', 'lag', 'date_trunc', 'WINDOW'],
    starter: `SELECT date_trunc('week', date_ticket)::date AS semaine, sum(total_ttc)
FROM tickets_caisse WHERE statut = 'VALIDE' GROUP BY 1 ORDER BY 1;`,
    hints: [
      "Top N par groupe : calcule rank() OVER (PARTITION BY rayon ORDER BY ca DESC) dans une sous-requête, puis filtre rang <= 3 à l'extérieur (une fonction de fenêtre ne peut pas aller dans le WHERE).",
      "Semaine ISO : date_trunc('week', …) donne le lundi. L'étiquette : to_char(semaine, 'IYYY-\"S\"IW').",
      'Évolution : lag(ca) OVER (PARTITION BY magasin_id ORDER BY semaine), puis 100.0 * (ca - prec) / nullif(prec, 0).',
    ],
  },
  T15: {
    skills: ['anti-jointure', 'intégrité', 'explication métier'],
    starter: `SELECT count(*) FILTER (WHERE produit_id IS NULL) AS sans_produit,
       count(*) FILTER (WHERE produit_id IS NOT NULL
                        AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.id = produit_id)) AS produit_inexistant
FROM lignes_ticket;`,
    hints: [
      'LEFT JOIN produits p … WHERE p.id IS NULL attrape les deux cas à la fois. Distingue-les avec un CASE sur l.produit_id IS NULL.',
      'Regroupe par cas, magasin et jour, avec le nombre de lignes et le montant.',
      "NULL = saisie manuelle prévue par l'application (article hors référentiel). Id inexistant = intégrité rompue (pas de FK, purge ratée). La seconde se remonte à l'équipe technique.",
    ],
  },
  T16: {
    skills: ['ON CONFLICT', 'INSERT … SELECT', 'transaction'],
    starter: `-- Écarts entre le stock affiché et la somme des mouvements, à Périgueux
SELECT s.produit_id, s.qte AS stock, m.qte AS mouvements
FROM stocks s
JOIN (SELECT produit_id, sum(qte) AS qte FROM mouvements_stock WHERE magasin_id = 3 GROUP BY produit_id) m
  ON m.produit_id = s.produit_id
WHERE s.magasin_id = 3 AND s.qte <> m.qte
LIMIT 20;`,
    hints: [
      "La source du recalcul : SELECT magasin_id, produit_id, sum(qte) FROM mouvements_stock WHERE magasin_id = 3 GROUP BY 1, 2.",
      "Branche-la dans un INSERT INTO stocks (magasin_id, produit_id, qte, maj_le) SELECT …, now() … La clé primaire de stocks est (magasin_id, produit_id) : c'est elle qu'on met dans ON CONFLICT (…).",
      "DO UPDATE SET qte = EXCLUDED.qte, maj_le = EXCLUDED.maj_le. Encadre tout par BEGIN / ROLLBACK, avec le comptage d'écarts avant et après ; RETURNING (xmax = 0) dit si chaque ligne a été insérée ou mise à jour.",
    ],
  },
  T17: {
    skills: ['pagination par clé', 'ORDER BY', 'index'],
    starter: `SELECT id, date_ticket, magasin_id, total_ttc
FROM tickets_caisse
ORDER BY date_ticket
LIMIT 500 OFFSET 20000;`,
    hints: [
      "Deux causes aux doublons : un tri qui ne finit pas par une colonne unique (ordre des ex aequo non garanti), et des insertions pendant l'export qui décalent les pages.",
      "Au lieu de sauter n lignes, repars de la dernière ligne reçue : WHERE (date_ticket, id) > (dernière date, dernier id), avec ORDER BY date_ticket, id.",
      "Index sur (date_ticket, id). Compare EXPLAIN ANALYZE de la version OFFSET 20000 et de la version par clé : nombre de lignes lues.",
    ],
  },
  T18: {
    skills: ['ROWS BETWEEN', 'RANGE … interval', 'percentile_cont'],
    starter: `SELECT (date_ticket AT TIME ZONE 'Europe/Paris')::date AS jour, sum(total_ttc) AS ca
FROM tickets_caisse
WHERE statut = 'VALIDE' AND magasin_id = 2
GROUP BY 1 ORDER BY 1;`,
    hints: [
      "avg(ca) OVER (ORDER BY jour ROWS BETWEEN 6 PRECEDING AND CURRENT ROW) fait la moyenne des 7 dernières lignes. Saintes ouvre-t-il le dimanche ?",
      "Compare avec RANGE BETWEEN interval '6 days' PRECEDING AND CURRENT ROW, qui raisonne en jours de calendrier. Refais le test sur Mérignac (station ouverte le dimanche).",
      "Médiane : percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ttc), avec GROUP BY magasin_id (c'est un agrégat, pas une fenêtre).",
    ],
  },
  T19: {
    skills: ['SQL Server → PostgreSQL', 'isodow', 'bornes de dates'],
    starter: `SELECT to_char(date_ticket, 'FMDay') AS jour, count(*)
FROM tickets_caisse
GROUP BY 1;`,
    hints: [
      "Le tableau SQL Server → PostgreSQL de la Cheatsheet donne chaque correspondance : DATENAME, DATEDIFF, ISNULL.",
      "Noms français : (ARRAY['lundi', …, 'dimanche'])[extract(isodow FROM …)]. 'TMDay' dépend des locales installées sur le serveur (voir la fiche « Locales installées »).",
      "Remplace le DATEDIFF par des bornes date_ticket >= … AND date_ticket < … (un index reste utilisable), et trie sur extract(isodow …), pas sur le nom.",
    ],
  },
  T20: {
    skills: ['jsonb', '->> / ->', '@> / ?'],
    starter: `WITH commandes(doc) AS (VALUES
  ('{"num": "W-1001", "client": {"nom": "Durand", "carte": "FID00042"}, "total": "89.90", "tags": ["promo", "drive"]}'::jsonb),
  ('{"num": "W-1002", "client": {"nom": "Martin"}, "total": "9.90", "tags": []}'),
  ('{"num": "W-1003", "total": "120.00", "tags": ["promo"]}'),
  ('{"num": "W-1004", "client": {"nom": "Durand", "carte": "FID00042"}, "total": "15.00", "tags": ["drive"]}')
)
SELECT doc ->> 'num' AS num, doc ->> 'total' AS total
FROM commandes
ORDER BY doc ->> 'total' DESC;`,
    hints: [
      "-> renvoie du jsonb (pour descendre : doc -> 'client' ->> 'nom'), ->> du texte.",
      "Le tri est faux : '9.90' > '89.90' en texte. Convertis : (doc ->> 'total')::numeric.",
      "Promo : doc @> '{\"tags\": [\"promo\"]}'. Sans client : NOT doc ? 'client'. Total par client : GROUP BY doc -> 'client' ->> 'nom'.",
    ],
  },
}
