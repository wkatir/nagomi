import { env } from "cloudflare:workers";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { createAuthMiddleware } from "better-auth/api";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { getDb } from "#/db";
import {
	assertSecureBaseUrl,
	type GoogleEnv,
	googleProvider,
	signInMethods,
} from "#/server/auth/config";
import { authOptions } from "#/server/auth/options";
import {
	linkCustomerAccount,
	normalizeEmail,
} from "#/server/domain/customer-accounts";
import { CUSTOMER_ROLE } from "./roles";

assertSecureBaseUrl(env.BETTER_AUTH_URL);
const google = googleProvider(env as GoogleEnv);

export const authMethods = signInMethods(google);

const EMAIL_PATHS = ["/sign-up/email", "/sign-in/email"];

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
	hooks: {
		before: createAuthMiddleware(async (ctx) => {
			const email: unknown = ctx.body?.email;
			if (!EMAIL_PATHS.includes(ctx.path) || typeof email !== "string") return;
			return {
				context: { body: { ...ctx.body, email: normalizeEmail(email) } },
			};
		}),
	},
	databaseHooks: {
		user: {
			create: {
				before: async (user) => ({
					data: { ...user, email: normalizeEmail(user.email) },
				}),
				after: async (user) => {
					if ((user as { role?: string | null }).role === CUSTOMER_ROLE)
						await linkCustomerAccount(getDb(), user);
				},
			},
		},
	},
	plugins: [...authOptions.plugins, tanstackStartCookies()],
});
