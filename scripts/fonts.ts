// Downloads the Satoshi files from their publisher (Fontshare) and verifies each SHA-256.
// The license does not allow redistributing the files, so they are gitignored and fetched here.
// Read docs/brand/final/fonts/LICENSE-SATOSHI.txt before using the typeface.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

type Entry = { file: string; source: string; sha256: string };

const root = resolve(import.meta.dir, "../..");
const manifest = JSON.parse(
	await readFile(resolve(root, "docs/brand/final/fonts/SOURCE-MANIFEST.json"), "utf8"),
) as Entry[];
const entries = manifest.filter((e) => e.file.startsWith("app/public/fonts/"));

for (const entry of entries) {
	const path = resolve(root, entry.file);
	if (!path.startsWith(root + sep)) throw new Error(`Invalid font destination: ${entry.file}`);
	const response = await fetch(entry.source);
	if (!response.ok) throw new Error(`Font download failed (${response.status}): ${entry.file}`);
	const bytes = Buffer.from(await response.arrayBuffer());
	const hash = createHash("sha256").update(bytes).digest("hex");
	if (hash !== entry.sha256.toLowerCase()) throw new Error(`Publisher file changed: ${entry.file}`);
	await mkdir(dirname(path), { recursive: true });
	await writeFile(path, bytes);
	console.log(`Verified ${entry.file}`);
}
