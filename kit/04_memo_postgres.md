# Mémo PostgreSQL — support applicatif

## Méthode sur un ticket « bug de requête »

1. **Reproduire** : rejouer la requête telle quelle, avec les mêmes paramètres, et noter le résultat attendu par l'utilisateur.
2. **Réduire** : retirer jointures et filtres un par un jusqu'à trouver celui qui change le résultat.
3. **Compter** : `count(*)` à chaque étape ; si un total gonfle après une jointure, chercher la duplication (`GROUP BY clé HAVING count(*) > 1`).
4. **Vérifier les NULL et les dates** : la moitié des écarts vient de là.
5. **Répondre** : cause en une phrase, requête corrigée, impact chiffré, et ce qu'il faut remonter à l'équipe technique.

## Pièges classiques

| Symptôme | Cause probable | Correction |
|---|---|---|
| `NOT IN (sous-requête)` renvoie 0 ligne | un NULL dans la sous-requête | `NOT EXISTS` |
| `LEFT JOIN` qui perd des lignes | condition sur la table de droite dans le `WHERE` | la mettre dans le `ON` |
| `SUM` trop gros après jointure | jointure 1-N non prévue (fan-out) | `EXISTS`, ou agréger avant de joindre |
| `col = NULL` ne trouve rien | NULL n'est égal à rien | `IS NULL`, `IS NOT DISTINCT FROM` |
| `count(col)` < `count(*)` | `count(col)` ignore les NULL | choisir selon ce qu'on compte |
| Chiffres d'un jour décalés | découpage en UTC, ou `::date` dépendant du fuseau de session | `AT TIME ZONE 'Europe/Paris'`, bornes `>= / <` |
| Division qui donne 0 | division entière `int / int` | `100.0 * a / b`, `a::numeric` |
| Division par zéro | dénominateur nul | `nullif(b, 0)` |
| Jours manquants dans un rapport | pas de ventes ces jours-là | `generate_series` + `LEFT JOIN` |
| Doublons « invisibles » | casse, espaces, accents | `lower(trim(x))`, `unaccent()` |

## Dates et fuseaux

```sql
SHOW timezone;                                      -- fuseau de la session
SELECT now(), now() AT TIME ZONE 'Europe/Paris';   -- timestamptz → heure locale (timestamp sans fuseau)
SELECT date_trunc('day', ts AT TIME ZONE 'Europe/Paris');
WHERE ts >= '2026-10-15' AND ts < '2026-10-16'      -- borne demi-ouverte, utilise les index
SELECT date_trunc('week', ts);                      -- lundi (semaine ISO)
SELECT to_char(ts, 'IYYY-"S"IW');                   -- 2026-S42
SELECT generate_series(date '2026-10-01', date '2026-10-31', interval '1 day');
```

`timestamptz` stocke un instant absolu ; l'affichage dépend du paramètre `timezone`. `timestamp` (sans fuseau) stocke une heure « murale » : mélanger les deux est une source fréquente d'écarts d'une ou deux heures.

## Requêtes utiles

```sql
-- Dernier enregistrement par groupe
SELECT DISTINCT ON (flux, magasin_id) * FROM imports_log ORDER BY flux, magasin_id, debut DESC;

-- Rang / top N par groupe
SELECT * FROM (
  SELECT *, row_number() OVER (PARTITION BY rayon ORDER BY ca DESC) rn FROM ...
) x WHERE rn <= 3;

-- Évolution par rapport à la ligne précédente
lag(ca) OVER (PARTITION BY magasin_id ORDER BY semaine)

-- Agrégats conditionnels
sum(montant) FILTER (WHERE statut = 'VALIDE')

-- Chevauchement de périodes
a.debut <= b.fin AND b.debut <= a.fin
daterange(a.debut, a.fin, '[]') && daterange(b.debut, b.fin, '[]')

-- Contrôle de format
ean ~ '^[0-9]{13}$'
```

## Corriger des données sans risque

```sql
BEGIN;
SELECT count(*) FROM t WHERE <condition>;   -- 1. compter ce qui va bouger
UPDATE t SET ... WHERE <condition>;          -- 2. vérifier que « UPDATE n » = le compte
SELECT ... ;                                 -- 3. contrôler le résultat
ROLLBACK;                                    -- ou COMMIT une fois validé
```

Avant toute correction en prod : sauvegarde des lignes touchées (`CREATE TABLE sauvegarde_ticket123 AS SELECT ...`), validation écrite du demandeur, et `UPDATE ... RETURNING *` pour garder une trace.

## Supervision et lenteurs

```sql
-- Qui tourne en ce moment, depuis combien de temps
SELECT pid, usename, state, now() - query_start AS duree, wait_event_type, left(query, 80)
FROM pg_stat_activity
WHERE state <> 'idle'
ORDER BY duree DESC;

-- Qui bloque qui
SELECT pid, pg_blocking_pids(pid) AS bloque_par, left(query, 80)
FROM pg_stat_activity
WHERE cardinality(pg_blocking_pids(pid)) > 0;

-- Transactions ouvertes oubliées (« idle in transaction »)
SELECT pid, usename, now() - xact_start AS ouverte_depuis
FROM pg_stat_activity WHERE state = 'idle in transaction';

SELECT pg_cancel_backend(pid);     -- annule la requête (doux)
SELECT pg_terminate_backend(pid);  -- coupe la session (à faire valider)
```

Lire un plan avec `EXPLAIN (ANALYZE, BUFFERS)` :
- `Seq Scan` + gros `Rows Removed by Filter` → index manquant sur la colonne filtrée ;
- écart important entre lignes estimées et réelles (`rows=` dans `EXPLAIN` vs `actual rows`) → statistiques à jour ? (`ANALYZE table`) ;
- `Sort Method: external merge` → tri sur disque (`work_mem`) ;
- `Nested Loop` avec beaucoup de `loops` → jointure mal estimée.

`EXPLAIN ANALYZE` **exécute** la requête : sur un `UPDATE`/`DELETE`, l'encadrer de `BEGIN; … ROLLBACK;`.

## psql

```
\dt schema.*        tables            \d table          structure
\di                 index             \x auto           affichage vertical si large
\timing on          durée             \e                éditer la dernière requête
\copy (SELECT ...) TO 'export.csv' CSV HEADER          export pour l'utilisateur
```
