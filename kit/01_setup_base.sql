-- =====================================================================
--  Kit d'entraînement SQL — support N2 progiciel retail
--  Base fictive « hypermarchés » : magasins, produits, caisses, stocks,
--  promos, fidélité, flux d'import. Des anomalies sont cachées dedans :
--  ce sont elles que les tickets (02_tickets.md) te font trouver.
--
--  Utilisation :
--    createdb training_sql
--    psql -d training_sql -f 01_setup_base.sql
--  Tout est créé dans le schéma "retail". Le script est rejouable.
-- =====================================================================

SET client_min_messages = warning;
DROP SCHEMA IF EXISTS retail CASCADE;
CREATE SCHEMA retail;
SET search_path = retail;
SET timezone = 'Europe/Paris';
SELECT setseed(0.42);

-- ---------------------------------------------------------------------
-- Référentiels
-- ---------------------------------------------------------------------
CREATE TABLE magasins (
  id     int PRIMARY KEY,
  code   text NOT NULL UNIQUE,
  nom    text NOT NULL,
  ville  text NOT NULL,
  actif  boolean NOT NULL DEFAULT true
);

INSERT INTO magasins VALUES
  (1, 'M033', 'Hyper Mérignac',       'Mérignac',       true),
  (2, 'M017', 'Hyper Saintes',        'Saintes',        true),
  (3, 'M024', 'Hyper Périgueux',      'Périgueux',      true),
  (4, 'M040', 'Hyper Mont-de-Marsan', 'Mont-de-Marsan', true),
  (5, 'M047', 'Hyper Agen',           'Agen',           false);

CREATE TABLE produits (
  id        serial PRIMARY KEY,
  ean       text NOT NULL,              -- pas de contrainte UNIQUE (héritage d'une vieille reprise)
  libelle   text NOT NULL,
  rayon     text NOT NULL,
  prix_ttc  numeric(10,2) NOT NULL,
  tva       numeric(4,2) NOT NULL,
  actif     boolean NOT NULL DEFAULT true,
  cree_le   timestamptz NOT NULL DEFAULT timestamptz '2025-01-15 09:00'
);

INSERT INTO produits (ean, libelle, rayon, prix_ttc, tva)
SELECT
  '30' || lpad((g * 7919 % 99999999999)::text, 11, '0'),
  (ARRAY['Pâtes','Yaourt','Jus','Lessive','Pommes','Pizza'])[1 + g % 6]
    || ' ' || (ARRAY['Marque Repère','Bio Village','Eco+','Nos Régions','Premium','Familial'])[1 + (g / 6) % 6]
    || ' réf.' || g,
  (ARRAY['Épicerie','Frais','Boissons','DPH','Fruits et légumes','Surgelés'])[1 + g % 6],
  round((0.49 + random() * 19.5)::numeric, 2),
  CASE WHEN g % 6 = 3 THEN 20.00 ELSE 5.50 END
FROM generate_series(1, 400) g;

-- ---------------------------------------------------------------------
-- Caisses : tickets + lignes
-- ---------------------------------------------------------------------
CREATE TABLE tickets_caisse (
  id              bigserial PRIMARY KEY,
  magasin_id      int NOT NULL REFERENCES magasins(id),
  num_caisse      int NOT NULL,             -- 99 = automate station-service 24/24
  date_ticket     timestamptz NOT NULL,
  total_ttc       numeric(10,2),
  statut          text NOT NULL DEFAULT 'VALIDE',   -- VALIDE | ANNULE
  carte_fidelite  text
);

-- Caisses magasin : du lundi au samedi, 8h30 → 21h, du 1er septembre au 24 octobre
INSERT INTO tickets_caisse (magasin_id, num_caisse, date_ticket, statut)
SELECT m, c, d, s FROM (
  SELECT 1 + floor(random() * 4)::int AS m,
         1 + floor(random() * 12)::int AS c,
         timestamptz '2026-09-01 08:30'
           + (floor(random() * 54)::int * interval '1 day')
           + (random() * 12.5 * interval '1 hour') AS d,
         CASE WHEN random() < 0.02 THEN 'ANNULE' ELSE 'VALIDE' END AS s
  FROM generate_series(1, 22000)
) x
WHERE extract(isodow FROM d) <> 7;

-- Fermeture exceptionnelle pour inventaire : Mont-de-Marsan le 6 octobre
DELETE FROM tickets_caisse
WHERE magasin_id = 4 AND date_ticket >= '2026-10-06' AND date_ticket < '2026-10-07';

-- Station-service de Mérignac (caisse 99) : 24h/24, 7j/7
INSERT INTO tickets_caisse (magasin_id, num_caisse, date_ticket, statut)
SELECT 1, 99,
       timestamptz '2026-09-01 00:00' + random() * interval '54 days',
       'VALIDE'
FROM generate_series(1, 1800);

CREATE TABLE lignes_ticket (
  id                 bigserial PRIMARY KEY,
  ticket_id          bigint NOT NULL,     -- pas de FK : les lignes arrivent par flux depuis les caisses
  produit_id         int,                 -- NULL = article saisi « hors référentiel » en caisse
  qte                numeric(10,3) NOT NULL,
  prix_unitaire_ttc  numeric(10,2) NOT NULL,
  remise             numeric(10,2) NOT NULL DEFAULT 0
);

-- Les produits 381 à 400 ne sont jamais vendus (nouveautés pas encore en rayon)
INSERT INTO lignes_ticket (ticket_id, produit_id, qte, prix_unitaire_ttc, remise)
SELECT x.ticket_id, p.id, x.qte, p.prix_ttc,
       CASE WHEN x.r < 0.05 THEN round(p.prix_ttc * x.qte * 0.30, 2) ELSE 0 END
FROM (
  SELECT t.id AS ticket_id,
         1 + floor(random() * 380)::int AS pid,
         (1 + floor(random() * 3))::numeric AS qte,
         random() AS r
  FROM tickets_caisse t
  CROSS JOIN LATERAL generate_series(1, 1 + (t.id % 6)::int) g
) x
JOIN produits p ON p.id = x.pid;

-- Articles hors référentiel saisis en caisse (produit_id NULL)
INSERT INTO lignes_ticket (ticket_id, produit_id, qte, prix_unitaire_ttc)
SELECT id, NULL, 1, 3.99
FROM tickets_caisse
WHERE magasin_id = 2 AND num_caisse = 4 AND statut = 'VALIDE'
ORDER BY id
LIMIT 14;

-- Lignes pointant vers des produits qui n'existent pas (purge ratée en septembre)
INSERT INTO lignes_ticket (ticket_id, produit_id, qte, prix_unitaire_ttc)
SELECT id, 90000 + (id % 3), 1, 7.50
FROM tickets_caisse
WHERE magasin_id = 3 AND statut = 'VALIDE' AND date_ticket::date = '2026-10-14'
ORDER BY id
LIMIT 9;

-- Doublon d'EAN : une reprise du 10 octobre a recréé 3 fiches produit
-- avec le même EAN. Les caisses de Mérignac et Saintes ont basculé sur les nouvelles fiches.
INSERT INTO produits (id, ean, libelle, rayon, prix_ttc, tva, cree_le)
SELECT 400 + row_number() OVER (ORDER BY id), ean, upper(libelle), rayon, prix_ttc, tva,
       timestamptz '2026-10-10 05:12'
FROM produits WHERE id IN (12, 57, 230);
SELECT setval('produits_id_seq', 403);

UPDATE lignes_ticket l
SET produit_id = CASE l.produit_id WHEN 12 THEN 401 WHEN 57 THEN 402 WHEN 230 THEN 403 END
FROM tickets_caisse t
WHERE t.id = l.ticket_id
  AND l.produit_id IN (12, 57, 230)
  AND t.magasin_id IN (1, 2)
  AND t.date_ticket >= '2026-10-10';

-- Calcul des totaux tickets
UPDATE tickets_caisse t
SET total_ttc = s.total
FROM (
  SELECT ticket_id, sum(qte * prix_unitaire_ttc - remise) AS total
  FROM lignes_ticket GROUP BY ticket_id
) s
WHERE s.ticket_id = t.id;

-- Anomalie : sur la caisse 7 de Saintes, du 2 au 4 octobre, le total ticket
-- a été calculé sans tenir compte des remises (bug d'une version caisse déployée puis retirée)
UPDATE lignes_ticket l
SET remise = round(l.prix_unitaire_ttc * l.qte * 0.20, 2)
FROM tickets_caisse t
WHERE t.id = l.ticket_id
  AND t.magasin_id = 2 AND t.num_caisse = 7
  AND t.date_ticket >= '2026-10-02' AND t.date_ticket < '2026-10-05'
  AND l.id % 2 = 0;

UPDATE tickets_caisse t
SET total_ttc = s.brut
FROM (
  SELECT ticket_id, sum(qte * prix_unitaire_ttc) AS brut
  FROM lignes_ticket GROUP BY ticket_id
) s
WHERE s.ticket_id = t.id
  AND t.magasin_id = 2 AND t.num_caisse = 7
  AND t.date_ticket >= '2026-10-02' AND t.date_ticket < '2026-10-05';

-- Cartes fidélité sur environ un ticket sur trois
UPDATE tickets_caisse SET carte_fidelite = 'FID' || lpad((1 + id % 600)::text, 6, '0')
WHERE id % 3 = 0;

-- ---------------------------------------------------------------------
-- Fidélité
-- ---------------------------------------------------------------------
CREATE TABLE clients_fidelite (
  id          serial PRIMARY KEY,
  num_carte   text NOT NULL UNIQUE,
  nom         text NOT NULL,
  prenom      text NOT NULL,
  email       text,
  magasin_id  int REFERENCES magasins(id),
  cree_le     date NOT NULL
);

INSERT INTO clients_fidelite (num_carte, nom, prenom, email, magasin_id, cree_le)
SELECT 'FID' || lpad(g::text, 6, '0'),
       (ARRAY['Martin','Bernard','Dubois','Thomas','Robert','Richard','Petit','Durand','Leroy','Moreau'])[1 + g % 10],
       (ARRAY['Marie','Jean','Nathalie','Pierre','Isabelle','Michel','Sophie','Philippe','Catherine','Alain','Sylvie'])[1 + g % 11],
       CASE WHEN g % 17 = 0 THEN NULL
            ELSE lower((ARRAY['marie','jean','nath','pierre','isa','michel','sophie','phil','cath','alain','sylvie'])[1 + g % 11])
                 || '.' || g || '@exemple.fr' END,
       1 + g % 4,
       date '2019-01-01' + (g * 3)
FROM generate_series(1, 600) g;

-- Doublons : clients qui ont recréé une carte (email saisi différemment)
INSERT INTO clients_fidelite (num_carte, nom, prenom, email, magasin_id, cree_le) VALUES
  ('FID900001', 'Durand', 'Pierre',   'Pierre.47@exemple.fr ',  1, '2026-09-12'),
  ('FID900002', 'DURAND', 'Pierre',   'PIERRE.47@EXEMPLE.FR',   2, '2026-10-03'),
  ('FID900003', 'Martin', 'Sylvie',   ' sylvie.120@exemple.fr', 3, '2026-09-30'),
  ('FID900004', 'Leroy',  'Philippe', 'Phil.238@Exemple.fr',    4, '2026-10-15'),
  ('FID900005', 'Petit',  'Michel',   'michel.346@exemple.fr',  1, '2026-10-20');

-- ---------------------------------------------------------------------
-- Promotions
-- ---------------------------------------------------------------------
CREATE TABLE prix_promos (
  id          serial PRIMARY KEY,
  produit_id  int NOT NULL REFERENCES produits(id),
  magasin_id  int REFERENCES magasins(id),   -- NULL = opération nationale (tous magasins)
  prix_promo  numeric(10,2) NOT NULL,
  debut       date NOT NULL,
  fin         date NOT NULL                 -- inclus
);

INSERT INTO prix_promos (produit_id, magasin_id, prix_promo, debut, fin)
SELECT p.id, NULL, round(p.prix_ttc * 0.8, 2), date '2026-09-15', date '2026-09-28'
FROM produits p WHERE p.id BETWEEN 20 AND 39;

INSERT INTO prix_promos (produit_id, magasin_id, prix_promo, debut, fin)
SELECT p.id, 1, round(p.prix_ttc * 0.75, 2), date '2026-10-05', date '2026-10-18'
FROM produits p WHERE p.id BETWEEN 80 AND 95;

-- Chevauchements : opérations saisies deux fois avec des dates qui se recouvrent
INSERT INTO prix_promos (produit_id, magasin_id, prix_promo, debut, fin) VALUES
  (88, 1, 1.99, '2026-10-12', '2026-10-25'),
  (91, 1, 2.49, '2026-10-01', '2026-10-07'),
  (25, NULL, 0.99, '2026-09-25', '2026-10-02');

-- ---------------------------------------------------------------------
-- Stocks et mouvements
-- ---------------------------------------------------------------------
CREATE TABLE mouvements_stock (
  id          bigserial PRIMARY KEY,
  magasin_id  int NOT NULL,
  produit_id  int NOT NULL,
  type_mvt    text NOT NULL,          -- RECEPTION | VENTE | CASSE | INVENTAIRE
  qte         numeric(10,3) NOT NULL, -- signée : + entrée, - sortie
  date_mvt    timestamptz NOT NULL
);

-- Stock initial (inventaire du 31 août)
INSERT INTO mouvements_stock (magasin_id, produit_id, type_mvt, qte, date_mvt)
SELECT m.id, p.id, 'INVENTAIRE', 60 + floor(random() * 60), timestamptz '2026-08-31 22:00'
FROM magasins m CROSS JOIN produits p
WHERE m.actif AND p.id <= 400;

-- Réceptions chaque lundi matin
INSERT INTO mouvements_stock (magasin_id, produit_id, type_mvt, qte, date_mvt)
SELECT m.id, p.id, 'RECEPTION', 24 + floor(random() * 30), d + interval '6 hours'
FROM magasins m
CROSS JOIN produits p
CROSS JOIN generate_series(timestamptz '2026-09-07', timestamptz '2026-10-19', interval '7 days') d
WHERE m.actif AND p.id <= 400;

-- Ventes : une sortie par ligne de ticket validé
INSERT INTO mouvements_stock (magasin_id, produit_id, type_mvt, qte, date_mvt)
SELECT t.magasin_id, l.produit_id, 'VENTE', -l.qte, t.date_ticket
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
JOIN produits p ON p.id = l.produit_id
WHERE t.statut = 'VALIDE';

-- Casse
INSERT INTO mouvements_stock (magasin_id, produit_id, type_mvt, qte, date_mvt)
SELECT 1 + floor(random() * 4)::int, 1 + floor(random() * 400)::int, 'CASSE',
       -(1 + floor(random() * 4)), timestamptz '2026-09-01' + random() * interval '53 days'
FROM generate_series(1, 300);

CREATE TABLE stocks (
  magasin_id  int NOT NULL,
  produit_id  int NOT NULL,
  qte         numeric(10,3) NOT NULL,
  maj_le      timestamptz NOT NULL,
  PRIMARY KEY (magasin_id, produit_id)
);

-- Le batch nocturne de mise à jour des stocks recalcule à partir des mouvements.
-- Pour Périgueux (magasin 3), il est en échec depuis le 22 octobre : stock figé au 21 au soir.
INSERT INTO stocks (magasin_id, produit_id, qte, maj_le)
SELECT magasin_id, produit_id, sum(qte),
       CASE WHEN magasin_id = 3 THEN timestamptz '2026-10-21 23:40' ELSE timestamptz '2026-10-24 23:40' END
FROM mouvements_stock
WHERE magasin_id <> 3 OR date_mvt < '2026-10-22'
GROUP BY magasin_id, produit_id;

-- ---------------------------------------------------------------------
-- Supervision des flux (interfaces / batchs)
-- ---------------------------------------------------------------------
CREATE TABLE imports_log (
  id          bigserial PRIMARY KEY,
  flux        text NOT NULL,      -- PRODUITS | PRIX | STOCKS | VENTES
  magasin_id  int,
  fichier     text NOT NULL,
  debut       timestamptz NOT NULL,
  fin         timestamptz,
  statut      text NOT NULL,      -- OK | ERREUR | EN_COURS
  nb_lignes   int,
  nb_rejets   int,
  message     text
);

INSERT INTO imports_log (flux, magasin_id, fichier, debut, fin, statut, nb_lignes, nb_rejets, message)
SELECT f, m.id,
       lower(f) || '_' || m.code || '_' || to_char(d, 'YYYYMMDD') || '.csv',
       d + (CASE f WHEN 'PRODUITS' THEN 1 WHEN 'PRIX' THEN 2 WHEN 'VENTES' THEN 3 ELSE 4 END) * interval '25 minutes',
       d + (CASE f WHEN 'PRODUITS' THEN 1 WHEN 'PRIX' THEN 2 WHEN 'VENTES' THEN 3 ELSE 4 END) * interval '25 minutes'
         + (2 + random() * 10) * interval '1 minute',
       'OK',
       400 + floor(random() * 2000)::int,
       CASE WHEN random() < 0.1 THEN floor(random() * 5)::int ELSE 0 END,
       NULL
FROM generate_series(timestamptz '2026-10-01 22:00', timestamptz '2026-10-24 22:00', interval '1 day') d
CROSS JOIN (VALUES ('PRODUITS'), ('PRIX'), ('VENTES'), ('STOCKS')) v(f)
CROSS JOIN magasins m
WHERE m.actif;

-- Échecs du flux STOCKS de Périgueux depuis le 22 octobre
UPDATE imports_log
SET statut = 'ERREUR', nb_lignes = 0, nb_rejets = NULL,
    message = 'ERROR: duplicate key value violates unique constraint "stocks_pkey" (fichier contient 2 fois le couple magasin/produit 3/57)'
WHERE flux = 'STOCKS' AND magasin_id = 3 AND debut >= '2026-10-22';

-- Flux PRIX de Mont-de-Marsan bloqué depuis la nuit du 23 au 24
UPDATE imports_log
SET statut = 'EN_COURS', fin = NULL, nb_lignes = NULL, nb_rejets = NULL
WHERE flux = 'PRIX' AND magasin_id = 4 AND debut::date = '2026-10-24';

-- Flux PRODUITS de Saintes : taux de rejet anormal le 18 octobre, et encore la dernière nuit
UPDATE imports_log
SET nb_lignes = 1850, nb_rejets = 412, message = '412 lignes rejetées : prix invalide'
WHERE flux = 'PRODUITS' AND magasin_id = 2 AND debut::date = '2026-10-18';

UPDATE imports_log
SET nb_lignes = 1702, nb_rejets = 131, message = '131 lignes rejetées : rayon inconnu'
WHERE flux = 'PRODUITS' AND magasin_id = 2 AND debut::date = '2026-10-24';

-- ---------------------------------------------------------------------
-- Zone de transit d'un import produits fournisseur (tout en texte, non contrôlé)
-- ---------------------------------------------------------------------
CREATE TABLE import_produits_staging (
  num_ligne  int PRIMARY KEY,
  ean        text,
  libelle    text,
  prix       text,
  rayon      text
);

INSERT INTO import_produits_staging VALUES
  (1,  '3012345678901', 'Biscuits sablés Nos Régions',  '2.35',  'Épicerie'),
  (2,  '3012345678918', 'Crème fraîche 30%',            '1,89',  'Frais'),
  (3,  '301234567892',  'Eau gazeuse 6x1L',             '3.10',  'Boissons'),
  (4,  '3012345678932', '',                             '4.20',  'DPH'),
  (5,  '3012345678949', 'Poires Conférence',            '2.99',  'Fruits & légumes'),
  (6,  '3012345678956', 'Glace vanille 1L',             '-3.50', 'Surgelés'),
  (7,  '3000000451383', 'Riz basmati 1kg',             '2.79',  'Épicerie'),
  (8,  '30123456789AB', 'Liquide vaisselle',            '1.45',  'DPH'),
  (9,  '3012345678987', 'Jus d''orange 1L',             ' 1.99', 'Boissons'),
  (10, '3012345678994', 'Comté 12 mois',                '6.90€', 'Frais'),
  (11, '3012345679007', 'Café moulu 250g',              '3.49',  'épicerie'),
  (12, '3012345678901', 'Biscuits sablés Nos Régions',  '2.35',  'Épicerie'),
  (13, '3012345679021', 'Petits pois surgelés',         NULL,    'Surgelés'),
  (14, '3012345679038', 'Lessive liquide 2L',           '8.99',  'DPH');

-- ---------------------------------------------------------------------
-- Statistiques et récapitulatif
-- ---------------------------------------------------------------------
ANALYZE;

SELECT 'magasins' AS table_, count(*) FROM magasins
UNION ALL SELECT 'produits', count(*) FROM produits
UNION ALL SELECT 'tickets_caisse', count(*) FROM tickets_caisse
UNION ALL SELECT 'lignes_ticket', count(*) FROM lignes_ticket
UNION ALL SELECT 'mouvements_stock', count(*) FROM mouvements_stock
UNION ALL SELECT 'stocks', count(*) FROM stocks
UNION ALL SELECT 'prix_promos', count(*) FROM prix_promos
UNION ALL SELECT 'clients_fidelite', count(*) FROM clients_fidelite
UNION ALL SELECT 'imports_log', count(*) FROM imports_log
UNION ALL SELECT 'import_produits_staging', count(*) FROM import_produits_staging;
