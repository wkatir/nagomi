import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { authOptions } from "../src/server/auth/options";

// Only for `bun run auth:generate`: the generator never queries the database.
export const auth = betterAuth({
	...authOptions,
	database: drizzleAdapter({}, { provider: "sqlite", usePlural: true }),
});
