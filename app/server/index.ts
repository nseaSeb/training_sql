import express from 'express'
import pg from 'pg'
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

// Dates, timestamps et intervalles renvoyés tels que Postgres les affiche
// (sinon node-pg les convertit en Date JS et l'UI affiche de l'UTC).
for (const oid of [1082, 1114, 1184, 1186]) pg.types.setTypeParser(oid, (v) => v)
// numeric et bigint en texte : pas de perte de précision
for (const oid of [20, 1700]) pg.types.setTypeParser(oid, (v) => v)

const PORT = Number(process.env.PORT ?? process.env.API_PORT ?? 3381)
const MAX_ROWS = 1000
const SETUP_SQL = fileURLToPath(new URL('../../kit/01_setup_base.sql', import.meta.url))

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://kit:kit@localhost:55433/training_sql'
// En ligne (KIT_APP_PASSWORD défini) : l'API ne se connecte jamais en superutilisateur,
// mais avec un rôle restreint propriétaire du seul schéma retail.
const APP_ROLE = 'kit_app'
const APP_PASSWORD = process.env.KIT_APP_PASSWORD
function appUrl() {
  if (!APP_PASSWORD) return DATABASE_URL
  const u = new URL(DATABASE_URL)
  u.username = APP_ROLE
  u.password = APP_PASSWORD
  return u.toString()
}

const pool = new pg.Pool({
  connectionString: appUrl(),
  options: '-c statement_timeout=15000 -c search_path=retail,public -c timezone=Europe/Paris',
  max: 4,
})

// Snippets sauvegardés : schéma kit_meta, créé et lu par le compte admin seulement. Le rôle restreint du
// Playground n'y a aucun droit, et « Réinitialiser » ne recrée que retail : les snippets survivent aux deux.
const adminPool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 })

async function bootstrapSnippets() {
  await adminPool.query(`
    CREATE SCHEMA IF NOT EXISTS kit_meta;
    REVOKE ALL ON SCHEMA kit_meta FROM PUBLIC;
    CREATE TABLE IF NOT EXISTS kit_meta.snippets (
      id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      titre   text NOT NULL CHECK (length(titre) BETWEEN 1 AND 200),
      sql     text NOT NULL CHECK (length(sql) <= 100000),
      tags    text[] NOT NULL DEFAULT '{}',
      cree_le timestamptz NOT NULL DEFAULT now(),
      maj_le  timestamptz NOT NULL DEFAULT now()
    );`)
}

async function bootstrap() {
  await bootstrapSnippets()
  if (APP_PASSWORD) {
    const admin = new pg.Client({ connectionString: DATABASE_URL })
    await admin.connect()
    const db = (await admin.query('SELECT current_database() AS d')).rows[0].d
    const exists = (await admin.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [APP_ROLE])).rowCount
    const pwd = APP_PASSWORD.replace(/'/g, "''")
    await admin.query(`${exists ? 'ALTER' : 'CREATE'} ROLE ${APP_ROLE} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE PASSWORD '${pwd}'`)
    await admin.query(`GRANT CONNECT, CREATE, TEMPORARY ON DATABASE "${db}" TO ${APP_ROLE}`)
    await admin.query(`ALTER ROLE ${APP_ROLE} SET search_path = retail, public`)
    await admin.query(`ALTER ROLE ${APP_ROLE} SET timezone = 'Europe/Paris'`)
    // Schéma créé par une version précédente sous un autre rôle : on le rend au rôle restreint
    const owner = (await admin.query(`SELECT nspowner::regrole::text AS o FROM pg_namespace WHERE nspname = 'retail'`)).rows[0]?.o
    if (owner && owner !== APP_ROLE) await admin.query('DROP SCHEMA retail CASCADE')
    await admin.end()
  }
  const has = await pool.query(`SELECT 1 FROM pg_namespace WHERE nspname = 'retail'`)
  if (!has.rowCount) {
    console.log('Schéma retail absent : chargement du kit…')
    await pool.query(readFileSync(SETUP_SQL, 'utf8'))
  }
}

type Result = {
  command: string
  rowCount: number | null
  fields: string[]
  rows: unknown[][]
  truncated: boolean
}

const app = express()
app.get('/health', (_req, res) => {
  res.send('ok')
})

// Mot de passe unique devant tout le site quand il est exposé (SITE_PASSWORD défini)
const SITE_USER = process.env.SITE_USER ?? 'admin'
const SITE_PASSWORD = process.env.SITE_PASSWORD
if (SITE_PASSWORD) {
  app.use((req, res, next) => {
    const [scheme, encoded] = (req.headers.authorization ?? '').split(' ')
    const [user, ...rest] = Buffer.from(encoded ?? '', 'base64').toString().split(':')
    if (scheme === 'Basic' && user === SITE_USER && rest.join(':') === SITE_PASSWORD) return next()
    res.set('WWW-Authenticate', 'Basic realm="Training SQL", charset="UTF-8"').status(401).send('Authentification requise')
  })
}

app.use(express.json({ limit: '1mb' }))

app.post('/api/query', async (req, res) => {
  const sql = String(req.body?.sql ?? '')
    .split('\n')
    // Méta-commandes psql (\echo, \pset…) remplacées par des blancs : les positions d'erreur restent alignées sur le texte envoyé
    .map((line) => (line.trimStart().startsWith('\\') ? ' '.repeat(line.length) : line))
    .join('\n')
  const client = await pool.connect()
  const started = performance.now()
  // NOTICE / WARNING émis pendant la requête de l'utilisateur seulement (pas pendant le ROLLBACK de nettoyage)
  const notices: string[] = []
  const onNotice = (n: { severity?: string; message?: string }) => void notices.push(`${n.severity ?? 'NOTICE'}: ${n.message ?? ''}`)
  client.on('notice', onNotice)
  try {
    const raw = await client.query({ text: sql, rowMode: 'array' } as pg.QueryConfig)
    client.off('notice', onNotice)
    const list = (Array.isArray(raw) ? raw : [raw]) as pg.QueryArrayResult[]
    const results: Result[] = list.map((r) => ({
      command: r.command,
      rowCount: r.rowCount,
      fields: r.fields?.map((f) => f.name) ?? [],
      rows: (r.rows ?? []).slice(0, MAX_ROWS),
      truncated: (r.rows?.length ?? 0) > MAX_ROWS,
    }))
    res.json({ ok: true, ms: Math.round(performance.now() - started), results, notices })
  } catch (e) {
    client.off('notice', onNotice)
    const err = e as pg.DatabaseError
    // Une transaction laissée ouverte par l'erreur ne doit pas polluer la connexion suivante
    await client.query('ROLLBACK').catch(() => {})
    res.json({
      ok: false,
      ms: Math.round(performance.now() - started),
      error: { message: err.message, detail: err.detail, hint: err.hint, position: err.position, code: err.code },
      notices,
    })
  } finally {
    await client.query('ROLLBACK').catch(() => {}) // ferme toute transaction oubliée (BEGIN sans fin)
    // Remet la connexion à neuf (SET, tables TEMP, verrous consultatifs) avant de la rendre au pool
    const clean = await client.query('DISCARD ALL').then(() => true, () => false)
    client.release(!clean)
  }
})

app.get('/api/schema', async (_req, res) => {
  const { rows } = await pool.query(`
    SELECT c.table_name, c.column_name, c.data_type, c.is_nullable,
           (SELECT reltuples::bigint FROM pg_class WHERE oid = ('retail.' || c.table_name)::regclass) AS approx_rows,
           EXISTS (
             SELECT 1 FROM information_schema.table_constraints tc
             JOIN information_schema.key_column_usage k USING (constraint_schema, constraint_name)
             WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_schema = c.table_schema
               AND k.table_name = c.table_name AND k.column_name = c.column_name
           ) AS pk,
           (SELECT ccu.table_name || '.' || ccu.column_name
            FROM information_schema.table_constraints tc
            JOIN information_schema.key_column_usage k USING (constraint_schema, constraint_name)
            JOIN information_schema.constraint_column_usage ccu USING (constraint_schema, constraint_name)
            WHERE tc.constraint_type = 'FOREIGN KEY' AND k.table_schema = c.table_schema
              AND k.table_name = c.table_name AND k.column_name = c.column_name
            LIMIT 1) AS fk
    FROM information_schema.columns c
    WHERE c.table_schema = 'retail'
    ORDER BY c.table_name, c.ordinal_position`)
  res.json(rows)
})

app.post('/api/reset', async (_req, res) => {
  try {
    await pool.query(readFileSync(SETUP_SQL, 'utf8'))
    res.json({ ok: true })
  } catch (e) {
    res.json({ ok: false, error: { message: (e as Error).message } })
  }
})

type SnippetInput = { titre: string; sql: string; tags: string[] }
function snippetInput(body: unknown): SnippetInput | null {
  const b = (body ?? {}) as Record<string, unknown>
  const titre = String(b.titre ?? '').trim()
  const sql = String(b.sql ?? '')
  const tags = Array.isArray(b.tags) ? [...new Set(b.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))].slice(0, 20) : []
  return titre && sql.trim() ? { titre: titre.slice(0, 200), sql, tags } : null
}
const SNIPPET_COLS = 'id::int AS id, titre, sql, tags, cree_le, maj_le'

app.get('/api/snippets', async (_req, res) => {
  const { rows } = await adminPool.query(`SELECT ${SNIPPET_COLS} FROM kit_meta.snippets ORDER BY maj_le DESC`)
  res.json(rows)
})

app.post('/api/snippets', async (req, res) => {
  const s = snippetInput(req.body)
  if (!s) return res.status(400).json({ error: 'titre et sql obligatoires' })
  const { rows } = await adminPool.query(`INSERT INTO kit_meta.snippets (titre, sql, tags) VALUES ($1, $2, $3) RETURNING ${SNIPPET_COLS}`, [s.titre, s.sql, s.tags])
  res.json(rows[0])
})

app.put('/api/snippets/:id', async (req, res) => {
  const s = snippetInput(req.body)
  if (!s) return res.status(400).json({ error: 'titre et sql obligatoires' })
  const { rows } = await adminPool.query(
    `UPDATE kit_meta.snippets SET titre = $2, sql = $3, tags = $4, maj_le = now() WHERE id = $1 RETURNING ${SNIPPET_COLS}`,
    [Number(req.params.id), s.titre, s.sql, s.tags],
  )
  if (!rows.length) return res.status(404).json({ error: 'snippet introuvable' })
  res.json(rows[0])
})

app.delete('/api/snippets/:id', async (req, res) => {
  const { rowCount } = await adminPool.query('DELETE FROM kit_meta.snippets WHERE id = $1', [Number(req.params.id)])
  res.status(rowCount ? 204 : 404).end()
})

// En production, le même serveur sert le site construit (dist/)
const DIST = fileURLToPath(new URL('../dist', import.meta.url))
if (existsSync(DIST)) app.use(express.static(DIST))

bootstrap()
  .then(() => app.listen(PORT, () => console.log(`Training SQL sur http://localhost:${PORT}`)))
  .catch((e) => {
    console.error('Démarrage impossible :', e)
    process.exit(1)
  })
