import { describe, expect, test } from "bun:test";
import { canonicalJson, idempotencyKey, requestHash } from "./idempotency";

describe("canonicalJson", () => {
	test("sorts keys at every level and drops undefined", () => {
		expect(
			canonicalJson({ b: 1, a: { d: [2, { y: 1, x: null }], c: undefined } }),
		).toBe('{"a":{"d":[2,{"x":null,"y":1}]},"b":1}');
	});

	test("rejects values that JSON cannot carry", () => {
		expect(() => canonicalJson(Number.NaN)).toThrow("Non-finite");
		expect(() => canonicalJson(undefined)).toThrow("undefined");
	});
});

describe("requestHash", () => {
	test("is the same for the same request in any key order", async () => {
		const a = await requestHash({
			locale: "es",
			items: [{ sku: "A", quantity: 1 }],
		});
		const b = await requestHash({
			items: [{ quantity: 1, sku: "A" }],
			locale: "es",
		});
		expect(a).toBe(b);
		expect(a).toMatch(/^[0-9a-f]{64}$/);
	});

	test("changes when the request changes", async () => {
		expect(await requestHash({ q: 1 })).not.toBe(await requestHash({ q: 2 }));
	});
});

describe("idempotencyKey", () => {
	test("accepts a UUID in any case and stores it lowercase", () => {
		const key = "7F1C2B9E-3D4A-4E5F-8A6B-1C2D3E4F5A6B";
		expect(idempotencyKey.parse(key)).toBe(key.toLowerCase());
		expect(idempotencyKey.parse(` ${key.toLowerCase()} `)).toBe(
			key.toLowerCase(),
		);
	});

	test("rejects anything else", () => {
		for (const bad of ["not-a-uuid", "", "7f1c2b9e3d4a4e5f8a6b1c2d3e4f5a6b"])
			expect(idempotencyKey.safeParse(bad).success).toBe(false);
	});
});
