import { expect, mock, test } from "bun:test";
import { d1, migratedDatabase } from "#/db/test-database";

// The Worker as production runs it: Google configured.
const env = {
	BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters",
	BETTER_AUTH_URL: "https://eclalune.test",
	GOOGLE_CLIENT_ID: "client-id",
	GOOGLE_CLIENT_SECRET: "client-secret",
	GOOGLE_WORKSPACE_DOMAIN: "eclalune.test",
	DB: d1(migratedDatabase()),
};
mock.module("cloudflare:workers", () => ({ env }));
const { auth, authMethods } = await import("./auth");

const post = (path: string, body: unknown) =>
	auth.handler(
		new Request(`https://eclalune.test/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://eclalune.test",
				"cf-connecting-ip": "203.0.113.7",
			},
			body: JSON.stringify(body),
		}),
	);

test("with Google configured the password is not a way in", async () => {
	expect(authMethods).toEqual({ google: true, password: false });
	const res = await post("/sign-in/email", {
		email: "admin@eclalune.test",
		password: "a password of a good length",
	});
	expect(res.status).toBe(400);
	expect(await res.json()).toMatchObject({ code: "EMAIL_PASSWORD_DISABLED" });
});

test("the admin plugin endpoints the back office has no screen for answer 404", async () => {
	for (const path of [
		"/admin/create-user",
		"/admin/update-user",
		"/admin/set-role",
		"/admin/set-user-password",
		"/admin/remove-user",
		"/admin/impersonate-user",
		"/admin/stop-impersonating",
	]) {
		const res = await post(path, {});
		expect(res.status).toBe(404);
	}
});

test("a plugin endpoint that stays still asks for a session", async () => {
	const res = await post("/admin/ban-user", { userId: "u" });
	expect(res.status).toBe(401);
});
