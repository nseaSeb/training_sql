export type EngineResult = { command: string; rowCount: number | null; fields: string[]; rows: unknown[][]; truncated: boolean }
export type EngineError = { message: string; detail?: string; hint?: string; position?: string; code?: string }
export type EngineResponse =
  | { ok: true; ms: number; results: EngineResult[]; notices?: string[] }
  | { ok: false; ms: number; error: EngineError; notices?: string[] }
export type SchemaRow = {
  table_name: string
  column_name: string
  data_type: string
  is_nullable: string
  approx_rows: string
  pk: boolean
  fk: string | null
}
export type EngineId = 'pg' | 'sqlite' | 'mysql'
