// Kept apart from src/lib/auth.ts so it can be tested without a Worker.
type AuthEnv = {
	BETTER_AUTH_URL: string;
	GOOGLE_CLIENT_ID: string;
	GOOGLE_CLIENT_SECRET: string;
	GOOGLE_WORKSPACE_DOMAIN: string;
};

// Both credentials blank: off, as in local development. It never creates users: an admin
// must already exist (scripts/create-admin.ts) with the same email, and the Google account
// must belong to the Workspace domain (enforced on the id token's hd claim).
export function googleProvider(env: AuthEnv) {
	if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET))
		throw new Error(
			"GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
		);
	if (!env.GOOGLE_CLIENT_ID) return undefined;
	if (!env.GOOGLE_WORKSPACE_DOMAIN)
		throw new Error(
			"GOOGLE_WORKSPACE_DOMAIN is required with the Google credentials",
		);
	return {
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
		hd: env.GOOGLE_WORKSPACE_DOMAIN,
		prompt: "select_account" as const,
		disableSignUp: true,
	};
}

// Password sign-in is off once Google is configured: admins use their Workspace account, and
// a password attempt costs a scrypt hash, which is heavy for a Worker. Without Google (local
// development, a fresh install) it is the only way in.
export const signInMethods = (google: object | undefined) => ({
	google: google !== undefined,
	password: google === undefined,
});

// Sessions travel in a Secure cookie, which a plain-http origin would lose. Only a local
// development URL may be http.
export function assertSecureBaseUrl(url: string) {
	const { protocol, hostname } = new URL(url);
	if (
		protocol !== "https:" &&
		hostname !== "localhost" &&
		hostname !== "127.0.0.1"
	)
		throw new Error(
			`BETTER_AUTH_URL must be https outside localhost, received: "${url}"`,
		);
}
