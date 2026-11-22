export type GoogleEnv = {
	GOOGLE_CLIENT_ID?: string;
	GOOGLE_CLIENT_SECRET?: string;
};

// Never creates users: the admin must already exist (scripts/create-admin.ts).
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

export const signInMethods = (google: object | undefined) => ({
	google: google !== undefined,
	password: true,
});

// The session cookie is Secure, so a plain-http origin would lose it.
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
