# Training SQL · PostgreSQL

[![CI](https://github.com/nseaSeb/training_sql/actions/workflows/ci.yml/badge.svg)](https://github.com/nseaSeb/training_sql/actions/workflows/ci.yml)

Mini-site React pour s'entraîner au SQL sur une vraie base PostgreSQL :

- **Exercices corrigés automatiquement** (débutant → avancé) : ta requête et la solution sont exécutées sur la base, chacune dans une transaction annulée, puis leurs résultats sont comparés. Les exercices d'écriture (`UPDATE`, `CREATE TABLE`, vues, index…) sont corrigés par une requête de contrôle.
- **Cours visuels**, méthode, lexique et cheatsheet (avec les équivalences SQL Server).
- **Dialectes** : le même besoin en PostgreSQL, MySQL, SQL Server, Oracle et SQLite (pagination, dates, texte, NULL, upsert…).
- **Tickets d'incidents** réalistes avec indices et solutions commentées.
- **Playground** SQL en direct, sur **PostgreSQL ou SQLite** au choix (mêmes données dans les deux), et **auto-évaluation**.

Le jeu de données (schéma `retail` : magasins, produits, tickets de caisse, stocks, flux d'import…) est dans `kit/`.

![Accueil](docs/screenshots/accueil.png)

| Exercices | Dialectes |
|---|---|
| ![Exercices](docs/screenshots/exercices.png) | ![Dialectes](docs/screenshots/dialectes.png) |

| Cours | Tickets | Playground |
|---|---|---|
| ![Cours](docs/screenshots/cours.png) | ![Tickets](docs/screenshots/tickets.png) | ![Playground](docs/screenshots/playground.png) |

## Démarrer

Seul prérequis : Docker.

```bash
docker compose up -d --build  # site + API + PostgreSQL 16
```

Le training est sur http://localhost:47180.

### Développer

Prérequis supplémentaire : Node.js 24.

```bash
docker compose up -d training_sql_pg   # la base seule, port 55433
cd app && npm install
npm run dev                            # API sur :3381 + site sur http://localhost:47115
```

| Service | Adresse |
|---|---|
| Site | http://localhost:47115 |
| API (Express + pg) | http://localhost:3381 |
| Postgres | `postgres://kit:kit@localhost:55433/training_sql` |

Se connecter en ligne de commande : `docker exec -it training_sql_pg psql -U kit -d training_sql`
(le `search_path` est déjà sur `retail` et le fuseau sur `Europe/Paris`).

## Remettre la base à zéro

- Depuis le playground : bouton « Réinitialiser la base » (rejoue `kit/01_setup_base.sql`).
- Ou recréer complètement le conteneur : `docker compose down -v && docker compose up -d`.

## Playground

- Une instruction exécutée sans `BEGIN` est validée tout de suite : un `UPDATE` ou un `DELETE` seul modifie la base.
- Pour tester sans risque, encadrer par `BEGIN; … ROLLBACK;` : une transaction laissée ouverte est annulée à la fin de l'exécution.
- « Réinitialiser la base » remet le jeu de données d'origine.
- Les méta-commandes psql (`\echo`, `\pset`…) sont ignorées.
- L'affichage est limité à 1000 lignes et chaque requête à 15 s.

## Déployer

Le `Dockerfile` construit le site et le sert avec l'API sur `$PORT`. Variables d'environnement :

- `DATABASE_URL` : connexion superutilisateur, utilisée seulement au démarrage.
- `KIT_APP_PASSWORD` : si défini, l'API exécute les requêtes avec un rôle restreint `kit_app` (non superutilisateur, propriétaire du seul schéma `retail`).
- `SITE_USER` / `SITE_PASSWORD` : si `SITE_PASSWORD` est défini, tout le site est protégé par une authentification Basic.

## Tests

```bash
cd app
npm test                 # tests unitaires
npm run test:db          # exercices et moteurs contre la base (docker compose up -d training_sql_pg avant)
```

## Ajouter un exercice

Les exercices sont dans `app/src/content/exercises.ts`. Chacun a un énoncé, une solution et, pour un exercice d'écriture, une requête `check` relue après la réponse. L'énoncé doit donner les colonnes attendues dans l'ordre : la comparaison se fait par position. `npm run test:db` vérifie que la solution passe et qu'une réponse vide ou « ne rien faire » échoue.

## Licence

[MIT](LICENSE)
