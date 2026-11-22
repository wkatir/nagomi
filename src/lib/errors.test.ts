import { describe, expect, spyOn, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { DetailedError } from "hono/client";
import { m } from "#/paraglide/messages";
import { DB_ERROR_CODES } from "#/server/domain/db-errors";
import { errorMessage, promotionReasonMessage } from "./errors";

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

// Not meant for a person, from an API with no screen yet, or only answered at checkout.
const SHOWN_GENERIC = [
	"client_ip_missing",
	"forbidden",
	"unauthorized",
	"internal_error",
	"invalid_form",
	"collections_changed",
	"invalid_signature",
];

describe("errorMessage", () => {
	test("every error code the server answers has a message of its own", () => {
		const generic = m.error_generic();
		const silent = [...serverCodes]
			.filter((code) => !SHOWN_GENERIC.includes(code))
			.filter(
				(code) =>
					errorMessage(
						fail(code, { message: "refused", max: 1, reason: "expired" }),
					) === generic,
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

	test("a code named like an Object method is not a message", () => {
		expect(errorMessage(fail("constructor"))).toBe(m.error_generic());
		expect(errorMessage(fail("toString"))).toBe(m.error_generic());
	});

	test("fills the numbers the server sends", () => {
		expect(errorMessage(fail("variant_has_stock", { onHand: 7 }))).toBe(
			m.error_variant_has_stock({ onHand: "7" }),
		);
	});

	test("says what is left of a lot, or that the cart changed", () => {
		expect(errorMessage(fail("insufficient_stock", { available: 2 }))).toBe(
			m.error_insufficient_stock_available({ available: "2" }),
		);
		expect(
			errorMessage(
				fail("insufficient_stock", {
					items: [{ sku: "TEC-001", available: 1 }],
				}),
			),
		).toBe(m.error_insufficient_stock_cart());
	});
});

describe("promotionReasonMessage", () => {
	test("names the minimum subtotal the server sends", () => {
		expect(promotionReasonMessage("min_subtotal_not_met", "$25.00")).toBe(
			m.promotion_reason_min_subtotal_not_met({ amount: "$25.00" }),
		);
	});

	test("an unknown reason is the generic message", () => {
		expect(promotionReasonMessage("no_such_reason", null)).toBe(
			m.error_generic(),
		);
		expect(promotionReasonMessage("min_subtotal_not_met", null)).toBe(
			m.error_generic(),
		);
	});
});
