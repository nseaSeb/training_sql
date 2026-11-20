/** Moteur SQLite : un fichier modèle construit depuis le jeu de données, et une copie de travail pour le playground. */
import { DatabaseSync } from 'node:sqlite'
import { Worker } from 'node:worker_threads'
import { copyFileSync, existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { firstKeyword, splitStatements } from '../../src/lib/statements'
import type { Column, Dataset, Table } from './dataset'
import type { EngineResponse, SchemaRow } from './types'

const quote = (id: string) => `"${id}"`

function sqliteType(c: Column) {
  if (['integer', 'bigint', 'smallint', 'boolean'].includes(c.type)) return 'INTEGER'
  if (c.type === 'numeric') return 'NUMERIC'
  return 'TEXT' // text, date, timestamp : SQLite n'a pas de type date
}

function sqliteDefault(v: Column['default']) {
  if (v === null) return ''
  if (typeof v === 'boolean') return ` DEFAULT ${v ? 1 : 0}`
  if (typeof v === 'number') return ` DEFAULT ${v}`
  return ` DEFAULT '${v.replace(/'/g, "''")}'`
}

export function sqliteDdl(t: Table) {
  const rowidPk = t.pk.length === 1 && ['integer', 'bigint'].includes(t.columns.find((c) => c.name === t.pk[0])!.type)
  const lines = t.columns.map((c) => {
    if (rowidPk && c.name === t.pk[0]) return `  ${quote(c.name)} INTEGER PRIMARY KEY` // alias du rowid : numérotation automatique
    return `  ${quote(c.name)} ${sqliteType(c)}${c.nullable ? '' : ' NOT NULL'}${sqliteDefault(c.default)}`
  })
  if (t.pk.length && !rowidPk) lines.push(`  PRIMARY KEY (${t.pk.map(quote).join(', ')})`)
  for (const u of t.uniques) lines.push(`  UNIQUE (${u.map(quote).join(', ')})`)
  for (const f of t.fks) lines.push(`  FOREIGN KEY (${f.cols.map(quote).join(', ')}) REFERENCES ${quote(f.ref)} (${f.refcols.map(quote).join(', ')})`)
  return `CREATE TABLE ${quote(t.name)} (\n${lines.join(',\n')}\n);`
}

export class SqliteEngine {
  readonly template: string
  readonly file: string
  constructor(dataDir: string, private maxRows: number, private timeoutMs: number) {
    mkdirSync(dataDir, { recursive: true })
    this.template = join(dataDir, 'kit.sqlite')
    this.file = join(dataDir, 'training.sqlite')
  }

  /** Construit le modèle depuis le jeu de données (si absent), puis la copie de travail (si absente). */
  init(ds: Dataset, force = false) {
    if (force || !existsSync(this.template)) {
      const tmp = `${this.template}.tmp`
      rmSync(tmp, { force: true })
      const db = new DatabaseSync(tmp)
      db.exec('BEGIN')
      for (const t of ds.tables) {
        db.exec(sqliteDdl(t))
        const insert = db.prepare(`INSERT INTO ${quote(t.name)} VALUES (${t.columns.map(() => '?').join(', ')})`)
        for (const row of t.rows) insert.run(...row.map((v) => (typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null))))
      }
      db.exec('COMMIT')
      db.exec('ANALYZE')
      db.close()
      renameSync(tmp, this.template)
    }
    if (force || !existsSync(this.file)) this.reset()
  }

  reset() {
    copyFileSync(this.template, this.file)
  }

  query(sql: string): Promise<EngineResponse> {
    const started = performance.now()
    const statements = splitStatements(sql).map((s) => ({ text: s.text, from: s.from, keyword: firstKeyword(s.text) }))
    return new Promise((resolve) => {
      const worker = new Worker(new URL('./sqlite-worker.mjs', import.meta.url), { workerData: { file: this.file, statements, maxRows: this.maxRows } })
      const done = (r: Omit<EngineResponse, 'ms'>) => {
        clearTimeout(timer)
        resolve({ ...r, ms: Math.round(performance.now() - started) } as EngineResponse)
      }
      const timer = setTimeout(() => {
        void worker.terminate()
        done({ ok: false, error: { message: `Requête interrompue au bout de ${this.timeoutMs / 1000} s.` } })
      }, this.timeoutMs)
      worker.once('message', done)
      worker.once('error', (e) => done({ ok: false, error: { message: e.message } }))
    })
  }

  schema(): SchemaRow[] {
    const db = new DatabaseSync(this.file, { readOnly: true })
    try {
      const tables = db.prepare(`SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as { name: string }[]
      const out: SchemaRow[] = []
      for (const { name } of tables) {
        const n = (db.prepare(`SELECT count(*) AS n FROM ${quote(name)}`).get() as { n: number }).n
        const fks = db.prepare(`SELECT "from", "table", "to" FROM pragma_foreign_key_list(?)`).all(name) as { from: string; table: string; to: string }[]
        const cols = db.prepare(`SELECT name, type, "notnull", pk FROM pragma_table_info(?) ORDER BY cid`).all(name) as { name: string; type: string; notnull: number; pk: number }[]
        for (const c of cols) {
          const fk = fks.find((f) => f.from === c.name)
          out.push({
            table_name: name,
            column_name: c.name,
            data_type: c.type.toLowerCase() || 'any',
            is_nullable: c.notnull || c.pk ? 'NO' : 'YES',
            approx_rows: String(n),
            pk: c.pk > 0,
            fk: fk ? `${fk.table}.${fk.to}` : null,
          })
        }
      }
      return out
    } finally {
      db.close()
    }
  }
}
