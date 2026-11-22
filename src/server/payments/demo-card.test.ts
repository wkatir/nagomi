import { describe, expect, test } from "bun:test";
import { cardProvider, checkDemoCard, luhnValid } from "./demo-card";

const keys = { WOMPI_CLIENT_ID: "app-id", WOMPI_CLIENT_SECRET: "api-secret" };
const today = new Date("2026-11-22T12:00:00Z");

describe("cardProvider", () => {
	test("Wompi when its keys are set, the test gateway only in a demo store without them", () => {
		expect(cardProvider(keys, { demoStore: false })).toBe("wompi");
		expect(cardProvider(keys, { demoStore: true })).toBe("wompi");
		expect(cardProvider({}, { demoStore: true })).toBe("demo");
		expect(cardProvider({}, { demoStore: false })).toBeNull();
	});

	test("one Wompi key without the other is an error, not a fallback", () => {
		expect(() =>
			cardProvider({ WOMPI_CLIENT_ID: "app-id" }, { demoStore: true }),
		).toThrow();
	});
});

describe("luhnValid", () => {
	test("accepts numbers whose check digit holds", () => {
		expect(luhnValid("4242424242424242")).toBe(true);
		expect(luhnValid("4000000000000002")).toBe(true);
		expect(luhnValid("5555555555554444")).toBe(true);
	});

	test("refuses a wrong check digit, letters and lengths outside 12 to 19", () => {
		expect(luhnValid("4242424242424241")).toBe(false);
		expect(luhnValid("4242a24242424242")).toBe(false);
		expect(luhnValid("42424242424")).toBe(false);
		expect(luhnValid("42424242424242424242")).toBe(false);
	});
});

describe("checkDemoCard", () => {
	const valid = { number: "4242 4242 4242 4242", expiry: "12/30", cvc: "123" };

	test("the approved test card approves and keeps only its last four digits", () => {
		expect(checkDemoCard(valid, today)).toEqual({
			ok: true,
			approved: true,
			brand: "Visa",
			last4: "4242",
		});
	});

	test("the declined test card declines", () => {
		expect(
			checkDemoCard({ ...valid, number: "4000-0000-0000-0002" }, today),
		).toMatchObject({ ok: true, approved: false, last4: "0002" });
	});

	test("a number that fails Luhn is invalid; a valid number that is not a test card is refused", () => {
		expect(
			checkDemoCard({ ...valid, number: "4242 4242 4242 4241" }, today),
		).toEqual({ ok: false, fields: { cardNumber: "invalid" } });
		expect(
			checkDemoCard({ ...valid, number: "4111 1111 1111 1111" }, today),
		).toEqual({ ok: false, fields: { cardNumber: "not_test_card" } });
	});

	test("any future expiry passes, this month included; a past one is expired", () => {
		expect(checkDemoCard({ ...valid, expiry: "11/26" }, today).ok).toBe(true);
		expect(checkDemoCard({ ...valid, expiry: "01/2031" }, today).ok).toBe(true);
		expect(checkDemoCard({ ...valid, expiry: "10/26" }, today)).toEqual({
			ok: false,
			fields: { expiry: "expired" },
		});
		expect(checkDemoCard({ ...valid, expiry: "13/30" }, today)).toEqual({
			ok: false,
			fields: { expiry: "invalid" },
		});
	});

	test("any CVC of three or four digits", () => {
		expect(checkDemoCard({ ...valid, cvc: "9999" }, today).ok).toBe(true);
		expect(checkDemoCard({ ...valid, cvc: "12" }, today)).toEqual({
			ok: false,
			fields: { cvc: "invalid" },
		});
	});
});
