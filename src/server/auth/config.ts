// Kept apart from src/lib/auth.ts so it can be tested without a Worker.
// Optional secrets: wrangler.jsonc does not require them.
export type GoogleEnv = {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

// Both credentials unset: off, as in local development. It never creates users: an admin
// must already exist (scripts/create-admin.ts) with the same email.
export function googleProvider(env: GoogleEnv) {
	if (Boolean(env.GOOGLE_CLIENT_ID) !== Boolean(env.GOOGLE_CLIENT_SECRET))
		throw new Error(
			"GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together",
		);
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return undefined;
	return {
		clientId: env.GOOGLE_CLIENT_ID,
		clientSecret: env.GOOGLE_CLIENT_SECRET,
		prompt: "select_account" as const,
		disableSignUp: true,
	};
}

// Password sign-in is off once Google is configured: admins use their Google account, and
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
