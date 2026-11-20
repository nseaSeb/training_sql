# Training SQL · PostgreSQL

Mini-site React pour s'entraîner au SQL sur une vraie base PostgreSQL : méthode, cours visuels, lexique, cheatsheet (avec les équivalences SQL Server), tickets d'incidents réalistes, playground en direct et auto-évaluation.

Le jeu de données (schéma `retail` : magasins, produits, tickets de caisse, stocks, flux d'import…) est dans `kit/`.

## Démarrer

Prérequis : Docker et Node.js 24.

```bash
docker compose up -d          # Postgres 16 sur le port 55432 (base training_sql, schéma retail)
cd app && npm install
npm run dev                   # API sur :3380 + site sur http://localhost:47101
```

| Service | Adresse |
|---|---|
| Site | http://localhost:47101 |
| API (Express + pg) | http://localhost:3380 |
| Postgres | `postgres://kit:kit@localhost:55432/training_sql` |

Se connecter en ligne de commande : `docker exec -it training_sql_pg psql -U kit -d training_sql`
(le `search_path` est déjà sur `retail` et le fuseau sur `Europe/Paris`).

## Remettre la base à zéro

- Depuis le playground : bouton « Réinitialiser la base » (rejoue `kit/01_setup_base.sql`).
- Ou recréer complètement le conteneur : `docker compose down -v && docker compose up -d`.

## Playground

- Chaque exécution est autonome : une transaction laissée ouverte est annulée à la fin.
- Un `COMMIT` explicite modifie la base.
- Les méta-commandes psql (`\echo`, `\pset`…) sont ignorées.
- L'affichage est limité à 1000 lignes et chaque requête à 15 s.

## Déployer

Le `Dockerfile` construit le site et le sert avec l'API sur `$PORT`. Variables d'environnement :

- `DATABASE_URL` : connexion superutilisateur, utilisée seulement au démarrage.
- `KIT_APP_PASSWORD` : si défini, l'API exécute les requêtes avec un rôle restreint `kit_app` (non superutilisateur, propriétaire du seul schéma `retail`).
- `SITE_USER` / `SITE_PASSWORD` : si `SITE_PASSWORD` est défini, tout le site est protégé par une authentification Basic.

## Tests

```bash
cd app && npm test
```
