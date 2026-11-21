import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";
import { ADMIN_ROLE } from "#/lib/roles";

// Shared by the Worker (src/lib/auth.ts) and the schema generator (scripts/auth.config.ts),
// so the generated tables always match the runtime configuration.
export const authOptions = {
	appName: "Eclalune",
	emailAndPassword: {
		enabled: true,
		// Accounts come from scripts/create-admin.ts.
		disableSignUp: true,
		minPasswordLength: 12,
		maxPasswordLength: 128,
	},
	session: {
		expiresIn: 60 * 60 * 24 * 7,
		updateAge: 60 * 60 * 24,
	},
	// Stored in D1 so limits hold across Worker isolates.
	rateLimit: {
		enabled: true,
		storage: "database",
		customRules: {
			"/sign-in/email": { window: 60, max: 5 },
			// Read-only, and the back office calls it on every page it opens: counting it
			// would write to D1 for nothing.
			"/get-session": false,
		},
	},
	// Cloudflare sets cf-connecting-ip on every request and overwrites a client's value, so
	// sign-in limits count real clients (x-forwarded-for is not trustworthy here).
	advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
	// The back office has no screen for these admin plugin endpoints, which create or edit an
	// account, set a password or act as another user. They answer 404 rather than sit one
	// stolen admin session away from use.
	disabledPaths: [
		"/admin/create-user",
		"/admin/update-user",
		"/admin/set-role",
		"/admin/set-user-password",
		"/admin/remove-user",
		"/admin/impersonate-user",
		"/admin/stop-impersonating",
	],
	onAPIError: { errorURL: "/admin/login" },
	plugins: [admin({ adminRoles: [ADMIN_ROLE] })],
} satisfies BetterAuthOptions;
