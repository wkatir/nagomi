import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "#/db";
import {
	assertSecureBaseUrl,
	googleProvider,
	signInMethods,
} from "#/server/auth/config";
import { authOptions } from "#/server/auth/options";

assertSecureBaseUrl(env.BETTER_AUTH_URL);
const google = googleProvider(env);

export const authMethods = signInMethods(google);

export const auth = betterAuth({
	...authOptions,
	emailAndPassword: {
		...authOptions.emailAndPassword,
		enabled: authMethods.password,
	},
	secret: env.BETTER_AUTH_SECRET,
	baseURL: env.BETTER_AUTH_URL,
	database: drizzleAdapter(getDb(), { provider: "sqlite", usePlural: true }),
	socialProviders: google ? { google } : {},
	account: {
		// Google is not a trusted provider, so linking to an existing admin needs an email
		// Google reports as verified.
		accountLinking: { enabled: true },
		encryptOAuthTokens: true,
	},
	plugins: [...authOptions.plugins, tanstackStartCookies()],
});
