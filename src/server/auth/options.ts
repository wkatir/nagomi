import type { BetterAuthOptions } from "better-auth";
import { admin } from "better-auth/plugins";
import { ADMIN_ROLE, CUSTOMER_ROLE } from "#/lib/roles";

// Shared with the schema generator (scripts/auth.config.ts) so the tables match the runtime.
export const authOptions = {
	appName: "Nagomi",
	emailAndPassword: {
		enabled: true,
		disableSignUp: false,
		minPasswordLength: 10,
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
			"/sign-up/email": { window: 60, max: 3 },
			// Read-only and called on every back-office page: counting it would write to D1.
			"/get-session": false,
		},
	},
	// Cloudflare overwrites cf-connecting-ip; x-forwarded-for can be spoofed.
	advanced: { ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] } },
	// Unused by the back office; disabled so a stolen admin session cannot create users,
	// set passwords or impersonate.
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
	plugins: [admin({ adminRoles: [ADMIN_ROLE], defaultRole: CUSTOMER_ROLE })],
} satisfies BetterAuthOptions;
