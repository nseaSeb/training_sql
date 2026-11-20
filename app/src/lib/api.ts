export type QueryResult = {
  command: string
  rowCount: number | null
  fields: string[]
  rows: (string | number | boolean | null | object)[][]
  truncated: boolean
}
export type QueryResponse =
  | { ok: true; ms: number; results: QueryResult[]; notices?: string[] }
  | { ok: false; ms: number; error: { message: string; detail?: string; hint?: string; position?: string; code?: string }; notices?: string[] }

export async function runSql(sql: string): Promise<QueryResponse> {
  const r = await fetch('/api/query', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ sql }),
  })
  return r.json()
}

export type SchemaColumn = { table_name: string; column_name: string; data_type: string; is_nullable: string; approx_rows: string; pk: boolean; fk: string | null }
export const fetchSchema = (): Promise<SchemaColumn[]> => fetch('/api/schema').then((r) => r.json())
export const resetDb = (): Promise<{ ok: boolean; error?: { message: string } }> =>
  fetch('/api/reset', { method: 'POST' }).then((r) => r.json())

export type Snippet = { id: number; titre: string; sql: string; tags: string[]; cree_le: string; maj_le: string }
export type SnippetInput = Pick<Snippet, 'titre' | 'sql' | 'tags'>

async function json<T>(r: Response): Promise<T> {
  if (!r.ok) throw new Error((await r.json().catch(() => null))?.error ?? `HTTP ${r.status}`)
  return r.json()
}
const send = (method: string, body: unknown) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

export const listSnippets = () => fetch('/api/snippets').then((r) => json<Snippet[]>(r))
export const createSnippet = (s: SnippetInput) => fetch('/api/snippets', send('POST', s)).then((r) => json<Snippet>(r))
export const updateSnippet = (id: number, s: SnippetInput) => fetch(`/api/snippets/${id}`, send('PUT', s)).then((r) => json<Snippet>(r))
export const deleteSnippet = (id: number) =>
  fetch(`/api/snippets/${id}`, { method: 'DELETE' }).then((r) => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
  })
