import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { customerListSearch } from "#/lib/schemas/customers";
import { SV_PHONE_REGEX } from "#/lib/sv-locations";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { customerDetail, pagedCustomers } from "../../domain/customer-queries";
import { normalizePhone } from "../../domain/phone";
import { phoneDigits, searchKey } from "../../domain/search";
import { getSettings } from "../../domain/settings";

const { customers } = schema;

const editInput = z
	.object({
		name: z.string().trim().min(1).max(80),
		phone: z.string().trim().min(1).max(30).nullable(),
		email: z.string().trim().toLowerCase().pipe(z.email().max(120)).nullable(),
		notes: z.string().trim().max(1000).nullable(),
	})
	.partial()
	.refine((v) => Object.values(v).some((x) => x !== undefined), {
		message: "Nothing to change",
	});

export const customersRouter = new Hono<AdminEnv>()
	.get("/", validate("query", customerListSearch), async (c) =>
		c.json(await pagedCustomers(getDb(), c.req.valid("query"))),
	)
	.get("/:id", validate("param", idParam), async (c) => {
		const detail = await customerDetail(getDb(), c.req.valid("param").id);
		if (!detail) return c.json({ error: "not_found" }, 404);
		return c.json(detail);
	})
	// A phone or email another customer has fails the unique index (409).
	.patch(
		"/:id",
		validate("param", idParam),
		validate("json", editInput),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const customer = await db.query.customers.findFirst({
				where: eq(customers.id, id),
			});
			if (!customer) return c.json({ error: "not_found" }, 404);
			let phoneE164: string | null | undefined;
			if (input.phone === null) phoneE164 = null;
			else if (input.phone !== undefined) {
				const { countryCode } = await getSettings(db);
				phoneE164 = normalizePhone(input.phone, countryCode);
				if (!SV_PHONE_REGEX.test(phoneE164))
					return c.json({ error: "phone_not_salvadoran" }, 422);
			}
			const changes = {
				...(input.name !== undefined ? { name: input.name } : {}),
				...(input.email !== undefined ? { email: input.email } : {}),
				...(input.notes !== undefined ? { notes: input.notes || null } : {}),
				...(phoneE164 !== undefined ? { phoneE164 } : {}),
			};
			const after = { ...customer, ...changes };
			await db.batch([
				db
					.update(customers)
					.set({
						...changes,
						searchKey: searchKey(
							after.name,
							after.email,
							phoneDigits(after.phoneE164),
						),
					})
					.where(eq(customers.id, id)),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "customer.update",
					entityType: "customer",
					entityId: id,
					data: {
						before: Object.fromEntries(
							Object.keys(changes).map((k) => [
								k,
								customer[k as keyof typeof changes],
							]),
						),
						after: changes,
					},
				}),
			]);
			return c.json({ ok: true });
		},
	);
