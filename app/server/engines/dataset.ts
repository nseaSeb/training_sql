/**
 * Jeu de données d'origine du kit, extrait de PostgreSQL pour alimenter les autres moteurs.
 * On rejoue kit/01_setup_base.sql dans une transaction annulée (le script fixe setseed : les lignes sont
 * toujours les mêmes), on lit le schéma et les lignes, puis ROLLBACK : la base retail n'est pas touchée,
 * même si l'utilisateur l'a modifiée depuis. Le résultat est mis en cache dans DATA_DIR.
 */
import pg from 'pg'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { gunzipSync, gzipSync } from 'node:zlib'
import { join } from 'node:path'
import { createHash } from 'node:crypto'

export type Column = {
  name: string
  type: string // data_type PostgreSQL : integer, bigint, numeric, text, boolean, date, timestamp with time zone…
  precision: number | null
  scale: number | null
  nullable: boolean
  serial: boolean
  /** Valeur par défaut littérale déjà convertie (texte, nombre, booléen), ou null */
  default: string | number | boolean | null
}
export type Table = {
  name: string
  columns: Column[]
  pk: string[]
  uniques: string[][]
  fks: { cols: string[]; ref: string; refcols: string[] }[]
  rows: unknown[][]
}
export type Dataset = { tables: Table[] }

/** Convertit un DEFAULT PostgreSQL en littéral portable ; null si ce n'est pas un littéral simple. */
function literalDefault(raw: string | null, type: string): Column['default'] {
  if (raw === null || raw.startsWith('nextval(')) return null
  if (raw === 'true' || raw === 'false') return raw === 'true'
  if (/^-?\d+(\.\d+)?$/.test(raw)) return Number(raw)
  const m = /^'((?:[^']|'')*)'::/.exec(raw)
  if (!m) return null
  const value = m[1].replace(/''/g, "'")
  // timestamptz affiché dans le fuseau de la session : on garde l'heure locale, sans le décalage
  return type === 'timestamp with time zone' ? value.replace(/[+-]\d\d(:\d\d)?$/, '') : value
}

/** Expression SELECT qui sort la valeur sous une forme portable (dates en texte local, numériques en texte). */
function exportExpr(c: { name: string; type: string }) {
  const col = `"${c.name}"`
  if (c.type.startsWith('timestamp')) return `to_char(${col}, 'YYYY-MM-DD HH24:MI:SS')`
  if (c.type === 'date' || c.type === 'numeric') return `${col}::text`
  return col
}

export async function extractDataset(databaseUrl: string, setupSql: string): Promise<Dataset> {
  const client = new pg.Client({ connectionString: databaseUrl })
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(setupSql) // recrée retail (search_path et fuseau fixés par le script)
    const order = (await client.query(`SELECT relname FROM pg_class WHERE relnamespace = 'retail'::regnamespace AND relkind = 'r' ORDER BY oid`)).rows.map((r) => r.relname as string)
    const cols = (
      await client.query(`
        SELECT table_name, column_name, data_type, is_nullable, column_default, numeric_precision, numeric_scale
        FROM information_schema.columns WHERE table_schema = 'retail' ORDER BY table_name, ordinal_position`)
    ).rows
    const cons = (
      await client.query(`
        SELECT c.conrelid::regclass::text AS tbl, c.contype,
               ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n, o)
                     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.n ORDER BY k.o) AS cols,
               c.confrelid::regclass::text AS ref,
               ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n, o)
                     JOIN pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.n ORDER BY k.o) AS refcols
        FROM pg_constraint c
        WHERE c.connamespace = 'retail'::regnamespace AND c.contype IN ('p', 'u', 'f')
        ORDER BY c.oid`)
    ).rows
    const tables: Table[] = []
    for (const name of order) {
      const columns: Column[] = cols
        .filter((c) => c.table_name === name)
        .map((c) => ({
          name: c.column_name,
          type: c.data_type,
          precision: c.numeric_precision,
          scale: c.numeric_scale,
          nullable: c.is_nullable === 'YES',
          serial: String(c.column_default ?? '').startsWith('nextval('),
          default: literalDefault(c.column_default, c.data_type),
        }))
      const mine = cons.filter((c) => c.tbl === name)
      const pk = mine.find((c) => c.contype === 'p')?.cols ?? []
      const { rows } = await client.query({
        text: `SELECT ${columns.map(exportExpr).join(', ')} FROM "${name}" ORDER BY ${pk.length ? pk.map((c: string) => `"${c}"`).join(', ') : '1'}`,
        rowMode: 'array',
      } as pg.QueryConfig)
      tables.push({
        name,
        columns,
        pk,
        uniques: mine.filter((c) => c.contype === 'u').map((c) => c.cols),
        fks: mine.filter((c) => c.contype === 'f').map((c) => ({ cols: c.cols, ref: c.ref, refcols: c.refcols })),
        rows,
      })
    }
    return { tables }
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
}

/** Jeu de données en cache dans DATA_DIR, extrait à la première demande ; le nom dépend du script du kit. */
export async function getDataset(dataDir: string, databaseUrl: string, setupSql: string): Promise<Dataset> {
  const file = join(dataDir, `dataset-${createHash('sha1').update(setupSql).digest('hex').slice(0, 10)}.json.gz`)
  if (existsSync(file)) return JSON.parse(gunzipSync(readFileSync(file)).toString()) as Dataset
  const ds = await extractDataset(databaseUrl, setupSql)
  mkdirSync(dataDir, { recursive: true })
  writeFileSync(file, gzipSync(JSON.stringify(ds)))
  return ds
}
