import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { normalizeEmail } from "../domain/customer-accounts";
import { sellableByVariant } from "../domain/inventory";
import { approvedReviews } from "../domain/reviews";
import { withinLimit } from "../rate-limit";
import { validate } from "../validate";

const { products, stockAlerts, variants } = schema;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const engagement = new Hono()
	.get(
		"/products/:slug/reviews",
		validate("param", z.object({ slug: z.string().min(1).max(80) })),
		async (c) => {
			const db = getDb();
			const product = await db.query.products.findFirst({
				columns: { id: true },
				where: and(
					eq(products.slug, c.req.valid("param").slug),
					eq(products.status, "published"),
				),
			});
			if (!product) return c.json({ error: "not_found" }, 404);
			return c.json(await approvedReviews(db, product.id));
		},
	)
	.post(
		"/stock-alerts",
		validate(
			"json",
			z.object({
				sku: z.string().trim().min(1).max(40),
				email: z.string().trim().max(120),
			}),
		),
		async (c) => {
			const db = getDb();
			const input = c.req.valid("json");
			const email = normalizeEmail(input.email);
			if (!EMAIL.test(email))
				return c.json(
					{ error: "invalid_fields" as const, fields: { email: "invalid" } },
					422,
				);
			if (!(await withinLimit(c, "stock-alert")))
				return c.json({ error: "rate_limited" }, 429);
			const [variant] = await db
				.select({ id: variants.id })
				.from(variants)
				.innerJoin(products, eq(products.id, variants.productId))
				.where(
					and(
						eq(variants.sku, input.sku),
						eq(variants.status, "active"),
						eq(products.status, "published"),
					),
				);
			if (!variant) return c.json({ error: "product_unavailable" }, 404);
			const units = (await sellableByVariant(db, [variant.id])).get(variant.id);
			if (units === undefined) throw new Error(`No stock for ${variant.id}`);
			if (units > 0) return c.json({ error: "in_stock" as const }, 409);
			const pending = await db.query.stockAlerts.findFirst({
				columns: { id: true },
				where: and(
					eq(stockAlerts.variantId, variant.id),
					eq(stockAlerts.email, email),
					isNull(stockAlerts.notifiedAt),
				),
			});
			if (!pending)
				await db.insert(stockAlerts).values({ variantId: variant.id, email });
			return c.json({ ok: true }, pending ? 200 : 201);
		},
	);
