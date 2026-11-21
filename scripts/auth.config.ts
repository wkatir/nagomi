import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authOptions } from "../src/server/auth/options";

// Only used by `bun run auth:generate`; the generator reads the options and never queries.
export const auth = betterAuth({
	...authOptions,
	database: drizzleAdapter({}, { provider: "sqlite", usePlural: true }),
});
