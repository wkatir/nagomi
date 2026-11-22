import { describe, expect, spyOn, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DetailedError } from "hono/client";
import { m } from "#/paraglide/messages";
import { DB_ERROR_CODES } from "#/server/domain/db-errors";
import { errorMessage } from "./errors";

const fail = (code: string, body: Record<string, unknown> = {}) =>
	new DetailedError("409 Conflict", {
		statusCode: 409,
		detail: { data: { error: code, ...body }, statusText: "Conflict" },
	});

function sourceFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const path = join(dir, name);
		if (statSync(path).isDirectory()) return sourceFiles(path);
		return path.endsWith(".ts") && !path.endsWith(".test.ts") ? [path] : [];
	});
}

const serverCodes = new Set([
	...sourceFiles(join(import.meta.dir, "../server")).flatMap((path) =>
		[...readFileSync(path, "utf8").matchAll(/error: "([a-z][a-z_0-9]*)"/g)].map(
			(match) => match[1] as string,
		),
	),
	...DB_ERROR_CODES,
]);

// Shown generically: not meant for a person, from an API with no screen yet, or only used at
// checkout. Add the message when the screen arrives and remove the code from here.
const SHOWN_GENERIC = [
	"client_ip_missing",
	"forbidden",
	"unauthorized",
	"internal_error",
	"invalid_form",
	"collections_changed",
	"promotion_changed",
	"promotion_invalid",
	"promotion_limit_reached",
	"promotion_min_subtotal",
	"promotion_unavailable",
];

describe("errorMessage", () => {
	test("every error code the server answers has a message of its own", () => {
		const generic = m.error_generic();
		const silent = [...serverCodes]
			.filter((code) => !SHOWN_GENERIC.includes(code))
			.filter(
				(code) =>
					errorMessage(fail(code, { message: "refused", max: 1 })) === generic,
			);
		expect(silent).toEqual([]);
	});

	test("codes listed as generic are still answered by the server and still have no message", () => {
		const generic = m.error_generic();
		for (const code of SHOWN_GENERIC) {
			expect(serverCodes.has(code)).toBe(true);
			expect(errorMessage(fail(code))).toBe(generic);
		}
	});

	test("an unknown code is the generic message", () => {
		expect(errorMessage(fail("no_such_code"))).toBe(m.error_generic());
	});

	test("a non-API error is the generic message and is logged", () => {
		const error = new Error("boom");
		const logged = spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(errorMessage(error)).toBe(m.error_generic());
			expect(logged).toHaveBeenCalledWith(error);
		} finally {
			logged.mockRestore();
		}
	});

	test("a number or text the server did not send is not printed as undefined", () => {
		expect(errorMessage(fail("quantity_exceeds_limit"))).toBe(
			m.error_generic(),
		);
	});

	test("a code named like an Object method is not a message", () => {
		expect(errorMessage(fail("constructor"))).toBe(m.error_generic());
		expect(errorMessage(fail("toString"))).toBe(m.error_generic());
	});

	test("fills the numbers the server sends", () => {
		expect(errorMessage(fail("quantity_exceeds_limit", { max: 20 }))).toBe(
			m.error_quantity_exceeds_limit({ max: "20" }),
		);
		expect(errorMessage(fail("variant_has_stock", { onHand: 7 }))).toBe(
			m.error_variant_has_stock({ onHand: "7" }),
		);
	});

	test("lists the lines of an order that do not fit", () => {
		const message = errorMessage(
			fail("insufficient_stock", {
				lines: [{ sku: "A-1", requested: 3, available: 1 }],
			}),
		);
		expect(message).toBe(
			m.error_insufficient_stock_lines({ lines: "A-1 (1 / 3)" }),
		);
	});

	test("says only what is left when no request is reported", () => {
		expect(errorMessage(fail("insufficient_stock", { available: 2 }))).toBe(
			m.error_insufficient_stock_available({ available: "2" }),
		);
		expect(
			errorMessage(fail("insufficient_stock", { available: 2, requested: 5 })),
		).toBe(m.error_insufficient_stock({ available: "2", requested: "5" }));
	});
});
