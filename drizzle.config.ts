import { defineConfig } from 'drizzle-kit'

// Migrations are generated here and applied with `wrangler d1 migrations apply`.
export default defineConfig({
  out: './drizzle',
  schema: ['./src/db/schema/index.ts', './src/db/auth-schema.ts'],
  dialect: 'sqlite',
})
