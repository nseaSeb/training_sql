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
]
