import { zValidator } from "@hono/zod-validator";
import type { Context, ValidationTargets } from "hono";
import { type ZodType, z } from "zod";
import { LOCALES } from "#/db/schema";

export const invalidRequest = (c: Context, error: z.core.$ZodError) =>
	c.json(
		{
			error: "invalid_request" as const,
			issues: error.issues.map((i) => ({
				path: i.path.join("."),
				message: i.message,
			})),
		},
		400,
	);

export const validate = <
	T extends ZodType,
	Target extends keyof ValidationTargets,
>(
	target: Target,
	schema: T,
) =>
	zValidator(target, schema, (result, c) => {
		if (!result.success) return invalidRequest(c, result.error);
	});

export const idParam = z.object({ id: z.coerce.number().int().positive() });

export const localeQuery = z.object({ locale: z.enum(LOCALES) });
