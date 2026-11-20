/** Moteur MySQL : la base training_sql est (re)construite depuis le jeu de données du kit. */
import mysql from 'mysql2/promise'
import { firstKeyword, splitStatements } from '../../src/lib/statements'
import type { Column, Dataset, Table } from './dataset'
import type { EngineResponse, EngineResult, SchemaRow } from './types'

const q = (id: string) => `\`${id}\``

function mysqlType(c: Column) {
  switch (c.type) {
    case 'integer':
      return 'INT'
    case 'bigint':
      return 'BIGINT'
    case 'smallint':
      return 'SMALLINT'
    case 'boolean':
      return 'BOOLEAN'
    case 'numeric':
      return c.precision ? `DECIMAL(${c.precision},${c.scale ?? 0})` : 'DECIMAL(20,6)'
    case 'date':
      return 'DATE'
    default:
      // timestamp(tz) : DATETIME en heure locale ; texte : VARCHAR pour pouvoir l'indexer (clé, UNIQUE)
      return c.type.startsWith('timestamp') ? 'DATETIME' : 'VARCHAR(255)'
  }
}

function mysqlDefault(v: Column['default']) {
  if (v === null) return ''
  if (typeof v === 'boolean') return ` DEFAULT ${v ? 'TRUE' : 'FALSE'}`
  if (typeof v === 'number') return ` DEFAULT ${v}`
  return ` DEFAULT '${v.replace(/'/g, "''")}'`
}

export function mysqlDdl(t: Table) {
  const lines = t.columns.map((c) => `  ${q(c.name)} ${mysqlType(c)}${c.nullable ? '' : ' NOT NULL'}${c.serial ? ' AUTO_INCREMENT' : mysqlDefault(c.default)}`)
  if (t.pk.length) lines.push(`  PRIMARY KEY (${t.pk.map(q).join(', ')})`)
  for (const u of t.uniques) lines.push(`  UNIQUE (${u.map(q).join(', ')})`)
  for (const f of t.fks) lines.push(`  FOREIGN KEY (${f.cols.map(q).join(', ')}) REFERENCES ${q(f.ref)} (${f.refcols.map(q).join(', ')})`)
  return `CREATE TABLE ${q(t.name)} (\n${lines.join(',\n')}\n)`
}

type Config = { url: string; maxRows: number; timeoutMs: number }

export class MysqlEngine {
  private database: string
  private ds: Dataset | null = null
  constructor(private cfg: Config) {
    this.database = new URL(cfg.url).pathname.slice(1) || 'training_sql'
  }

  private connect(withDb = true) {
    const u = new URL(this.cfg.url)
    return mysql.createConnection({
      host: u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: withDb ? this.database : undefined,
      multipleStatements: true,
      dateStrings: true, // dates telles que MySQL les affiche
      supportBigNumbers: true,
      bigNumberStrings: true,
      timezone: 'local',
    })
  }

  /** Attend que le serveur réponde (le conteneur peut démarrer après l'app), puis charge le kit si la base est vide. */
  async init(ds: Dataset, attempts = 30) {
    this.ds = ds
    for (let i = 1; ; i++) {
      try {
        const c = await this.connect(false)
        const [rows] = await c.query<mysql.RowDataPacket[]>('SELECT count(*) AS n FROM information_schema.tables WHERE table_schema = ?', [this.database])
        await c.end()
        if (Number(rows[0].n) === 0) await this.reset()
        return
      } catch (e) {
        if (i >= attempts) throw e
        await new Promise((r) => setTimeout(r, 2000))
      }
    }
  }

  async reset() {
    if (!this.ds) throw new Error('MySQL pas encore initialisé')
    const c = await this.connect(false)
    try {
      await c.query(`DROP DATABASE IF EXISTS ${q(this.database)}; CREATE DATABASE ${q(this.database)} CHARACTER SET utf8mb4; USE ${q(this.database)}`)
      for (const t of this.ds.tables) {
        await c.query(mysqlDdl(t))
        for (let i = 0; i < t.rows.length; i += 2000) {
          await c.query(`INSERT INTO ${q(t.name)} VALUES ?`, [t.rows.slice(i, i + 2000)])
        }
      }
      await c.query(`ANALYZE TABLE ${this.ds.tables.map((t) => q(t.name)).join(', ')}`)
    } finally {
      await c.end()
    }
  }

  async query(sql: string): Promise<EngineResponse> {
    const started = performance.now()
    const ms = () => Math.round(performance.now() - started)
    const statements = splitStatements(sql)
    let c: mysql.Connection | null = null
    try {
      c = await this.connect()
      await c.query(`SET SESSION max_execution_time = ${this.cfg.timeoutMs}`)
      const [raw, fields] = await c.query({ sql, rowsAsArray: true, timeout: this.cfg.timeoutMs })
      // Une seule instruction : un seul résultat ; plusieurs : un tableau de résultats et de jeux de colonnes
      const multi = statements.length > 1
      const outs = (multi ? raw : [raw]) as unknown[]
      const metas = (multi ? fields : [fields]) as (mysql.FieldPacket[] | undefined)[]
      const results: EngineResult[] = outs.map((r, i) => {
        const keyword = firstKeyword(statements[i]?.text ?? '') || 'SELECT'
        if (Array.isArray(r)) {
          const rows = r as unknown[][]
          return { command: keyword, rowCount: rows.length, fields: (metas[i] ?? []).map((f) => f.name), rows: rows.slice(0, this.cfg.maxRows), truncated: rows.length > this.cfg.maxRows }
        }
        const h = r as mysql.ResultSetHeader
        return { command: keyword, rowCount: h.affectedRows ?? null, fields: [], rows: [], truncated: false }
      })
      return { ok: true, ms: ms(), results }
    } catch (e) {
      const err = e as { message: string; code?: string; errno?: number }
      const message = err.code === 'PROTOCOL_SEQUENCE_TIMEOUT' ? `Requête interrompue au bout de ${this.cfg.timeoutMs / 1000} s.` : err.message
      return { ok: false, ms: ms(), error: { message, code: err.code } }
    } finally {
      // Connexion jetée après chaque exécution : une transaction laissée ouverte est annulée
      c?.destroy()
    }
  }

  /** Exécute sql puis check dans une transaction toujours annulée, sans limite de lignes. Refuse le DDL, qui validerait la transaction. */
  async rolledBack(sql: string, check?: string): Promise<EngineResponse> {
    const started = performance.now()
    const ms = () => Math.round(performance.now() - started)
    const statements = splitStatements(sql)
    const ddl = statements.map((s) => firstKeyword(s.text)).find((k) => ['CREATE', 'ALTER', 'DROP', 'TRUNCATE', 'RENAME'].includes(k))
    if (ddl) return { ok: false, ms: ms(), error: { message: `${ddl} n'est pas annulable en MySQL (validation implicite) : pas de correction automatique pour ce type d'instruction ici.` } }
    let c: mysql.Connection | null = null
    try {
      c = await this.connect()
      await c.query(`SET SESSION max_execution_time = ${this.cfg.timeoutMs}`)
      await c.query('BEGIN')
      const results: EngineResult[] = []
      for (const s of [...statements.map((x) => x.text), ...(check ? [check] : [])]) {
        const [raw, fields] = await c.query({ sql: s, rowsAsArray: true, timeout: this.cfg.timeoutMs })
        const keyword = firstKeyword(s) || 'SELECT'
        if (Array.isArray(raw)) results.push({ command: keyword, rowCount: raw.length, fields: (fields as mysql.FieldPacket[]).map((f) => f.name), rows: raw as unknown[][], truncated: false })
        else results.push({ command: keyword, rowCount: (raw as mysql.ResultSetHeader).affectedRows ?? null, fields: [], rows: [], truncated: false })
      }
      return { ok: true, ms: ms(), results: check ? results.slice(-1) : results }
    } catch (e) {
      return { ok: false, ms: ms(), error: { message: (e as Error).message } }
    } finally {
      await c?.query('ROLLBACK').catch(() => {})
      c?.destroy()
    }
  }

  async schema(): Promise<SchemaRow[]> {
    const c = await this.connect()
    try {
      const [rows] = await c.query<mysql.RowDataPacket[]>(
        `SELECT c.TABLE_NAME AS table_name, c.COLUMN_NAME AS column_name, c.COLUMN_TYPE AS data_type, c.IS_NULLABLE AS is_nullable,
                CAST(t.TABLE_ROWS AS CHAR) AS approx_rows, c.COLUMN_KEY = 'PRI' AS pk,
                (SELECT concat(k.REFERENCED_TABLE_NAME, '.', k.REFERENCED_COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE k
                 WHERE k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME
                   AND k.REFERENCED_TABLE_NAME IS NOT NULL LIMIT 1) AS fk
         FROM information_schema.COLUMNS c
         JOIN information_schema.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME
         WHERE c.TABLE_SCHEMA = database()
         ORDER BY c.TABLE_NAME, c.ORDINAL_POSITION`,
      )
      return rows.map((r) => ({ ...(r as SchemaRow), pk: Boolean(Number(r.pk)) }))
    } finally {
      await c.end()
    }
  }
}
