import { describe, expect, spyOn, test } from "bun:test";
import { DetailedError } from "hono/client";
import { serverErrors } from "./server-errors";

const apiError = (status: number, body: unknown) =>
	new DetailedError("request failed", {
		statusCode: status,
		detail: { data: body },
	});

const invalidRequest = (issues: { path: string; message: string }[]) =>
	apiError(400, { error: "invalid_request", issues });

describe("serverErrors", () => {
	test("puts each rejected path on its field and leaves the form without a message", () => {
		const error = invalidRequest([
			{ path: "customer.phone", message: "Invalid phone" },
			{ path: "notes", message: "Too long" },
		]);
		const fieldOf = (path: string) =>
			({ "customer.phone": "phone", notes: "notes" })[path];
		expect(serverErrors(error, fieldOf)).toEqual({
			form: undefined,
			fields: { phone: "Invalid phone", notes: "Too long" },
		});
	});

	test("keeps a path no field holds in the form's message", () => {
		const error = invalidRequest([
			{ path: "items.0.quantity", message: "Too many" },
			{ path: "notes", message: "Too long" },
		]);
		const result = serverErrors(error, (path) =>
			path === "notes" ? "notes" : undefined,
		);
		expect(result.fields).toEqual({ notes: "Too long" });
		expect(result.form).toBeString();
	});

	test("an error without issues is the form's message alone", () => {
		const result = serverErrors(
			apiError(409, { error: "stock_changed" }),
			() => undefined,
		);
		expect(result.fields).toEqual({});
		expect(result.form).toBeString();
	});

	test("an error that did not come from the API still has a message", () => {
		const logged = spyOn(console, "error").mockImplementation(() => {});
		try {
			expect(serverErrors(new Error("offline"), () => undefined)).toEqual({
				form: expect.any(String),
				fields: {},
			});
		} finally {
			logged.mockRestore();
		}
	});
});
