export class Raw {
  constructor(readonly sql: string) {}
}
export const raw = (sql: string) => new Raw(sql)

export const lit = (v: unknown): string => {
  if (v instanceof Raw) return v.sql
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? '1' : '0'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replaceAll("'", "''")}'`
}

export const insertMissing = (table: string, keys: string[], rows: Record<string, unknown>[]) =>
  rows
    .map((r) => {
      const cols = Object.keys(r)
      const missing = keys.map((k) => `${k} = ${lit(r[k])}`).join(' AND ')
      return `INSERT INTO ${table} (${cols.join(', ')}) SELECT ${cols.map((c) => lit(r[c])).join(', ')} WHERE NOT EXISTS (SELECT 1 FROM ${table} WHERE ${missing});`
    })
    .join('\n')
