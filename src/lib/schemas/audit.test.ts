import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AUDIT_ENTITY_TYPES, AUDIT_VERBS, auditListSearch } from "./audit";

// A new entity or verb the API writes must be listed (and have its labels) before the log can
// be filtered by it.
const serverDir = join(import.meta.dir, "../../server");
const sources = [...new Bun.Glob("**/*.ts").scanSync(serverDir)]
	.filter((file) => !file.endsWith(".test.ts"))
	.map((file) => readFileSync(join(serverDir, file), "utf8"));
const all = (pattern: RegExp) =>
	new Set(
		sources.flatMap((source) =>
			[...source.matchAll(pattern)].map((match) => match[1] as string),
		),
	);

const entitiesWritten = new Set([
	...all(/entityType: "([a-z_]+)"/g),
	...all(/statusAudit\(\s*"([a-z_]+)"/g),
]);
const verbsWritten = new Set([
	...all(/action: "[a-z_]+\.([a-z_]+)"/g),
	// statusAudit writes these three.
	"update",
	"archive",
	"status",
]);

describe("the audit vocabulary", () => {
	test("finds what the API writes", () => {
		expect(entitiesWritten.size).toBeGreaterThan(20);
		expect(entitiesWritten.has("order")).toBe(true);
		expect(entitiesWritten.has("supplier_item")).toBe(true);
	});

	test("every entity the API writes is listed, and every listed one is written", () => {
		expect([...entitiesWritten].sort()).toEqual([...AUDIT_ENTITY_TYPES].sort());
	});

	test("every verb the API writes is listed, and every listed one is written", () => {
		expect([...verbsWritten].sort()).toEqual([...AUDIT_VERBS].sort());
	});
});

describe("auditListSearch", () => {
	test("nothing chosen is no filter", () => {
		expect(auditListSearch.parse({})).toEqual({});
	});

	test("takes the filters of the URL", () => {
		const search = {
			entityType: "order",
			actor: "u1",
			verb: "status",
			from: "2026-10-01",
			to: "2026-10-31",
		} as const;
		expect(auditListSearch.parse(search)).toEqual(search);
	});

	test("refuses an entity or a verb the log does not have", () => {
		expect(auditListSearch.safeParse({ entityType: "nothing" }).success).toBe(
			false,
		);
		expect(auditListSearch.safeParse({ verb: "delete" }).success).toBe(false);
	});

	test("refuses a range that ends before it starts", () => {
		const result = auditListSearch.safeParse({
			from: "2026-10-02",
			to: "2026-10-01",
		});
		expect(result.success).toBe(false);
		expect(result.error?.issues[0]?.path).toEqual(["to"]);
	});
});
