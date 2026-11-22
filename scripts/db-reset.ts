// Deletes the local D1 database (wrangler's default --local state), never the remote one.
// Run bun run db:migrate and bun run db:seed afterwards.
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../.wrangler/state/v3/d1");
if (existsSync(dir)) rmSync(dir, { recursive: true });
console.log(`Deleted the local D1 state in ${dir}`);
