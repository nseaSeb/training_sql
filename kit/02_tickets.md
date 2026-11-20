# Tickets d'entraînement — support applicatif retail

Base : schéma `retail` créé par `01_setup_base.sql` (PostgreSQL 12+).
Dans psql : `SET search_path = retail;` puis `\dt` et `\d nom_table` pour découvrir les tables.

Règle du jeu : pour chaque ticket, écris d'abord la requête de **diagnostic**, puis formule en une ou deux phrases la **cause** et la **réponse à l'utilisateur**. Quand une correction de données est demandée, fais-la dans une transaction (`BEGIN; … ROLLBACK;`). Les solutions sont dans `03_solutions.sql` : ne l'ouvre qu'après avoir cherché.

Données disponibles : ventes du 1er septembre au 24 octobre 2026, magasins 1 à 4 actifs, magasin 5 fermé.

---

## Niveau 1 — échauffement

### T01 · « Le client a payé trop cher »
> **De :** accueil Hyper Saintes
> Un client est revenu avec son ticket de la caisse 7 du 3 octobre. Il dit que la remise affichée sur les lignes n'a pas été déduite du total. Il y en a d'autres ?

À trouver : les tickets dont le `total_ttc` ne correspond pas à la somme des lignes (`qte × prix_unitaire_ttc − remise`). Sur quelle(s) caisse(s), quels jours, et quel montant à rembourser au total ?

Pour aller plus loin : le service client veut écrire aux clients fidélité concernés. Sors une ligne **par client** (prénom, nom, email, nombre de tickets, montant à rembourser, numéros des tickets). Combien de clients lésés ne pourront pas être prévenus par mail, et que proposer pour eux ?

### T02 · « La requête des produits jamais vendus ne renvoie rien »
> **De :** responsable référencement
> On veut la liste des produits jamais passés en caisse. Le service informatique nous a donné cette requête, elle renvoie 0 ligne. Pourtant les nouveautés ne sont pas encore en rayon.

```sql
SELECT id, ean, libelle
FROM produits
WHERE id NOT IN (SELECT produit_id FROM lignes_ticket);
```

À trouver : pourquoi 0 ligne, et la bonne requête.

### T03 · « Il manque des jours dans le rapport »
> **De :** direction Hyper Mont-de-Marsan
> Le rapport de CA quotidien d'octobre saute des jours. On veut tous les jours du mois jusqu'au 24, avec 0 quand le magasin n'a rien vendu.

```sql
SELECT date_ticket::date AS jour, sum(total_ttc) AS ca
FROM tickets_caisse
WHERE magasin_id = 4 AND date_ticket >= '2026-10-01'
GROUP BY 1 ORDER BY 1;
```

À trouver : la requête qui sort une ligne par jour (dimanches et jour d'inventaire compris), en excluant les tickets annulés.

### T04 · « Les produits non vendus disparaissent du rapport Frais »
> **De :** chef de rayon Frais
> Je veux tous les produits du rayon Frais avec leurs quantités vendues en octobre, même ceux à zéro. Avec cette requête je n'ai que les produits vendus.

```sql
SELECT p.id, p.libelle, coalesce(sum(l.qte), 0) AS qte_vendue
FROM produits p
LEFT JOIN lignes_ticket l  ON l.produit_id = p.id
LEFT JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE p.rayon = 'Frais'
  AND t.date_ticket >= '2026-10-01'
GROUP BY p.id, p.libelle
ORDER BY qte_vendue;
```

À trouver : pourquoi le `LEFT JOIN` se comporte comme un `INNER JOIN`, et la correction.

---

## Niveau 2 — incidents métier

### T05 · « Les ventes de pâtes s'effondrent »
> **De :** contrôle de gestion
> Selon le reporting par fiche produit, les ventes des pâtes EAN 3000000095028 chutent depuis le 10 octobre à Mérignac et Saintes. Le rayon dit pourtant que ça part comme d'habitude.

À trouver :
1. La cause (indice : regarde les EAN).
2. Les autres EAN concernés.
3. Les ventes par EAN (et non par fiche) avant/après le 10 octobre.
4. Une proposition de correction : rattacher les lignes de ventes aux fiches d'origine et désactiver les doublons. Écris-la en transaction, avec contrôle avant `COMMIT`.

### T06 · « Stocks négatifs »
> **De :** logistique
> L'écran stock affiche des quantités négatives sur quelques articles à Mérignac et Saintes. Ce n'est pas possible physiquement.

À trouver : les couples magasin/produit en négatif et l'explication (lien avec un autre ticket ?).

### T07 · « Le stock de Périgueux ne bouge plus »
> **De :** Hyper Périgueux
> Depuis quelques jours, les stocks affichés ne baissent plus alors qu'on vend. Le réassort automatique ne déclenche plus rien.

À trouver :
1. L'écart entre `stocks.qte` et la somme des `mouvements_stock`, par magasin.
2. Depuis quand le stock n'est plus mis à jour.
3. La cause côté flux (`imports_log`) et le message d'erreur exact à transmettre à l'équipe technique.

### T08 · « Point flux du matin »
> **De :** responsable support
> Chaque matin, je veux une requête qui me sort l'état du dernier passage de chaque flux pour chaque magasin, et qui met en évidence ce qui pose problème.

À produire : une requête qui donne, pour chaque couple (flux, magasin), **uniquement le dernier passage**, avec une colonne `alerte` :
- `ERREUR` si le statut est en erreur ;
- `BLOQUÉ` si le flux est `EN_COURS` depuis plus d'une heure (considère que « maintenant » = `2026-10-25 08:00`) ;
- `REJETS` si le taux de rejet dépasse 5 % ;
- `OK` sinon.

Bonus : sur tout l'historique, quel passage a eu le pire taux de rejet ?

### T09 · « Le CA de la station ne colle pas avec l'état de caisse »
> **De :** Hyper Mérignac, station-service
> Pour le 15 octobre, le rapport donne un CA différent de l'état de l'automate. La station est ouverte 24h/24.

```sql
SELECT date_trunc('day', date_ticket AT TIME ZONE 'UTC') AS jour,
       sum(total_ttc) AS ca
FROM tickets_caisse
WHERE magasin_id = 1 AND num_caisse = 99
GROUP BY 1
ORDER BY 1;
```

À trouver : pourquoi le découpage par jour est faux, combien de tickets basculent sur le mauvais jour pour le 15 octobre, et la requête corrigée. Vérifie aussi la règle sur les tickets annulés.

### T10 · « Le CA promo dépasse le CA total »
> **De :** marketing Hyper Mérignac
> Le rapport « CA réalisé sous promo » donne des montants trop élevés sur quelques produits (le 88 et le 91 notamment) : on a plus de CA promo que de ventes réelles pendant l'opération. Requête utilisée :

```sql
SELECT l.produit_id, sum(l.qte * l.prix_unitaire_ttc) AS ca_promo
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
JOIN prix_promos pp
  ON pp.produit_id = l.produit_id
 AND (pp.magasin_id = t.magasin_id OR pp.magasin_id IS NULL)
 AND t.date_ticket::date BETWEEN pp.debut AND pp.fin
WHERE t.magasin_id = 1
GROUP BY l.produit_id
ORDER BY 2 DESC;
```

À trouver :
1. Les promos qui se chevauchent (même produit, périodes qui se recouvrent, même magasin ou national).
2. Pourquoi le CA est gonflé.
3. Une requête qui compte chaque ligne une seule fois.

---

## Niveau 3 — analyse et données

### T11 · « Une cliente reçoit nos mails en double »
> **De :** service fidélité
> Des clients ont plusieurs cartes et leurs points sont répartis. Il faut la liste des doublons pour fusion.

À trouver : les clients en doublon sur l'email, en tenant compte des majuscules et des espaces parasites. Pour chaque groupe : les cartes concernées, la carte la plus ancienne (à conserver) et le nombre de tickets rattachés à chaque carte. Le service fidélité signale 4 clients ; tu en trouves combien par l'email ?

### T12 · « L'import fournisseur rejette des lignes »
> **De :** référencement
> On a chargé un fichier produits dans `import_produits_staging`. Avant intégration, on veut savoir quelles lignes vont poser problème et pourquoi.

Règles : EAN = 13 chiffres ; libellé non vide ; prix numérique strictement positif (on tolère la virgule décimale et les espaces autour) ; rayon parmi ceux de la table `produits` (sensible à la casse et aux accents) ; pas d'EAN en double dans le fichier ni déjà présent dans `produits`.

À produire :
1. Une requête qui liste chaque ligne avec son (ses) motif(s) de rejet.
2. L'`INSERT … SELECT` des lignes valides vers `produits`, avec conversion du prix (en transaction, `ROLLBACK` à la fin).

### T13 · « L'écran historique d'un article est lent »
> **De :** utilisateurs siège
> L'écran qui affiche l'historique de ventes d'un article met plusieurs secondes en production.

Requête de l'écran :

```sql
SELECT t.date_ticket, t.magasin_id, l.qte, l.prix_unitaire_ttc
FROM lignes_ticket l
JOIN tickets_caisse t ON t.id = l.ticket_id
WHERE l.produit_id = 150
ORDER BY t.date_ticket DESC
LIMIT 50;
```

À faire : lire le plan avec `EXPLAIN (ANALYZE, BUFFERS)`, identifier ce qui coûte, proposer un index, comparer avant/après. (Sur ce petit volume la différence se mesure en millisecondes, l'important est de savoir lire le plan.)

### T14 · « Classements pour le comité de direction »
> **De :** contrôle de gestion
> Deux tableaux pour octobre (tickets validés uniquement).

1. Le top 3 des produits par rayon en CA, tous magasins confondus, avec le rang.
2. Le CA par magasin et par semaine ISO (septembre et octobre), avec l'écart en % par rapport à la semaine précédente.

### T15 · « Lignes de vente sans produit »
> **De :** comptabilité
> Dans l'export comptable, certaines lignes de vente n'ont pas de rayon. Qu'est-ce que c'est ?

À trouver : distinguer les lignes **sans produit** (`produit_id` NULL) des lignes qui pointent vers un **produit inexistant**. Pour chaque cas : magasin, date, nombre de lignes, montant. Quelle explication donner à la comptabilité pour chacun ?

---

## Niveau 4 — compléments

### T16 · « Remettre le stock de Périgueux d'aplomb »
> **De :** équipe technique, suite à T07
> Le flux est corrigé pour ce soir, mais d'ici là le magasin a besoin d'un stock juste. Peux-tu recalculer `stocks` pour Périgueux à partir des mouvements ? Le batch fait un upsert, fais pareil.

À faire, dans une transaction :
1. Compter les couples magasin/produit dont le stock est faux.
2. Recalculer en une seule commande `INSERT … SELECT … ON CONFLICT … DO UPDATE` : les lignes existantes sont mises à jour, les manquantes créées.
3. Vérifier qu'il n'y a plus d'écart, puis `ROLLBACK` (on ne valide qu'avec l'accord écrit du demandeur).

### T17 · « L'export des tickets saute des lignes »
> **De :** équipe BI
> Notre export récupère les tickets par pages de 500 (`ORDER BY date_ticket LIMIT 500 OFFSET n`). Il est de plus en plus lent, et on retrouve parfois le même ticket sur deux pages pendant que les caisses tournent.

À trouver : pourquoi des doublons apparaissent, et une pagination qui n'en produit pas et garde un temps constant quelle que soit la page. Quel index proposer ?

### T18 · « Le CA lissé ne ressemble à rien »
> **De :** direction des magasins
> Je veux, pour Saintes, le CA par jour avec sa moyenne sur 7 jours glissants. Et pour chaque magasin, le panier type plutôt que le panier moyen.

À trouver :
1. La moyenne glissante calculée de deux façons (`ROWS` et `RANGE … interval`). Pourquoi diffèrent-elles à Saintes et pas à Mérignac ? Laquelle répond à la demande ?
2. Le panier moyen et le panier médian par magasin. Lequel décrit le mieux un client type ?

### T19 · « Porter un rapport SQL Server »
> **De :** contrôle de gestion
> On migre ce rapport de l'ancien serveur SQL Server, il ne passe pas sous PostgreSQL :

```sql
SELECT DATENAME(weekday, date_ticket) AS jour, COUNT(*) AS nb_tickets, AVG(total_ttc) AS panier_moyen
FROM tickets_caisse
WHERE DATEDIFF(day, date_ticket, '2026-10-24') < 28
  AND ISNULL(statut, '') = 'VALIDE'
GROUP BY DATENAME(weekday, date_ticket);
```

À faire : la version PostgreSQL, avec les jours **en français** et **dans l'ordre de la semaine**, découpés à l'heure de Paris. Quelles fonctions changent, et pourquoi la version la plus directe (`to_char(…, 'TMDay')`) ne suffit pas ici ?

### T20 · « Les commandes web arrivent en JSON »
> **De :** équipe e-commerce
> Le nouveau site envoie les commandes en JSON. Avant de brancher l'intégration, on voudrait savoir les lire en SQL.

Données d'essai (à mettre en tête de chaque requête) :

```sql
WITH commandes(doc) AS (VALUES
  ('{"num": "W-1001", "client": {"nom": "Durand", "carte": "FID00042"}, "total": "89.90", "tags": ["promo", "drive"]}'::jsonb),
  ('{"num": "W-1002", "client": {"nom": "Martin"}, "total": "9.90", "tags": []}'),
  ('{"num": "W-1003", "total": "120.00", "tags": ["promo"]}'),
  ('{"num": "W-1004", "client": {"nom": "Durand", "carte": "FID00042"}, "total": "15.00", "tags": ["drive"]}')
)
SELECT * FROM commandes;
```

À trouver : numéro, nom du client et total de chaque commande, triées du plus gros total au plus petit ; les commandes en promo ; les commandes sans client ; le total par client. Attention au tri.
