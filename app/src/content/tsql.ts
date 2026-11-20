/**
 * Correspondances SQL Server (T-SQL) → PostgreSQL. Colonne pg vérifiée sur PostgreSQL 16.
 */
export type Equiv = { cat: string; tsql: string; pg: string; note?: string }

export const equivs: Equiv[] = [
  // Dates
  { cat: 'Dates', tsql: 'GETDATE()  ·  SYSDATETIME()', pg: 'now()  ·  clock_timestamp()', note: "now() = début de la transaction, clock_timestamp() = instant réel de l'appel." },
  { cat: 'Dates', tsql: 'CAST(GETDATE() AS date)', pg: 'current_date' },
  { cat: 'Dates', tsql: 'DAY(d)  ·  MONTH(d)  ·  YEAR(d)', pg: 'extract(day FROM d)  ·  extract(month FROM d)  ·  extract(year FROM d)' },
  { cat: 'Dates', tsql: 'DATEPART(weekday, d)', pg: 'extract(isodow FROM d)', note: 'isodow : 1 = lundi … 7 = dimanche, fixe. En T-SQL le résultat dépend de SET DATEFIRST.' },
  { cat: 'Dates', tsql: 'DATEPART(iso_week, d)', pg: "extract(week FROM d)  ·  to_char(d, 'IW')" },
  { cat: 'Dates', tsql: 'DATENAME(weekday, d)  ·  DATENAME(month, d)', pg: "to_char(d, 'FMDay')  ·  to_char(d, 'FMMonth')", note: 'En anglais sauf locale installée : voir la fiche « Nom du jour / du mois ».' },
  { cat: 'Dates', tsql: 'DATEADD(day, 7, d)', pg: "d + 7  ·  d + interval '7 days'", note: 'date + entier = date ; date + interval = timestamp.' },
  { cat: 'Dates', tsql: 'DATEADD(month, 1, d)', pg: "d + interval '1 month'", note: '31/01 + 1 mois = 28/02, comme en T-SQL.' },
  { cat: 'Dates', tsql: 'DATEDIFF(day, d1, d2)', pg: 'd2::date - d1::date', note: "T-SQL compte les minuits franchis : d2::date - d1::date fait pareil, y compris sur des timestamps (23h50 → 00h10 = 1)." },
  { cat: 'Dates', tsql: 'DATEDIFF(minute, t1, t2)', pg: 'extract(epoch FROM t2 - t1) / 60', note: 'Durée réelle, pas un comptage de frontières : peut différer d’une unité du résultat T-SQL.' },
  { cat: 'Dates', tsql: 'DATEDIFF(month, d1, d2)', pg: '(extract(year FROM d2) - extract(year FROM d1)) * 12 + extract(month FROM d2) - extract(month FROM d1)', note: "Mois calendaires franchis. Pour un écart « réel » en années / mois / jours : age(d2, d1)." },
  { cat: 'Dates', tsql: 'EOMONTH(d)', pg: "(date_trunc('month', d) + interval '1 month - 1 day')::date" },
  { cat: 'Dates', tsql: 'DATEFROMPARTS(2026, 10, 15)', pg: 'make_date(2026, 10, 15)' },
  { cat: 'Dates', tsql: 'DATETRUNC(month, d)', pg: "date_trunc('month', d)" },
  { cat: 'Dates', tsql: "FORMAT(d, 'dd/MM/yyyy HH:mm')", pg: "to_char(d, 'DD/MM/YYYY HH24:MI')", note: 'Motifs différents : MM = mois, MI = minutes, HH24 = heure sur 24 h.' },
  { cat: 'Dates', tsql: "CONVERT(date, '15/10/2026', 103)", pg: "to_date('15/10/2026', 'DD/MM/YYYY')", note: "'15/10/2026'::date échoue ici (DateStyle ISO, MDY) : toujours donner le format." },
  { cat: 'Dates', tsql: "ISDATE('2026-10-15')", pg: "pg_input_is_valid('2026-10-15', 'date')", note: "PostgreSQL 16+. Renvoie un booléen (pas 1/0). ISDATE('123') = 0 ; pg_input_is_valid('123', 'date') = false." },
  { cat: 'Dates', tsql: "d AT TIME ZONE 'Romance Standard Time'", pg: "d AT TIME ZONE 'Europe/Paris'", note: 'Noms de fuseaux IANA (Europe/Paris), pas les noms Windows.' },
  { cat: 'Dates', tsql: 'datetime  ·  datetime2', pg: 'timestamp' },
  { cat: 'Dates', tsql: 'datetimeoffset', pg: 'timestamptz', note: 'timestamptz ne garde pas le décalage d’origine : il stocke un instant et l’affiche dans le fuseau de la session.' },

  // Texte
  { cat: 'Texte', tsql: "'a' + 'b'", pg: "'a' || 'b'  ·  concat('a', 'b')", note: "|| avec un NULL donne NULL ; concat() ignore les NULL." },
  { cat: 'Texte', tsql: 'LEN(s)', pg: 'length(s)', note: "LEN ignore les espaces de fin, length les compte : length('ab  ') = 4." },
  { cat: 'Texte', tsql: "CHARINDEX('cd', s)", pg: "strpos(s, 'cd')  ·  position('cd' IN s)", note: 'Attention à l’ordre des arguments, inversé avec strpos.' },
  { cat: 'Texte', tsql: "REPLICATE('ab', 3)", pg: "repeat('ab', 3)" },
  { cat: 'Texte', tsql: "STRING_SPLIT(s, ',')", pg: "string_to_table(s, ',')", note: "PostgreSQL 14+. Sinon unnest(string_to_array(s, ','))." },
  { cat: 'Texte', tsql: "STUFF((SELECT ',' + x … FOR XML PATH('')), 1, 1, '')", pg: "string_agg(x, ',' ORDER BY x)" },
  { cat: 'Texte', tsql: "s LIKE 'abc%'  (insensible à la casse selon la collation)", pg: "s ILIKE 'abc%'", note: 'En PostgreSQL, LIKE est toujours sensible à la casse.' },
  { cat: 'Texte', tsql: "s LIKE '[a-c]%'", pg: "s ~ '^[a-c]'", note: "LIKE ne connaît pas les crochets en PostgreSQL : expression régulière avec ~ (ou ~* insensible à la casse)." },
  { cat: 'Texte', tsql: 'nvarchar(n)  ·  varchar(max)', pg: 'varchar(n)  ·  text', note: 'Tout est Unicode (UTF-8) : pas de N devant les chaînes.' },

  // NULL et conversions
  { cat: 'NULL et conversions', tsql: 'ISNULL(x, 0)', pg: 'coalesce(x, 0)', note: 'coalesce accepte plus de deux arguments.' },
  { cat: 'NULL et conversions', tsql: 'IIF(cond, a, b)', pg: 'CASE WHEN cond THEN a ELSE b END' },
  { cat: 'NULL et conversions', tsql: "TRY_CAST(s AS int)", pg: "CASE WHEN pg_input_is_valid(s, 'integer') THEN s::int END", note: 'PostgreSQL 16+. Sans conversion possible : NULL, comme TRY_CAST.' },
  { cat: 'NULL et conversions', tsql: 'ISNUMERIC(s)', pg: "pg_input_is_valid(s, 'numeric')", note: "Avant PostgreSQL 16 : s ~ '^-?[0-9]+(\\.[0-9]+)?$'." },
  { cat: 'NULL et conversions', tsql: 'CAST(x AS varchar)  ·  CONVERT(int, s)', pg: 'x::text  ·  s::int', note: 'CAST(… AS …) marche aussi en PostgreSQL.' },
  { cat: 'NULL et conversions', tsql: 'NEWID()', pg: 'gen_random_uuid()' },
  { cat: 'NULL et conversions', tsql: 'bit', pg: 'boolean', note: 'true / false, et non 1 / 0.' },
  { cat: 'NULL et conversions', tsql: 'money', pg: 'numeric(12, 2)' },

  // Requêtes
  { cat: 'Requêtes', tsql: 'SELECT TOP 10 …', pg: 'SELECT … LIMIT 10' },
  { cat: 'Requêtes', tsql: 'OFFSET 20 ROWS FETCH NEXT 10 ROWS ONLY', pg: 'LIMIT 10 OFFSET 20', note: 'La syntaxe OFFSET … FETCH marche aussi.' },
  { cat: 'Requêtes', tsql: '[ma colonne]', pg: '"ma colonne"', note: 'Sans guillemets, PostgreSQL met les noms en minuscules.' },
  { cat: 'Requêtes', tsql: 'CROSS APPLY  ·  OUTER APPLY', pg: 'CROSS JOIN LATERAL  ·  LEFT JOIN LATERAL … ON true' },
  { cat: 'Requêtes', tsql: 'SELECT … INTO nouvelle_table FROM …', pg: 'CREATE TABLE nouvelle_table AS SELECT … FROM …' },
  { cat: 'Requêtes', tsql: 'UPDATE t SET … FROM t JOIN u ON …', pg: 'UPDATE t SET … FROM u WHERE t.id = u.t_id', note: 'Ne pas répéter t dans le FROM : ce serait une deuxième copie de la table, donc un produit cartésien.' },
  { cat: 'Requêtes', tsql: 'OUTPUT inserted.*  ·  SCOPE_IDENTITY()', pg: 'RETURNING *  ·  RETURNING id' },
  { cat: 'Requêtes', tsql: 'QUALIFY rn = 1  (Snowflake, BigQuery, Teradata ; absent de SQL Server)', pg: 'SELECT * FROM (SELECT …, row_number() OVER (…) AS rn FROM t) x WHERE rn = 1', note: "QUALIFY n'existe pas en PostgreSQL : une fonction de fenêtre se filtre dans une sous-requête ou une CTE. Pour « le premier par groupe », DISTINCT ON est plus court." },
  { cat: 'Requêtes', tsql: 'PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY x) OVER (PARTITION BY g)', pg: 'percentile_cont(0.5) WITHIN GROUP (ORDER BY x) … GROUP BY g', note: 'En PostgreSQL, percentile_cont est un agrégat seulement, sans OVER.' },
  { cat: 'Requêtes', tsql: 'MERGE …', pg: 'INSERT … ON CONFLICT (cle) DO UPDATE SET …', note: 'MERGE existe aussi depuis PostgreSQL 15.' },
  { cat: 'Requêtes', tsql: 'WITH (NOLOCK)', pg: '(rien)', note: 'MVCC : une lecture ne bloque jamais une écriture, et ne lit jamais de données non validées.' },
  { cat: 'Requêtes', tsql: '@@ROWCOUNT', pg: 'RETURNING, ou le message « UPDATE n »', note: 'Dans une fonction PL/pgSQL : GET DIAGNOSTICS n = ROW_COUNT.' },

  // Structure et outils
  { cat: 'Structure et outils', tsql: 'id int IDENTITY(1, 1)', pg: 'id int GENERATED ALWAYS AS IDENTITY', note: 'Ou serial (ancienne forme).' },
  { cat: 'Structure et outils', tsql: 'BEGIN TRAN  ·  COMMIT TRAN', pg: 'BEGIN  ·  COMMIT' },
  { cat: 'Structure et outils', tsql: 'GO', pg: ';', note: "GO n'est pas du SQL mais un séparateur de lots de SSMS." },
  { cat: 'Structure et outils', tsql: "PRINT 'x'", pg: "RAISE NOTICE 'x'  (dans un DO / une fonction)  ·  \\echo x  (psql)" },
  { cat: 'Structure et outils', tsql: 'sp_help t', pg: '\\d t  (psql)  ·  information_schema.columns' },
  { cat: 'Structure et outils', tsql: 'sp_who2', pg: 'SELECT * FROM pg_stat_activity' },
  { cat: 'Structure et outils', tsql: 'SELECT @@VERSION', pg: 'SELECT version()' },
]
