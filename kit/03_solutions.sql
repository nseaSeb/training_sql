-- =====================================================================
--  Solutions commentées — à ouvrir après avoir cherché.
--  psql -d training_sql -f 03_solutions.sql  (tout s'exécute, les corrections
--  de données finissent par ROLLBACK : la base n'est pas modifiée)
-- =====================================================================
SET search_path = retail;
SET timezone = 'Europe/Paris';
\pset pager off

\echo '===== T01 · totaux tickets incohérents ====='
-- Méthode : recalculer le total depuis les lignes et comparer.
-- HAVING filtre après agrégation (WHERE ne peut pas voir sum()).
SELECT t.id, t.magasin_id, t.num_caisse,
       t.date_ticket::date              AS jour,
       t.total_ttc,
       sum(l.qte * l.prix_unitaire_ttc - l.remise) AS total_recalcule,
       t.total_ttc - sum(l.qte * l.prix_unitaire_ttc - l.remise) AS trop_percu
FROM tickets_caisse t
JOIN lignes_ticket l ON l.ticket_id = t.id
GROUP BY t.id
HAVING t.total_ttc <> sum(l.qte * l.prix_unitaire_ttc - l.remise)
ORDER BY t.date_ticket;
-- GROUP BY t.id suffit : t.id est la clé primaire, Postgres accepte alors
-- les autres colonnes de t dans le SELECT (dépendance fonctionnelle).

-- Synthèse par caisse et par jour pour la réponse
SELECT magasin_id, num_caisse, jour, count(*) AS nb_tickets, sum(trop_percu) AS a_rembourser
FROM (
  SELECT t.magasin_id, t.num_caisse, t.date_ticket::date AS jour,
         t.total_ttc - sum(l.qte * l.prix_unitaire_ttc - l.remise) AS trop_percu
  FROM tickets_caisse t
  JOIN lignes_ticket l ON l.ticket_id = t.id
  GROUP BY t.id
  HAVING t.total_ttc <> sum(l.qte * l.prix_unitaire_ttc - l.remise)
) x
GROUP BY ROLLUP ((magasin_id, num_caisse, jour))
ORDER BY jour NULLS LAST;
-- Réponse : caisse 7 de Saintes, les 2 et 3 octobre, les remises de ligne
-- n'ont pas été déduites du total. Liste des tickets + montant à rembourser.

-- Pour aller plus loin : campagne de remboursement auprès des clients fidélité.
-- Une ligne par client (et non par ticket) : un seul mail, même avec plusieurs tickets.
WITH ecarts AS (
  SELECT t.id, t.carte_fidelite, t.date_ticket,
         t.total_ttc - sum(l.qte * l.prix_unitaire_ttc - l.remise) AS trop_percu
  FROM tickets_caisse t
  JOIN lignes_ticket l ON l.ticket_id = t.id
  WHERE t.statut = 'VALIDE'
  GROUP BY t.id
  HAVING t.total_ttc <> sum(l.qte * l.prix_unitaire_ttc - l.remise)
)
SELECT cf.prenom, cf.nom, cf.email,
       count(*) AS nb_tickets,
       sum(e.trop_percu) AS a_rembourser,
       string_agg(e.id::text || ' (' || to_char(e.date_ticket AT TIME ZONE 'Europe/Paris', 'DD/MM') || ')', ', ' ORDER BY e.date_ticket) AS tickets
FROM ecarts e
JOIN clients_fidelite cf ON cf.num_carte = e.carte_fidelite
GROUP BY cf.id
ORDER BY a_rembourser DESC;
-- 3 clients sur 8 tickets : les 5 autres tickets n'ont pas de carte fidélité.
-- Pour eux : remboursement en caisse sur présentation du ticket (affichage en
-- magasin, consigne à l'accueil).
-- La jointure interne écarte déjà les tickets sans carte : un filtre
-- « carte_fidelite IS NOT NULL » n'ajouterait rien. Et une condition sur une
-- colonne de ligne se place dans le WHERE, pas dans le HAVING.
-- Sur une vraie base, regrouper par lower(email) si une même personne a
-- plusieurs cartes (T11), et faire valider l'envoi par le métier (consentement).


\echo '===== T02 · le piège NOT IN + NULL ====='
-- lignes_ticket.produit_id contient des NULL. « id NOT IN (…, NULL) » vaut
-- NULL (inconnu) pour chaque produit, jamais TRUE → 0 ligne.
SELECT count(*) AS lignes_sans_produit FROM lignes_ticket WHERE produit_id IS NULL;

-- Correction 1 (à privilégier) : NOT EXISTS, insensible aux NULL
SELECT p.id, p.ean, p.libelle
FROM produits p
WHERE NOT EXISTS (SELECT 1 FROM lignes_ticket l WHERE l.produit_id = p.id)
ORDER BY p.id;

-- Correction 2 : LEFT JOIN … IS NULL (anti-jointure)
SELECT p.id, p.ean, p.libelle
FROM produits p
LEFT JOIN lignes_ticket l ON l.produit_id = p.id
WHERE l.id IS NULL
ORDER BY p.id;
-- (Correction 3, moins propre : NOT IN (SELECT produit_id … WHERE produit_id IS NOT NULL))


\echo '===== T03 · un jour par ligne, même sans vente ====='
-- generate_series fabrique le calendrier, LEFT JOIN y accroche les ventes.
-- Le filtre sur les tickets va dans le ON, sinon les jours vides disparaissent.
SELECT d::date                       AS jour,
       to_char(d, 'TMDay')           AS jour_semaine,
       count(t.id)                   AS nb_tickets,
       coalesce(sum(t.total_ttc), 0) AS ca
FROM generate_series(date '2026-10-01', date '2026-10-24', interval '1 day') d
LEFT JOIN tickets_caisse t
       ON t.magasin_id = 4
      AND t.statut = 'VALIDE'
      AND t.date_ticket >= d
      AND t.date_ticket <  d + interval '1 day'
GROUP BY d
ORDER BY d;
-- Bornes en >= / < plutôt que date_ticket::date = d : permet d'utiliser un
-- index sur date_ticket et évite les surprises de fuseau.


\echo '===== T04 · LEFT JOIN annulé par le WHERE ====='
-- Pour un produit non vendu, t.date_ticket est NULL ; « NULL >= date » n'est
-- pas vrai → la ligne est éliminée. Le WHERE transforme le LEFT en INNER.
-- Correction : mettre la condition sur t dans le ON (et joindre l et t
-- ensemble pour ne garder que les lignes d'octobre).
SELECT p.id, p.libelle, coalesce(sum(v.qte), 0) AS qte_vendue
FROM produits p
LEFT JOIN (
  SELECT l.produit_id, l.qte
  FROM lignes_ticket l
  JOIN tickets_caisse t ON t.id = l.ticket_id
  WHERE t.date_ticket >= '2026-10-01' AND t.statut = 'VALIDE'
) v ON v.produit_id = p.id
WHERE p.rayon = 'Frais'
GROUP BY p.id, p.libelle
ORDER BY qte_vendue, p.id;
-- Variante sans sous-requête :
--   LEFT JOIN (lignes_ticket l JOIN tickets_caisse t
--              ON t.id = l.ticket_id AND t.date_ticket >= '2026-10-01')
--          ON l.produit_id = p.id


\echo '===== T05 · doublons d EAN ====='
-- 1. Repérer les EAN portés par plusieurs fiches
SELECT ean, count(*) AS nb_fiches,
       string_agg(id || ' (' || to_char(cree_le, 'DD/MM/YYYY') || ')', ', ' ORDER BY id) AS fiches
FROM produits
GROUP BY ean
HAVING count(*) > 1;

-- 2-3. Ventes par EAN avant/après le 10/10 : en regroupant par EAN, la « chute » disparaît
SELECT p.ean, t.magasin_id,
       sum(l.qte) FILTER (WHERE t.date_ticket <  '2026-10-10') AS qte_avant,
       sum(l.qte) FILTER (WHERE t.date_ticket >= '2026-10-10') AS qte_apres,
       sum(l.qte) FILTER (WHERE t.date_ticket >= '2026-10-10' AND p.id > 400) AS dont_sur_doublon
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
JOIN produits p ON p.id = l.produit_id
WHERE p.ean IN (SELECT ean FROM produits GROUP BY ean HAVING count(*) > 1)
GROUP BY p.ean, t.magasin_id
ORDER BY p.ean, t.magasin_id;
-- Les ventes sont réparties sur deux fiches : le reporting par fiche ne voit
-- que l'ancienne. Avant/après ne couvre pas la même durée (9 jours contre 15) :
-- à ramener à une moyenne journalière si on veut comparer finement.

-- 4. Correction proposée (en transaction, contrôlée)
BEGIN;

-- Table de correspondance doublon → fiche d'origine (la plus ancienne par EAN)
CREATE TEMP TABLE corresp ON COMMIT DROP AS
SELECT p.id AS id_doublon, o.id AS id_origine
FROM produits p
JOIN LATERAL (
  SELECT id FROM produits o
  WHERE o.ean = p.ean
  ORDER BY o.cree_le, o.id
  LIMIT 1
) o ON o.id <> p.id;

SELECT * FROM corresp;

-- Compter avant de modifier : on doit retrouver ce nombre dans l'UPDATE
SELECT count(*) AS lignes_a_rattacher
FROM lignes_ticket WHERE produit_id IN (SELECT id_doublon FROM corresp);

UPDATE lignes_ticket l SET produit_id = c.id_origine
FROM corresp c WHERE l.produit_id = c.id_doublon;

UPDATE mouvements_stock m SET produit_id = c.id_origine
FROM corresp c WHERE m.produit_id = c.id_doublon;

UPDATE produits SET actif = false
WHERE id IN (SELECT id_doublon FROM corresp);

-- Contrôles : plus aucune vente sur un doublon
SELECT count(*) AS doit_etre_zero
FROM lignes_ticket WHERE produit_id IN (SELECT id_doublon FROM corresp);

ROLLBACK;  -- en vrai : COMMIT après validation, puis recalcul du stock (cf. T06)
-- À remonter à l'équipe technique : ajouter une contrainte d'unicité sur
-- produits.ean (ou un index unique partiel WHERE actif) pour bloquer la récidive.


\echo '===== T06 · stocks négatifs ====='
SELECT s.magasin_id, s.produit_id, p.ean, p.libelle, p.cree_le::date AS fiche_creee_le, s.qte
FROM stocks s
JOIN produits p ON p.id = s.produit_id
WHERE s.qte < 0
ORDER BY s.qte;

-- Détail des mouvements : uniquement des ventes, aucune réception ni inventaire
SELECT magasin_id, produit_id, type_mvt, count(*), sum(qte)
FROM mouvements_stock
WHERE (magasin_id, produit_id) IN (SELECT magasin_id, produit_id FROM stocks WHERE qte < 0)
GROUP BY 1, 2, 3
ORDER BY 1, 2, 3;
-- Réponse : ce sont les fiches doublons de T05. Les ventes sortent du stock
-- de la nouvelle fiche, les réceptions continuent d'entrer sur l'ancienne.
-- Le stock « réel » de l'article = somme des deux fiches. Correction = celle de T05.


\echo '===== T07 · stock figé à Périgueux ====='
-- 1. Écart stock affiché / stock théorique (somme des mouvements)
WITH theorique AS (
  SELECT magasin_id, produit_id, sum(qte) AS qte_theo
  FROM mouvements_stock
  GROUP BY magasin_id, produit_id
)
SELECT s.magasin_id,
       count(*) FILTER (WHERE s.qte <> th.qte_theo) AS nb_articles_en_ecart,
       sum(s.qte - th.qte_theo)                    AS ecart_total,
       max(s.maj_le)                               AS derniere_maj
FROM stocks s
JOIN theorique th USING (magasin_id, produit_id)
GROUP BY s.magasin_id
ORDER BY s.magasin_id;

-- 3. Historique du flux STOCKS de Périgueux
SELECT debut, fin, statut, nb_lignes, nb_rejets, message
FROM imports_log
WHERE flux = 'STOCKS' AND magasin_id = 3
ORDER BY debut DESC
LIMIT 6;
-- Réponse : flux STOCKS de Périgueux en erreur depuis la nuit du 22/10
-- (doublon de clé magasin/produit dans le fichier → l'import entier échoue).
-- Le stock est figé au 21/10 23:40. À transmettre : nom des fichiers,
-- message exact, couple en doublon (3/57). Demander une relance après
-- correction du fichier, puis vérifier que l'écart retombe à 0.


\echo '===== T08 · point flux du matin ====='
-- DISTINCT ON garde la première ligne de chaque groupe selon l'ORDER BY :
-- idéal pour « le dernier passage par flux et magasin ».
SELECT DISTINCT ON (l.flux, l.magasin_id)
       l.flux, m.code AS magasin, l.debut, l.fin, l.statut, l.nb_lignes, l.nb_rejets,
       round(100.0 * l.nb_rejets / nullif(l.nb_lignes, 0), 1) AS pct_rejets,
       CASE
         WHEN l.statut = 'ERREUR' THEN 'ERREUR'
         WHEN l.statut = 'EN_COURS'
              AND l.debut < timestamptz '2026-10-25 08:00' - interval '1 hour' THEN 'BLOQUÉ'
         WHEN l.nb_rejets::numeric / nullif(l.nb_lignes, 0) > 0.05 THEN 'REJETS'
         ELSE 'OK'
       END AS alerte,
       l.message
FROM imports_log l
JOIN magasins m ON m.id = l.magasin_id
ORDER BY l.flux, l.magasin_id, l.debut DESC;
-- nullif(x, 0) évite la division par zéro ; 100.0 force le calcul décimal
-- (100 * entier / entier ferait une division entière).

-- Variante portable (autres SGBD) : row_number() dans une sous-requête
-- SELECT * FROM (SELECT *, row_number() OVER (PARTITION BY flux, magasin_id
--                ORDER BY debut DESC) AS rn FROM imports_log) x WHERE rn = 1;

-- Bonus : pire taux de rejet de l'historique
SELECT flux, magasin_id, debut::date, nb_lignes, nb_rejets,
       round(100.0 * nb_rejets / nullif(nb_lignes, 0), 1) AS pct
FROM imports_log
WHERE nb_lignes > 0
ORDER BY nb_rejets::numeric / nb_lignes DESC
LIMIT 3;


\echo '===== T09 · fuseau horaire de la station ====='
-- date_ticket est un timestamptz (instant absolu). « AT TIME ZONE 'UTC' »
-- découpe les journées à minuit UTC = 2h du matin à Paris en heure d'été
-- (1h en hiver). Les tickets entre 0h et 2h, heure de Paris, partent sur la veille.

-- Tickets mal rattachés pour le 15 octobre
SELECT count(*) FILTER (WHERE (date_ticket AT TIME ZONE 'UTC')::date = '2026-10-15'
                          AND (date_ticket AT TIME ZONE 'Europe/Paris')::date <> '2026-10-15') AS comptes_a_tort,
       count(*) FILTER (WHERE (date_ticket AT TIME ZONE 'Europe/Paris')::date = '2026-10-15'
                          AND (date_ticket AT TIME ZONE 'UTC')::date <> '2026-10-15') AS oublies
FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99;

-- Requête corrigée : jour civil de Paris + exclusion des annulés
SELECT (date_ticket AT TIME ZONE 'Europe/Paris')::date AS jour,
       count(*)       AS nb_tickets,
       sum(total_ttc) AS ca
FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99
  AND statut = 'VALIDE'
GROUP BY 1
ORDER BY 1;
-- Comparaison directe pour le 15/10
SELECT 'UTC (faux)' AS methode, sum(total_ttc) FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99 AND (date_ticket AT TIME ZONE 'UTC')::date = '2026-10-15'
UNION ALL
SELECT 'Europe/Paris', sum(total_ttc) FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99 AND statut = 'VALIDE'
  AND date_ticket >= timestamptz '2026-10-15 00:00 Europe/Paris'
  AND date_ticket <  timestamptz '2026-10-16 00:00 Europe/Paris';
-- Note : la requête d'origine n'excluait pas non plus les tickets ANNULE.
-- Ici la station n'en a pas, mais la règle doit figurer dans la requête.
-- Attention aussi à « date_ticket::date » : le résultat dépend du paramètre
-- timezone de la session (SHOW timezone;). Être explicite évite les surprises.


\echo '===== T10 · promos qui se chevauchent et jointure qui multiplie ====='
-- 1. Chevauchements : auto-jointure, a.id < b.id pour ne pas lister chaque paire deux fois.
-- Deux périodes [d1,f1] et [d2,f2] se recouvrent si d1 <= f2 AND d2 <= f1.
SELECT a.produit_id,
       a.id AS promo_a, a.magasin_id AS mag_a, a.debut AS debut_a, a.fin AS fin_a, a.prix_promo AS prix_a,
       b.id AS promo_b, b.magasin_id AS mag_b, b.debut AS debut_b, b.fin AS fin_b, b.prix_promo AS prix_b
FROM prix_promos a
JOIN prix_promos b
  ON b.produit_id = a.produit_id
 AND a.id < b.id
 AND a.debut <= b.fin AND b.debut <= a.fin
 AND (a.magasin_id IS NOT DISTINCT FROM b.magasin_id
      OR a.magasin_id IS NULL OR b.magasin_id IS NULL)
ORDER BY a.produit_id;
-- IS NOT DISTINCT FROM : égalité qui traite NULL = NULL comme vrai.
-- Variante Postgres : daterange(a.debut, a.fin, '[]') && daterange(b.debut, b.fin, '[]')

-- 2. Pourquoi le CA est gonflé : une ligne de vente qui tombe dans deux promos
-- est jointe deux fois (« fan-out »), son montant est sommé deux fois.
SELECT l.id AS ligne_id, l.produit_id, count(*) AS nb_promos_trouvees
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
JOIN prix_promos pp
  ON pp.produit_id = l.produit_id
 AND (pp.magasin_id = t.magasin_id OR pp.magasin_id IS NULL)
 AND t.date_ticket::date BETWEEN pp.debut AND pp.fin
WHERE t.magasin_id = 1
GROUP BY l.id, l.produit_id
HAVING count(*) > 1
ORDER BY l.produit_id
LIMIT 10;

-- 3. Correction : tester l'existence d'une promo (EXISTS) au lieu de joindre
SELECT l.produit_id,
       sum(l.qte * l.prix_unitaire_ttc - l.remise) AS ca_sous_promo
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE t.magasin_id = 1
  AND t.statut = 'VALIDE'
  AND t.date_ticket >= '2026-10-01'
  AND EXISTS (
    SELECT 1 FROM prix_promos pp
    WHERE pp.produit_id = l.produit_id
      AND (pp.magasin_id = t.magasin_id OR pp.magasin_id IS NULL)
      AND (t.date_ticket AT TIME ZONE 'Europe/Paris')::date BETWEEN pp.debut AND pp.fin
  )
GROUP BY l.produit_id
ORDER BY 2 DESC;
-- Réflexe à garder : si un SUM paraît trop gros après une jointure, compter
-- les lignes par clé (GROUP BY clé HAVING count(*) > 1) pour voir la duplication.


\echo '===== T11 · doublons fidélité ====='
-- Normalisation : lower(trim(email)). Fenêtres pour repérer la carte la plus ancienne.
WITH norm AS (
  SELECT c.*, lower(trim(c.email)) AS email_norm
  FROM clients_fidelite c
  WHERE c.email IS NOT NULL
),
groupes AS (
  SELECT n.*,
         count(*)     OVER (PARTITION BY email_norm) AS nb_cartes,
         first_value(num_carte) OVER (PARTITION BY email_norm ORDER BY cree_le, id) AS carte_a_garder
  FROM norm n
)
SELECT g.email_norm, g.num_carte, g.nom, g.prenom, g.cree_le, g.magasin_id,
       g.carte_a_garder,
       (SELECT count(*) FROM tickets_caisse t WHERE t.carte_fidelite = g.num_carte) AS nb_tickets
FROM groupes g
WHERE g.nb_cartes > 1
ORDER BY g.email_norm, g.cree_le;
-- Les emails NULL sont exclus : deux NULL ne prouvent pas un doublon.
-- Piège : la carte FID900004 (Leroy Philippe, créée le 15/10) n'apparaît pas,
-- car la carte d'origine FID000238 n'a pas d'email. Second contrôle sur nom/prénom :
SELECT lower(nom) AS nom, lower(prenom) AS prenom,
       string_agg(num_carte || coalesce(' <' || trim(email) || '>', ' <sans email>'), ', ' ORDER BY cree_le) AS cartes
FROM clients_fidelite
GROUP BY lower(nom), lower(prenom)
HAVING count(*) > 1 AND max(cree_le) >= '2026-09-01'
ORDER BY 1, 2;
-- Résultat : 7 cartes « Leroy Philippe ». Sur nom/prénom seuls on ne peut pas
-- trancher (homonymes). Réponse N2 réaliste : signaler le cas au service
-- fidélité avec la liste des candidats ; la fusion se décide sur un critère
-- fiable (téléphone, adresse, date de naissance), pas par la requête.
-- Pour aller plus loin : unaccent() + comparaison nom/prénom pour les
-- doublons sans email (extension unaccent à installer).


\echo '===== T12 · contrôle de l import fournisseur ====='
WITH s AS (
  SELECT st.*,
         replace(trim(st.prix), ',', '.') AS prix_norm,
         count(*) OVER (PARTITION BY st.ean) AS nb_meme_ean
  FROM import_produits_staging st
),
controles AS (
  SELECT s.num_ligne, s.ean, s.libelle, s.prix, s.rayon,
         array_remove(ARRAY[
           CASE WHEN s.ean IS NULL OR s.ean !~ '^[0-9]{13}$' THEN 'EAN invalide' END,
           CASE WHEN coalesce(trim(s.libelle), '') = '' THEN 'libellé vide' END,
           CASE WHEN s.prix_norm IS NULL OR s.prix_norm !~ '^-?[0-9]+(\.[0-9]{1,2})?$'
                  THEN 'prix non numérique'
                WHEN s.prix_norm::numeric <= 0 THEN 'prix négatif ou nul' END,
           CASE WHEN s.rayon NOT IN (SELECT DISTINCT rayon FROM produits) THEN 'rayon inconnu' END,
           CASE WHEN s.nb_meme_ean > 1 THEN 'EAN en double dans le fichier' END,
           CASE WHEN EXISTS (SELECT 1 FROM produits p WHERE p.ean = s.ean) THEN 'EAN déjà en base' END
         ], NULL) AS motifs
  FROM s
)
SELECT num_ligne, ean, libelle, prix, rayon,
       CASE WHEN cardinality(motifs) = 0 THEN 'OK' ELSE array_to_string(motifs, ' ; ') END AS resultat
FROM controles
ORDER BY num_ligne;
-- Points d'attention :
--  * La regex accepte le signe « - » pour pouvoir dire « prix négatif »
--    plutôt que « non numérique » : un motif précis fait gagner un aller-retour.
--  * Le cast ::numeric n'est fait que quand la regex passe (le CASE évalue
--    les branches dans l'ordre) : pas d'erreur « invalid input syntax ».
--  * Lignes 1 et 12 identiques : doublon dans le fichier. Les deux sont
--    signalées ; à l'intégration on peut en garder une (DISTINCT ON).

BEGIN;
INSERT INTO produits (ean, libelle, rayon, prix_ttc, tva, cree_le)
SELECT DISTINCT ON (st.ean)
       st.ean, trim(st.libelle), st.rayon,
       replace(trim(st.prix), ',', '.')::numeric(10,2),
       CASE WHEN st.rayon = 'DPH' THEN 20.00 ELSE 5.50 END,   -- règle simplifiée pour l'exercice
       now()
FROM import_produits_staging st
WHERE st.ean ~ '^[0-9]{13}$'
  AND coalesce(trim(st.libelle), '') <> ''
  AND replace(trim(st.prix), ',', '.') ~ '^[0-9]+(\.[0-9]{1,2})?$'
  AND replace(trim(st.prix), ',', '.')::numeric > 0
  AND st.rayon IN (SELECT DISTINCT rayon FROM produits)
  AND NOT EXISTS (SELECT 1 FROM produits p WHERE p.ean = st.ean)
ORDER BY st.ean, st.num_ligne
RETURNING id, ean, libelle, prix_ttc, rayon;
ROLLBACK;
-- Ici on a choisi d'intégrer une occurrence des lignes 1/12 : c'est une
-- décision métier à faire valider, pas à prendre seul.


\echo '===== T13 · lecture de plan ====='
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT t.date_ticket, t.magasin_id, l.qte, l.prix_unitaire_ttc
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE l.produit_id = 150
ORDER BY t.date_ticket DESC
LIMIT 50;
-- À lire : « Seq Scan on lignes_ticket » + « Rows Removed by Filter » énorme
-- → toute la table est lue pour garder quelques centaines de lignes.
-- Pas d'index sur lignes_ticket.produit_id (ni sur ticket_id).

BEGIN;
CREATE INDEX idx_lignes_produit ON lignes_ticket (produit_id);
ANALYZE lignes_ticket;
EXPLAIN (ANALYZE, BUFFERS, COSTS OFF)
SELECT t.date_ticket, t.magasin_id, l.qte, l.prix_unitaire_ttc
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE l.produit_id = 150
ORDER BY t.date_ticket DESC
LIMIT 50;
ROLLBACK;
-- Après : « Bitmap Index Scan on idx_lignes_produit », moins de buffers lus.
-- Au support N2, on ne crée pas l'index en prod soi-même : on remonte le plan
-- avant/après à l'équipe technique. En prod l'index se crée avec
-- CREATE INDEX CONCURRENTLY (pas de verrou bloquant en écriture).
-- Autres pistes à regarder dans un vrai cas : pg_stat_statements (requêtes
-- les plus coûteuses), statistiques à jour (ANALYZE), verrous (pg_locks).


\echo '===== T14 · classements ====='
-- 1. Top 3 par rayon : rang calculé dans une sous-requête, filtré dehors
--    (on ne peut pas filtrer une fonction de fenêtrage dans le WHERE).
SELECT rayon, rang, produit_id, libelle, ca
FROM (
  SELECT p.rayon, p.id AS produit_id, p.libelle,
         sum(l.qte * l.prix_unitaire_ttc - l.remise) AS ca,
         rank() OVER (PARTITION BY p.rayon
                      ORDER BY sum(l.qte * l.prix_unitaire_ttc - l.remise) DESC) AS rang
  FROM lignes_ticket l
  JOIN tickets_caisse t ON t.id = l.ticket_id
  JOIN produits p ON p.id = l.produit_id
  WHERE t.statut = 'VALIDE'
    AND t.date_ticket >= '2026-10-01' AND t.date_ticket < '2026-11-01'
  GROUP BY p.rayon, p.id, p.libelle
) x
WHERE rang <= 3
ORDER BY rayon, rang;
-- rank() donne des ex aequo (1,1,3) ; row_number() les départage
-- arbitrairement ; dense_rank() donne (1,1,2).
-- Remarque : les fiches doublons de T05 faussent ce classement tant qu'elles
-- ne sont pas fusionnées (agréger par ean plutôt que par id pour être juste).

-- 2. CA hebdomadaire et évolution
WITH hebdo AS (
  SELECT magasin_id,
         date_trunc('week', date_ticket)::date AS semaine,   -- lundi de la semaine ISO
         sum(total_ttc) AS ca
  FROM tickets_caisse
  WHERE statut = 'VALIDE'
  GROUP BY 1, 2
)
SELECT magasin_id, semaine, to_char(semaine, 'IYYY-"S"IW') AS sem_iso, ca,
       lag(ca) OVER w AS ca_sem_prec,
       round(100.0 * (ca - lag(ca) OVER w) / nullif(lag(ca) OVER w, 0), 1) AS evol_pct
FROM hebdo
WINDOW w AS (PARTITION BY magasin_id ORDER BY semaine)
ORDER BY magasin_id, semaine;
-- La dernière semaine (19-24 oct.) est complète pour les magasins (fermés le
-- dimanche) ; la première commence un mardi (1er septembre) : évolution à
-- interpréter avec prudence. Le magasin 4 a une semaine à 5 jours (inventaire).


\echo '===== T15 · lignes sans produit / produit inexistant ====='
SELECT CASE WHEN l.produit_id IS NULL THEN 'produit_id NULL (hors référentiel)'
            ELSE 'produit inexistant (id ' || l.produit_id || ')' END AS cas,
       t.magasin_id, t.date_ticket::date AS jour,
       count(*) AS nb_lignes,
       sum(l.qte * l.prix_unitaire_ttc - l.remise) AS montant
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
LEFT JOIN produits p ON p.id = l.produit_id
WHERE p.id IS NULL
GROUP BY 1, t.magasin_id, t.date_ticket::date
ORDER BY 1, jour;
-- Lecture :
--  * produit_id NULL : saisies manuelles en caisse (article non reconnu au
--    scan). Comportement prévu par l'application, à affecter à un rayon
--    « divers » en comptabilité ; à signaler si le volume augmente.
--  * produit_id renseigné mais absent de produits : intégrité rompue
--    (fiches supprimées alors que des ventes les référencent, pas de clé
--    étrangère). À remonter à l'équipe technique ; voir s'il existe une
--    sauvegarde ou un historique des fiches pour retrouver le rayon.
-- Les deux cas sont regroupés par le LEFT JOIN … WHERE p.id IS NULL :
-- c'est l'anti-jointure qui attrape les deux à la fois.


\echo '===== T16 · recalcul du stock de Périgueux (upsert) ====='
BEGIN;
-- 1. Avant : combien de couples sont faux ?
SELECT count(*) AS couples_faux
FROM stocks s
JOIN (SELECT produit_id, sum(qte) AS qte FROM mouvements_stock WHERE magasin_id = 3 GROUP BY produit_id) m
  ON m.produit_id = s.produit_id
WHERE s.magasin_id = 3 AND s.qte <> m.qte;

-- 2. Recalcul : met à jour les lignes existantes, crée celles qui manquent
INSERT INTO stocks (magasin_id, produit_id, qte, maj_le)
SELECT magasin_id, produit_id, sum(qte), now()
FROM mouvements_stock
WHERE magasin_id = 3
GROUP BY magasin_id, produit_id
ON CONFLICT (magasin_id, produit_id)
DO UPDATE SET qte = EXCLUDED.qte, maj_le = EXCLUDED.maj_le
RETURNING (xmax = 0) AS insere;

-- 3. Après : plus aucun écart
SELECT count(*) AS couples_faux
FROM stocks s
JOIN (SELECT produit_id, sum(qte) AS qte FROM mouvements_stock WHERE magasin_id = 3 GROUP BY produit_id) m
  ON m.produit_id = s.produit_id
WHERE s.magasin_id = 3 AND s.qte <> m.qte;
ROLLBACK;  -- COMMIT seulement après accord écrit du demandeur
-- 356 couples faux sur 400 avant, 0 après. Les 400 lignes sont des mises à
-- jour (insere = false) : aucun produit nouveau depuis le 21/10, mais l'upsert
-- couvrirait aussi ce cas, contrairement à un simple UPDATE.
-- Ne pas oublier : le batch reste en échec (T07). Sans correction du flux,
-- le stock sera de nouveau figé demain soir.

\echo '===== T17 · export paginé : OFFSET contre pagination par clé ====='
-- Pourquoi des doublons : l'export trie sur date_ticket seule et pagine avec
-- OFFSET. Sans colonne unique en fin de tri, l'ordre des ex aequo n'est pas
-- garanti ; et un ticket inséré pendant l'export décale toutes les pages
-- suivantes d'une ligne (la dernière d'une page réapparaît sur la suivante).
-- Page 1
SELECT id, date_ticket, magasin_id, total_ttc
FROM tickets_caisse
ORDER BY date_ticket, id
LIMIT 500;
-- Page suivante : on repart de la dernière ligne reçue, ici (id 1234 du 02/09)
SELECT id, date_ticket, magasin_id, total_ttc
FROM tickets_caisse
WHERE (date_ticket, id) > (timestamptz '2026-09-02 10:00+02', 1234)
ORDER BY date_ticket, id
LIMIT 500;
-- Index qui rend chaque page instantanée, quelle que soit sa profondeur :
-- CREATE INDEX ON tickets_caisse (date_ticket, id);
-- Comparaison (avec l'index) : EXPLAIN ANALYZE … OFFSET 20000 lit 20 500 lignes,
-- la version par clé n'en lit que 500.

\echo '===== T18 · CA lissé sur 7 jours et panier médian ====='
WITH jours AS (
  SELECT magasin_id, (date_ticket AT TIME ZONE 'Europe/Paris')::date AS jour, sum(total_ttc) AS ca
  FROM tickets_caisse
  WHERE statut = 'VALIDE'
  GROUP BY 1, 2
)
SELECT magasin_id, jour, ca,
       round(avg(ca) OVER (PARTITION BY magasin_id ORDER BY jour ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), 2) AS moy_7_lignes,
       round(avg(ca) OVER (PARTITION BY magasin_id ORDER BY jour RANGE BETWEEN interval '6 days' PRECEDING AND CURRENT ROW), 2) AS moy_7_jours
FROM jours
WHERE magasin_id = 2
ORDER BY jour;
-- Saintes (2) est fermé le dimanche : il n'y a pas de ligne ce jour-là.
-- ROWS 6 PRECEDING prend les 7 dernières LIGNES, soit 8 jours de calendrier.
-- RANGE interval '6 days' prend vraiment les 7 derniers jours (6 jours ouverts).
-- Les deux colonnes diffèrent dès le 8 septembre (7133.38 contre 6964.93) :
-- « 7 jours » veut dire quoi pour le demandeur ? C'est la question à lui poser.
-- À Mérignac (1), la station-service vend aussi le dimanche : les deux colonnes
-- y sont identiques, ce qui cache le piège.

SELECT magasin_id,
       round(avg(total_ttc), 2) AS panier_moyen,
       percentile_cont(0.5) WITHIN GROUP (ORDER BY total_ttc) AS panier_median
FROM tickets_caisse
WHERE statut = 'VALIDE'
GROUP BY magasin_id
ORDER BY magasin_id;
-- Le panier médian est sous le panier moyen partout : quelques très gros
-- tickets tirent la moyenne vers le haut. La médiane décrit mieux le client type.

\echo '===== T19 · portage SQL Server : ventes par jour de la semaine ====='
SELECT (ARRAY['lundi','mardi','mercredi','jeudi','vendredi','samedi','dimanche'])
         [extract(isodow FROM date_ticket AT TIME ZONE 'Europe/Paris')] AS jour,
       count(*) AS nb_tickets,
       round(avg(total_ttc), 2) AS panier_moyen
FROM tickets_caisse
WHERE statut = 'VALIDE'
  AND date_ticket >= timestamptz '2026-10-25 00:00 Europe/Paris' - interval '28 days'
  AND date_ticket <  timestamptz '2026-10-25 00:00 Europe/Paris'
GROUP BY extract(isodow FROM date_ticket AT TIME ZONE 'Europe/Paris')
ORDER BY extract(isodow FROM date_ticket AT TIME ZONE 'Europe/Paris');
-- Correspondances : DATENAME(weekday) → tableau indexé par isodow (to_char
-- 'TMDay' sortirait en anglais sans locale fr_FR sur le serveur) ;
-- DATEDIFF(day, d, '2026-10-24') < 28 → bornes demi-ouvertes sur 28 jours
-- (et un index reste utilisable) ; ISNULL(statut, '') = 'VALIDE' → statut = 'VALIDE'
-- (le ISNULL ne sert à rien : NULL n'est de toute façon pas égal à 'VALIDE').
-- Tri sur isodow, pas sur le nom (sinon dimanche, jeudi, lundi…).
-- Les tickets du dimanche viennent tous de la station-service de Mérignac
-- (caisse 99, ouverte 24h/24, voir T09).

\echo '===== T20 · commandes web en JSON ====='
WITH commandes(doc) AS (VALUES
  ('{"num": "W-1001", "client": {"nom": "Durand", "carte": "FID00042"}, "total": "89.90", "tags": ["promo", "drive"]}'::jsonb),
  ('{"num": "W-1002", "client": {"nom": "Martin"}, "total": "9.90", "tags": []}'),
  ('{"num": "W-1003", "total": "120.00", "tags": ["promo"]}'),
  ('{"num": "W-1004", "client": {"nom": "Durand", "carte": "FID00042"}, "total": "15.00", "tags": ["drive"]}')
)
SELECT doc ->> 'num' AS num,
       doc -> 'client' ->> 'nom' AS client,
       (doc ->> 'total')::numeric AS total,
       doc @> '{"tags": ["promo"]}' AS en_promo,
       NOT doc ? 'client' AS sans_client
FROM commandes
ORDER BY (doc ->> 'total')::numeric DESC;
-- 1. Tri : sans le ::numeric, '9.90' passe devant '89.90' et '120.00'
--    (comparaison de texte, caractère par caractère).
-- 2. W-1003 n'a pas de clé client : commande invité, à exclure ou à
--    rattacher, pas une erreur d'import.
-- 3. Total par client :
--    SELECT doc -> 'client' ->> 'nom', sum((doc ->> 'total')::numeric) … GROUP BY 1
