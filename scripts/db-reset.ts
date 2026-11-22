import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

const dir = join(import.meta.dir, "../.wrangler/state/v3/d1");
if (existsSync(dir)) rmSync(dir, { recursive: true });
console.log(`Deleted the local D1 state in ${dir}`);
