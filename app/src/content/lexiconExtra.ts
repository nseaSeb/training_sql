import type { Entry } from './lexicon'
import type { Plus } from './lexiconPlus'

/** Transactions approfondies, lecture de plan et filet de sécurité sans pg_dump. */
export const extra: Entry[] = [
  {
    name: 'SAVEPOINT', cat: 'Modifier',
    def: "Un point de sauvegarde à l'intérieur d'une transaction : on peut revenir à ce point sans tout annuler. Utile pour une correction en plusieurs étapes.",
    syntax: 'SAVEPOINT etape1;  …  ROLLBACK TO SAVEPOINT etape1;  …  COMMIT;',
    example: `BEGIN;\nUPDATE produits SET actif = false WHERE id = 401;\nSAVEPOINT apres_401;\nUPDATE produits SET actif = false;          -- oups : sans WHERE !\nSELECT count(*) FILTER (WHERE NOT actif) AS inactifs FROM produits;\nROLLBACK TO SAVEPOINT apres_401;            -- on annule seulement l'erreur\nSELECT count(*) FILTER (WHERE NOT actif) AS inactifs FROM produits;\nROLLBACK;`,
    piege: "Après une erreur SQL dans une transaction, tout est bloqué (« current transaction is aborted ») : ROLLBACK TO SAVEPOINT débloque sans perdre ce qui précède.",
    voir: ['BEGIN / COMMIT / ROLLBACK'], lesson: 'l-corriger',
  },
  {
    name: 'Verrous (FOR UPDATE)', cat: 'Modifier',
    def: "Pendant une transaction, chaque ligne modifiée est verrouillée : les autres sessions qui veulent la modifier attendent le COMMIT ou le ROLLBACK. SELECT … FOR UPDATE pose ce verrou dès la lecture.",
    syntax: 'BEGIN; SELECT … FROM t WHERE … FOR UPDATE; UPDATE …; COMMIT;',
    example: `BEGIN;\nSELECT magasin_id, produit_id, qte FROM stocks\nWHERE magasin_id = 3 AND produit_id = 57 FOR UPDATE;   -- ligne réservée\nSELECT locktype, mode, granted FROM pg_locks WHERE pid = pg_backend_pid();\nROLLBACK;`,
    piege: "Une transaction ouverte trop longtemps bloque l'application (écrans figés, batchs en attente). Règle : transaction courte, préparée à l'avance, jamais ouverte pendant qu'on réfléchit ou qu'on part déjeuner.",
    voir: ['pg_stat_activity'], lesson: 'l-perf',
  },
  {
    name: 'Lire un plan pas à pas', cat: 'Perf & admin',
    def: "Méthode pour lire la sortie d'EXPLAIN (ANALYZE, BUFFERS) sans se noyer : partir du nœud le plus indenté, remonter, et chercher où le temps et les lignes explosent.",
    syntax: 'EXPLAIN (ANALYZE, BUFFERS, COSTS OFF) SELECT …',
    example: `EXPLAIN (ANALYZE, BUFFERS)\nSELECT t.date_ticket, l.qte\nFROM lignes_ticket l\nJOIN tickets_caisse t ON t.id = l.ticket_id\nWHERE l.produit_id = 150\nORDER BY t.date_ticket DESC\nLIMIT 50;`,
    piege: "Ne pas conclure sur un petit volume : sur 60 000 lignes tout est rapide. Ce qui compte, c'est la forme du plan (Seq Scan sur une grosse table, estimation très fausse), qui sera catastrophique en production.",
    voir: ['EXPLAIN', 'CREATE INDEX'], lesson: 'l-perf',
  },
  {
    name: 'Bonnes pratiques de correction', cat: 'Filet de sécurité',
    def: "Les règles qui évitent l'incident causé par le support lui-même. Elles montrent qu'on est fiable avec un accès en écriture.",
    syntax: 'Lire → compter → sauvegarder → BEGIN → modifier → contrôler → faire valider → COMMIT → tracer',
    example: `-- Le squelette complet, à copier pour chaque correction\nCREATE TEMP TABLE sauv AS SELECT * FROM produits WHERE id > 400;   -- 1. sauvegarde\nSELECT count(*) AS a_modifier FROM sauv;                            -- 2. compter\nBEGIN;                                                              -- 3. transaction\nUPDATE produits SET actif = false WHERE id > 400 RETURNING id, actif;  -- 4. n lignes = compte ?\nSELECT id, actif FROM produits WHERE id > 400;                      -- 5. contrôle\nROLLBACK;                                                           -- 6. COMMIT après validation`,
    voir: ['Sauvegarde ciblée', 'Garde-fous de session', 'BEGIN / COMMIT / ROLLBACK'], lesson: 'l-corriger',
  },
  {
    name: 'Sauvegarde ciblée', cat: 'Filet de sécurité',
    def: "Sans pg_dump : copier uniquement les lignes qu'on va toucher dans une table de sauvegarde, dans la même base. Rapide, et la restauration se fait en SQL.",
    syntax: 'CREATE TABLE sauvegarde.inc4521_produits AS SELECT * FROM produits WHERE …;',
    example: `CREATE SCHEMA IF NOT EXISTS sauvegarde;\nCREATE TABLE sauvegarde.inc4521_produits AS\nSELECT *, now() AS sauve_le FROM produits WHERE id > 400;\nSELECT * FROM sauvegarde.inc4521_produits;\nDROP TABLE sauvegarde.inc4521_produits;  -- ménage de la démo`,
    piege: "Nommer avec le n° de ticket et la date, et la supprimer après un délai convenu (une semaine, un mois) : une base pleine de tables « backup_old2 » devient elle-même un problème.",
    voir: ['Restaurer depuis une sauvegarde', 'CREATE TABLE … AS'],
  },
  {
    name: 'Restaurer depuis une sauvegarde', cat: 'Filet de sécurité',
    def: "Remettre les valeurs d'origine à partir de la table de sauvegarde, avec un UPDATE … FROM (lignes modifiées) ou un INSERT … SELECT (lignes supprimées).",
    syntax: 'UPDATE t SET col = s.col FROM sauvegarde.x s WHERE s.id = t.id;',
    example: `CREATE TEMP TABLE sauv AS SELECT * FROM magasins;\nBEGIN;\nUPDATE magasins SET nom = upper(nom);                     -- la « mauvaise » correction\nUPDATE magasins m SET nom = s.nom FROM sauv s WHERE s.id = m.id   -- restauration\nRETURNING m.id, m.nom;\nROLLBACK;`,
    piege: "Préparer le script de retour arrière AVANT de lancer la correction, et le tester (dans une transaction annulée). Un retour arrière qu'on écrit dans l'urgence est une deuxième source d'erreur.",
    voir: ['Sauvegarde ciblée'],
  },
  {
    name: 'Export CSV (\\copy)', cat: 'Filet de sécurité',
    def: "Dans psql, \\copy écrit le résultat d'une requête dans un fichier CSV sur MON poste. Sert de sauvegarde hors base, et de livrable pour l'utilisateur (Excel).",
    syntax: "\\copy (SELECT …) TO 'fichier.csv' CSV HEADER",
    piege: "\\copy est une commande psql (côté client), elle ne marche pas dans le playground. COPY sans antislash écrit sur le SERVEUR et demande des droits élevés : en support, c'est toujours \\copy.",
    voir: ['Sauvegarde ciblée'],
  },
  {
    name: 'Journal des modifications', cat: 'Filet de sécurité',
    def: "Garder une trace de ce qui a été changé, par qui, quand et pour quel ticket, en enregistrant les lignes avant / après grâce à RETURNING.",
    syntax: 'WITH avant AS (…), maj AS (UPDATE … RETURNING …) INSERT INTO journal SELECT …',
    example: `CREATE TEMP TABLE journal (ticket text, table_ text, id int, avant jsonb, apres jsonb, fait_par text, fait_le timestamptz);\nBEGIN;\nWITH avant AS (SELECT * FROM produits WHERE id = 401),\n     maj AS (UPDATE produits SET actif = false WHERE id = 401 RETURNING *)\nINSERT INTO journal\nSELECT 'INC-4521', 'produits', maj.id, to_jsonb(avant), to_jsonb(maj), current_user, now()\nFROM maj JOIN avant USING (id);\nSELECT * FROM journal;\nROLLBACK;`,
    voir: ['RETURNING'],
  },
  {
    name: 'Garde-fous de session', cat: 'Filet de sécurité',
    def: "Des réglages qu'on applique à SA session avant d'intervenir, pour qu'une erreur ne puisse pas faire de dégâts : lecture seule, durée maximale, attente maximale d'un verrou.",
    syntax: 'SET default_transaction_read_only = on;  SET statement_timeout = \'30s\';  SET lock_timeout = \'5s\';',
    example: `SET default_transaction_read_only = on;\nUPDATE magasins SET actif = true WHERE id = 5;   -- refusé : session en lecture seule`,
    piege: "Bonne habitude : se connecter en lecture seule par défaut, et ne passer en écriture (SET default_transaction_read_only = off) que pour la correction préparée.",
    voir: ['Bonnes pratiques de correction'],
  },
  {
    name: 'Copie complète sans pg_dump', cat: 'Filet de sécurité',
    def: "Copier une table entière ou une base entière avec du SQL, quand on veut un filet plus large qu'une sauvegarde ciblée.",
    syntax: 'CREATE TABLE copie (LIKE t INCLUDING ALL); INSERT INTO copie SELECT * FROM t;   ·   CREATE DATABASE copie TEMPLATE source;',
    example: `CREATE TEMP TABLE copie_stocks (LIKE stocks INCLUDING ALL);   -- même structure, contraintes et index\nINSERT INTO copie_stocks SELECT * FROM stocks;\nSELECT (SELECT count(*) FROM stocks) AS source, (SELECT count(*) FROM copie_stocks) AS copie;`,
    piege: "CREATE DATABASE … TEMPLATE exige que personne ne soit connecté à la base source, et des droits d'admin : c'est une opération pour l'équipe technique, pas pour le support.",
    voir: ['Sauvegarde ciblée'],
  },
]

export const plus3: Record<string, Plus> = {
  'BEGIN / COMMIT / ROLLBACK': {
    text: [
      "Les 4 garanties d'une transaction (ACID) : Atomicité (tout ou rien), Cohérence (les contraintes sont respectées à la fin), Isolation (les autres ne voient pas mes changements avant le COMMIT), Durabilité (après COMMIT, c'est écrit, même si le serveur tombe).",
      "Sans BEGIN, chaque instruction est sa propre transaction, validée immédiatement (« autocommit ») : un UPDATE raté est déjà définitif. C'est le comportement par défaut de psql et de la plupart des outils.",
      "Isolation au quotidien : pendant ma transaction, les autres sessions voient l'ANCIENNE version des lignes que je modifie (elles ne sont pas bloquées en lecture). Si elles veulent modifier les mêmes lignes, elles attendent mon COMMIT ou mon ROLLBACK.",
      "Procédure de correction en production : (1) SELECT qui compte les lignes concernées ; (2) sauvegarde (`CREATE TABLE sauvegarde.inc123 AS SELECT …`) ; (3) BEGIN ; (4) UPDATE … RETURNING, et vérifier que le nombre de lignes modifiées = le comptage ; (5) contrôle ; (6) COMMIT seulement si tout est conforme, sinon ROLLBACK.",
      "Si une erreur survient dans la transaction, Postgres la bloque (« current transaction is aborted ») : seul ROLLBACK (ou ROLLBACK TO SAVEPOINT) est accepté.",
      "Ce qui ne s'annule PAS : les séquences (un id consommé par un INSERT annulé ne reviendra pas : trous dans la numérotation, c'est normal), et les actions hors base (mail envoyé, fichier écrit par l'application).",
      "Danger : une transaction ouverte et oubliée (« idle in transaction ») garde ses verrous et peut bloquer l'application. Toujours terminer par COMMIT ou ROLLBACK, et garder la transaction courte.",
    ],
    sql: `-- Visible seulement dans ma transaction, puis annulé\nBEGIN;\nUPDATE magasins SET nom = 'TEST' WHERE id = 1;\nSELECT nom FROM magasins WHERE id = 1;   -- TEST\nROLLBACK;\nSELECT nom FROM magasins WHERE id = 1;   -- Hyper Mérignac`,
  },
  EXPLAIN: {
    text: [
      "EXPLAIN seul montre le plan PRÉVU avec des coûts estimés (unités arbitraires, pas des ms). EXPLAIN ANALYZE exécute vraiment la requête et ajoute les mesures réelles. BUFFERS ajoute les pages lues.",
      "Le plan est un arbre : chaque nœud reçoit des lignes de ses enfants (indentés en dessous, marqués ->) et en produit pour son parent. On lit donc de l'intérieur (en bas, le plus indenté) vers l'extérieur ; la première ligne est le résultat final.",
      "Sur chaque nœud : `cost=0.00..1234.56` (coût estimé au démarrage..total), `rows=` estimé, puis avec ANALYZE `actual time=0.01..12.3` (ms : première ligne..dernière ligne), `rows=` réel, `loops=` (nombre d'exécutions du nœud : multiplier temps et lignes par loops).",
      "Les nœuds d'accès : Seq Scan (lit toute la table), Index Scan (suit l'index puis lit la table), Index Only Scan (tout est dans l'index), Bitmap Index Scan + Bitmap Heap Scan (rassemble les adresses via l'index puis lit les pages dans l'ordre).",
      "Les jointures : Nested Loop (pour chaque ligne de gauche, chercher à droite : idéal si gauche est petite et droite indexée), Hash Join (construit une table de hachage du petit côté : bon pour de gros volumes sans index), Merge Join (deux entrées triées).",
      "Les 4 signaux d'alerte : (1) Seq Scan sur une grosse table avec `Rows Removed by Filter` énorme → index manquant ; (2) rows estimé très différent du réel (×10 ou plus) → statistiques à jour ? `ANALYZE table` ; (3) `Sort Method: external merge Disk` → tri sur disque, manque de mémoire (work_mem) ; (4) Nested Loop avec des loops énormes → mauvaise estimation, mauvais choix de jointure.",
      "Buffers : `shared hit` = pages trouvées en mémoire (rapide), `read` = lues sur disque (lent). Une requête lente au premier lancement puis rapide ensuite : c'est le cache qui se remplit.",
      "Ce que le support transmet à l'équipe technique : la requête exacte, le plan EXPLAIN (ANALYZE, BUFFERS), la fréquence d'utilisation de l'écran, le volume de la table, et si possible le plan après la piste proposée (index testé dans une transaction annulée).",
      "Attention : EXPLAIN ANALYZE sur un UPDATE / DELETE modifie vraiment les données. Toujours dans BEGIN … ROLLBACK.",
    ],
    sql: `EXPLAIN SELECT * FROM lignes_ticket WHERE produit_id = 150;            -- prévu seulement\nEXPLAIN (ANALYZE, BUFFERS) SELECT * FROM lignes_ticket WHERE produit_id = 150;   -- mesuré`,
  },
  'Lire un plan pas à pas': {
    text: [
      "Étape 1 : la première ligne donne le temps total (`Execution Time` tout en bas aussi). Est-ce vraiment lent ? Comparer à ce que l'utilisateur constate : si la base répond en 5 ms et l'écran en 5 s, le problème est ailleurs (réseau, application).",
      "Étape 2 : descendre jusqu'aux nœuds les plus indentés (les lectures de tables). Pour chacun : Seq Scan ou Index Scan ? Combien de lignes lues, combien gardées (`Rows Removed by Filter`) ?",
      "Étape 3 : remonter nœud par nœud en regardant où le `actual time` fait un saut : c'est là que le temps se perd. Le temps d'un nœud inclut celui de ses enfants.",
      "Étape 4 : comparer `rows` estimé et réel à chaque niveau. Une grosse erreur d'estimation explique souvent un mauvais choix de plan.",
      "Étape 5 : formuler une hypothèse (index sur la colonne filtrée, statistiques, requête à réécrire), la tester dans une transaction annulée, comparer les deux plans.",
      "Outil pratique : coller le plan dans explain.dalibo.com (outil français de Dalibo) pour une vue graphique. Vérifier d'abord que la requête ne contient pas de données sensibles.",
    ],
  },
  'Bonnes pratiques de correction': {
    text: [
      "Avant : (1) comprendre la cause, ne pas corriger un symptôme ; (2) avoir une demande écrite et validée (ticket, accord du métier) ; (3) tester sur une base de recette si elle existe ; (4) écrire le script complet ET le script de retour arrière avant de commencer.",
      "Pendant : session en lecture seule par défaut ; sauvegarde ciblée des lignes ; transaction courte ; RETURNING pour voir ce qui change ; le nombre de lignes modifiées doit être égal au comptage préalable, sinon ROLLBACK et on cherche pourquoi.",
      "Choisir le moment : éviter les heures de pointe et les fenêtres de batch (la nuit, les imports tournent : voir imports_log), prévenir si l'impact est visible pour les utilisateurs.",
      "Après : contrôle métier (l'utilisateur confirme que c'est bon), trace dans le ticket (requêtes exécutées, nombre de lignes, heure), fiche dans la base de connaissances si le cas peut revenir, et remontée de la cause racine à l'équipe technique (contrainte manquante, bug).",
      "Le principe des 4 yeux : pour une correction importante, faire relire le script par un collègue avant le COMMIT.",
      "Règle à appliquer : « Je ne modifie jamais de données en production sans sauvegarde des lignes, transaction, contrôle du nombre de lignes et validation du demandeur. »",
    ],
  },
  'Sauvegarde ciblée': {
    text: [
      "Pourquoi pas pg_dump à chaque fois : il sauvegarde toute la base (long, lourd), demande un accès au serveur, et la restauration écrase tout, y compris ce que les utilisateurs ont fait entre-temps. La sauvegarde ciblée ne garde que ce qu'on touche et permet une restauration ligne par ligne.",
      "Ajouter des colonnes de contexte : `now() AS sauve_le`, et éventuellement le n° de ticket, pour savoir plus tard d'où vient la table.",
      "Un schéma dédié (`sauvegarde`) évite de polluer le schéma applicatif et facilite le ménage : `\\dt sauvegarde.*`.",
      "Une table TEMP disparaît à la déconnexion : bien pour s'entraîner, mais insuffisant en production (si la connexion coupe, la sauvegarde est perdue). En prod : une vraie table.",
      "Les sauvegardes de la base (pg_dump, sauvegardes automatiques de l'hébergeur) restent le filet global, géré par l'équipe technique : demander quand a eu lieu la dernière avant une opération risquée.",
    ],
  },
}
