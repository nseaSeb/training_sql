// Exécute une liste d'instructions sur le fichier SQLite, dans un thread à part :
// node:sqlite est synchrone, le thread principal peut ainsi l'interrompre (terminate) au bout du délai.
import { parentPort, workerData } from 'node:worker_threads'
import { DatabaseSync } from 'node:sqlite'

const { file, statements, maxRows } = workerData
const db = new DatabaseSync(file, { timeout: 5000 })
db.exec('PRAGMA foreign_keys = ON')
const results = []
try {
  for (const s of statements) {
    let st
    try {
      st = db.prepare(s.text)
    } catch (e) {
      throw Object.assign(e, { position: s.from + 1 })
    }
    const fields = st.columns().map((c) => c.name)
    if (fields.length) {
      st.setReturnArrays(true)
      const rows = st.all()
      results.push({ command: s.keyword || 'SELECT', rowCount: rows.length, fields, rows: rows.slice(0, maxRows), truncated: rows.length > maxRows })
    } else {
      const r = st.run()
      results.push({ command: s.keyword, rowCount: /^(INSERT|UPDATE|DELETE|REPLACE)$/.test(s.keyword) ? Number(r.changes) : null, fields: [], rows: [], truncated: false })
    }
  }
  parentPort.postMessage({ ok: true, results })
} catch (e) {
  parentPort.postMessage({ ok: false, error: { message: e.message, position: e.position ? String(e.position) : undefined, code: e.errcode ? String(e.errcode) : undefined } })
} finally {
  if (db.isTransaction) db.exec('ROLLBACK') // une transaction laissée ouverte est annulée, comme pour PostgreSQL
  db.close()
}
