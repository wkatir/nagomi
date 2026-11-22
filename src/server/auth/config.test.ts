import { describe, expect, test } from "bun:test";
import { assertSecureBaseUrl, googleProvider, signInMethods } from "./config";

const env = { GOOGLE_CLIENT_ID: "", GOOGLE_CLIENT_SECRET: "" };

describe("googleProvider", () => {
	test("is off when both credentials are blank or unset", () => {
		expect(googleProvider(env)).toBeUndefined();
		expect(googleProvider({})).toBeUndefined();
	});

	test("refuses one credential without the other", () => {
		expect(() => googleProvider({ ...env, GOOGLE_CLIENT_ID: "id" })).toThrow(
			"must be set together",
		);
		expect(() =>
			googleProvider({ ...env, GOOGLE_CLIENT_SECRET: "secret" }),
		).toThrow("must be set together");
	});

	test("never creates users", () => {
		expect(
			googleProvider({
				GOOGLE_CLIENT_ID: "id",
				GOOGLE_CLIENT_SECRET: "secret",
			}),
		).toEqual({
			clientId: "id",
			clientSecret: "secret",
			prompt: "select_account",
			disableSignUp: true,
		});
	});
});

describe("signInMethods", () => {
	test("password is the only way in without Google", () => {
		expect(signInMethods(undefined)).toEqual({ google: false, password: true });
	});

	test("Google replaces the password once it is configured", () => {
		expect(signInMethods({})).toEqual({ google: true, password: false });
	});
});

describe("assertSecureBaseUrl", () => {
	test("accepts https anywhere and http on a local machine", () => {
		for (const url of [
			"https://shop.example",
			"http://localhost:4600",
			"http://127.0.0.1:4600",
		])
			expect(() => assertSecureBaseUrl(url)).not.toThrow();
	});

	test("refuses http on a real host, naming the value", () => {
		expect(() => assertSecureBaseUrl("http://shop.example")).toThrow(
			'received: "http://shop.example"',
		);
		expect(() => assertSecureBaseUrl("http://localhost.evil.com")).toThrow();
	});

	test("refuses a value that is not a URL", () => {
		expect(() => assertSecureBaseUrl("")).toThrow();
	});
});
