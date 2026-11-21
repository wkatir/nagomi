import { describe, expect, test } from "bun:test";
import { DetailedError } from "hono/client";
import { m } from "#/paraglide/messages";
import { settingsErrors } from "./server-errors";

const refused = (status: number, data: Record<string, unknown>) =>
	new DetailedError(`${status}`, {
		statusCode: status,
		detail: { data, statusText: "" },
	});

const fieldOf = (path: string) => (path === "name" ? "name" : undefined);
const codeFields = { currency_locked: "currency" } as const;

describe("settingsErrors", () => {
	test("puts a rule the API enforces on the field it is about", () => {
		expect(
			settingsErrors(
				refused(409, { error: "currency_locked" }),
				fieldOf,
				codeFields,
			),
		).toEqual({
			form: undefined,
			fields: { currency: m.error_currency_locked() },
		});
	});

	test("puts the fields of an invalid request on their fields", () => {
		const error = refused(400, {
			error: "invalid_request",
			issues: [{ path: "name", message: "Too small" }],
		});
		expect(settingsErrors(error, fieldOf, codeFields)).toEqual({
			form: undefined,
			fields: { name: "Too small" },
		});
	});

	test("a code the form has no field for is the message of the form", () => {
		expect(
			settingsErrors(
				refused(409, { error: "default_locale_untranslated" }),
				fieldOf,
				codeFields,
			),
		).toEqual({ form: m.error_default_locale_untranslated(), fields: {} });
	});

	test("an error that is not the API's is the generic message of the form", () => {
		expect(settingsErrors(new Error("boom"), fieldOf, codeFields)).toEqual({
			form: m.error_generic(),
			fields: {},
		});
	});
});
