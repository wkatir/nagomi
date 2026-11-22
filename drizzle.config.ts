import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  out: './drizzle',
  schema: ['./src/db/schema/index.ts', './src/db/auth-schema.ts'],
  dialect: 'sqlite',
})
