// Public sign-up is disabled, so this is the only way to create the first admin.
//
//   bun run admin:create -- --email you@example.com --name "Your Name" [--remote] [--google-only]
//
// The password is read from ADMIN_PASSWORD; without it a random one is generated and
// printed once. With --google-only no password is stored.
import { spawnSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { ADMIN_ROLE } from "../src/lib/roles";
import { authOptions } from "../src/server/auth/options";

const { minPasswordLength, maxPasswordLength } = authOptions.emailAndPassword;
// The binding of wrangler.jsonc, so the script follows whichever database it names.
const DATABASE = "DB";

const { values } = parseArgs({
	options: {
		email: { type: "string" },
		name: { type: "string" },
		remote: { type: "boolean", default: false },
		"google-only": { type: "boolean", default: false },
	},
});

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !name) {
	console.error('Usage: bun run admin:create -- --email you@example.com --name "Your Name" [--remote]');
	process.exit(1);
}

const googleOnly = values["google-only"];
const given = process.env.ADMIN_PASSWORD;
const generated = !googleOnly && !given;
const password = given || randomBytes(15).toString("base64url");
if (
	!googleOnly &&
	(password.length < minPasswordLength || password.length > maxPasswordLength)
) {
	console.error(
		`ADMIN_PASSWORD must have between ${minPasswordLength} and ${maxPasswordLength} characters, it has ${password.length}.`,
	);
	process.exit(1);
}

const quote = (value: string) => `'${value.replaceAll("'", "''")}'`;
const userId = randomUUID();
const now = Date.now();
const userSql = `INSERT INTO users (id, name, email, email_verified, role, created_at, updated_at)
VALUES (${quote(userId)}, ${quote(name)}, ${quote(email)}, 1, ${quote(ADMIN_ROLE)}, ${now}, ${now});`;
const passwordSql = async () => `INSERT INTO accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
VALUES (${quote(randomUUID())}, ${quote(userId)}, 'credential', ${quote(userId)}, ${quote(await hashPassword(password))}, ${now}, ${now});`;
const sql = googleOnly ? userSql : `${userSql}
${await passwordSql()}`;

const file = join(tmpdir(), `eclalune-admin-${userId}.sql`);
writeFileSync(file, sql);
try {
	const target = values.remote ? "--remote" : "--local";
	const result = spawnSync("bunx", ["wrangler", "d1", "execute", DATABASE, target, `--file=${file}`], {
		stdio: "inherit",
		shell: process.platform === "win32",
	});
	if (result.status !== 0) {
		console.error("Could not create the admin. If the email already exists, use another one.");
		process.exit(result.status ?? 1);
	}
} finally {
	rmSync(file, { force: true });
}

console.log(`\nAdmin created: ${email}`);
if (googleOnly) console.log("Sign in with Google using that Workspace account.");
else if (generated) console.log(`Password (shown once, store it in your password manager): ${password}`);
