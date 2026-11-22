import type { Database } from "bun:sqlite";
import { describe, expect, mock, test } from "bun:test";
import { d1, migratedDatabase } from "#/db/test-database";

const db: Database = migratedDatabase();
const env = {
	BETTER_AUTH_SECRET: "a-test-secret-of-at-least-32-characters",
	BETTER_AUTH_URL: "https://nagomi.test",
	GOOGLE_CLIENT_ID: "client-id",
	GOOGLE_CLIENT_SECRET: "client-secret",
	DB: d1(db),
};
mock.module("cloudflare:workers", () => ({ env }));
const { auth, authMethods } = await import("./auth");

let nextIp = 1;
const freshIp = () => `203.0.113.${nextIp++}`;

const post = (path: string, body: unknown, ip = freshIp()) =>
	auth.handler(
		new Request(`https://nagomi.test/api/auth${path}`, {
			method: "POST",
			headers: {
				"content-type": "application/json",
				origin: "https://nagomi.test",
				"cf-connecting-ip": ip,
			},
			body: JSON.stringify(body),
		}),
	);

const signUp = (email: string, ip?: string) =>
	post(
		"/sign-up/email",
		{ email, password: "a password of a good length", name: "Ana Pérez" },
		ip,
	);

const one = <T>(sql: string, param?: string) =>
	(param === undefined ? db.query(sql).get() : db.query(sql).get(param)) as T;

describe("customer accounts", () => {
	test("password sign-in stays on with Google configured", () => {
		expect(authMethods).toEqual({ google: true, password: true });
	});

	test("a sign-up stores the email lower case and trimmed, as a customer with a customer row", async () => {
		const res = await signUp("  Ana.Perez@Example.com ");
		expect(res.status).toBe(200);
		const user = one<{ id: string; email: string; role: string }>(
			"select id, email, role from users where email = 'ana.perez@example.com'",
		);
		expect(user).toMatchObject({
			email: "ana.perez@example.com",
			role: "customer",
		});
		expect(
			one<unknown>(
				"select auth_user_id, email, name from customers where auth_user_id = ?",
				user.id,
			),
		).toEqual({
			auth_user_id: user.id,
			email: "ana.perez@example.com",
			name: "Ana Pérez",
		});
	});

	test("a sign-up links the guest customer who already ordered with that email", async () => {
		db.exec(
			"insert into customers (name, email, phone_e164, search_key) values ('Beto', 'beto@example.com', '+50371112222', 'beto')",
		);
		const guestId = one<{ id: number }>(
			"select id from customers where email = 'beto@example.com'",
		).id;
		expect((await signUp("BETO@example.com")).status).toBe(200);
		const rows = db
			.query(
				"select c.id, c.name, u.role from customers c join users u on u.id = c.auth_user_id where c.email = 'beto@example.com'",
			)
			.all();
		expect(rows).toEqual([{ id: guestId, name: "Beto", role: "customer" }]);
		expect(
			one<{ n: number }>(
				"select count(*) as n from customers where email = 'beto@example.com'",
			).n,
		).toBe(1);
	});

	test("an email that already has an account is refused, whatever its case", async () => {
		expect((await signUp("carla@example.com")).status).toBe(200);
		const again = await signUp(" Carla@Example.com");
		expect(again.status).toBe(422);
		expect(
			one<{ n: number }>(
				"select count(*) as n from users where email = 'carla@example.com'",
			).n,
		).toBe(1);
	});

	test("a role cannot be chosen at sign-up", async () => {
		const res = await post("/sign-up/email", {
			email: "dora@example.com",
			password: "a password of a good length",
			name: "Dora",
			role: "admin",
		});
		expect(res.status).toBe(400);
		expect(
			one<{ n: number }>("select count(*) as n from users where role = 'admin'")
				.n,
		).toBe(0);
	});

	test("a customer signs in with the password chosen at sign-up, and a wrong one is refused", async () => {
		expect((await signUp("eva@example.com")).status).toBe(200);
		const wrong = await post("/sign-in/email", {
			email: "eva@example.com",
			password: "not the password at all",
		});
		expect(wrong.status).toBe(401);
		const ok = await post("/sign-in/email", {
			email: "eva@example.com",
			password: "a password of a good length",
		});
		expect(ok.status).toBe(200);
		expect(ok.headers.get("set-cookie")).toContain("Secure");
		expect(ok.headers.get("set-cookie")).toContain("HttpOnly");
	});

	test("sign-ups from one address are rate limited", async () => {
		const ip = freshIp();
		const statuses: number[] = [];
		for (const n of [1, 2, 3, 4])
			statuses.push((await signUp(`limit${n}@example.com`, ip)).status);
		expect(statuses).toEqual([200, 200, 200, 429]);
	});

	test("a staff account gets no customer row", async () => {
		db.exec(
			"insert into users (id, name, email, email_verified, role) values ('staff-1', 'Soporte', 'soporte@example.com', 1, 'support')",
		);
		expect(
			one<{ n: number }>(
				"select count(*) as n from customers where auth_user_id = 'staff-1'",
			).n,
		).toBe(0);
	});
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
