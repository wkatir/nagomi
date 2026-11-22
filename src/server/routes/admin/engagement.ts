import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { REVIEW_STATUSES } from "#/db/schema";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { sellableByVariant } from "../../domain/inventory";
import { getSettings } from "../../domain/settings";

const {
	customers,
	productReviews,
	productTranslations,
	products,
	stockAlerts,
	variants,
} = schema;

export const reviewsRouter = new Hono<AdminEnv>()
	.get(
		"/",
		validate("query", z.object({ status: z.enum(REVIEW_STATUSES).optional() })),
		async (c) => {
			const db = getDb();
			const { status } = c.req.valid("query");
			const { defaultLocale } = await getSettings(db);
			const [rows, counts] = await db.batch([
				db
					.select({
						id: productReviews.id,
						rating: productReviews.rating,
						title: productReviews.title,
						body: productReviews.body,
						status: productReviews.status,
						createdAt: productReviews.createdAt,
						updatedAt: productReviews.updatedAt,
						moderatedAt: productReviews.moderatedAt,
						productSlug: products.slug,
						productName: sql<string | null>`${productTranslations.name}`.as(
							"product_name",
						),
						customerId: sql<number>`${customers.id}`.as("customer_id"),
						customerName: sql<string | null>`${customers.name}`.as(
							"customer_name",
						),
						customerEmail: sql<string | null>`${customers.email}`.as(
							"customer_email",
						),
					})
					.from(productReviews)
					.innerJoin(products, eq(products.id, productReviews.productId))
					.innerJoin(customers, eq(customers.id, productReviews.customerId))
					.leftJoin(
						productTranslations,
						and(
							eq(productTranslations.productId, products.id),
							eq(productTranslations.locale, defaultLocale),
						),
					)
					.where(status ? eq(productReviews.status, status) : undefined)
					.orderBy(desc(productReviews.updatedAt), desc(productReviews.id))
					.limit(200),
				db
					.select({
						status: productReviews.status,
						reviews: sql<number>`count(*)`.as("reviews"),
					})
					.from(productReviews)
					.groupBy(productReviews.status),
			]);
			return c.json({
				reviews: rows,
				counts: Object.fromEntries(
					REVIEW_STATUSES.map((s) => [
						s,
						counts.find((x) => x.status === s)?.reviews ?? 0,
					]),
				) as Record<(typeof REVIEW_STATUSES)[number], number>,
			});
		},
	)
	.post(
		"/:id/:decision",
		validate(
			"param",
			idParam.extend({ decision: z.enum(["approve", "reject"]) }),
		),
		async (c) => {
			const db = getDb();
			const { id, decision } = c.req.valid("param");
			const status = decision === "approve" ? "approved" : "rejected";
			const [, [updated]] = await db.batch([
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "review.status",
					entityType: "review",
					entityId: id,
					data: { to: status },
				}),
				db
					.update(productReviews)
					.set({
						status,
						moderatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
					})
					.where(eq(productReviews.id, id))
					.returning({ id: productReviews.id, status: productReviews.status }),
			]);
			if (!updated) return c.json({ error: "not_found" }, 404);
			return c.json(updated);
		},
	);

export const stockAlertsRouter = new Hono<AdminEnv>()
	.get("/", async (c) => {
		const db = getDb();
		const { defaultLocale } = await getSettings(db);
		const rows = await db
			.select({
				id: stockAlerts.id,
				email: stockAlerts.email,
				createdAt: stockAlerts.createdAt,
				variantId: variants.id,
				sku: variants.sku,
				productSlug: products.slug,
				productName: productTranslations.name,
			})
			.from(stockAlerts)
			.innerJoin(variants, eq(variants.id, stockAlerts.variantId))
			.innerJoin(products, eq(products.id, variants.productId))
			.leftJoin(
				productTranslations,
				and(
					eq(productTranslations.productId, products.id),
					eq(productTranslations.locale, defaultLocale),
				),
			)
			.where(isNull(stockAlerts.notifiedAt))
			.orderBy(asc(variants.sku), asc(stockAlerts.createdAt));
		const units = await sellableByVariant(db, [
			...new Set(rows.map((r) => r.variantId)),
		]);
		const groups = new Map<
			number,
			{
				variantId: number;
				sku: string;
				productSlug: string;
				productName: string | null;
				unitsOnHand: number;
				alerts: { id: number; email: string; createdAt: string }[];
			}
		>();
		for (const r of rows) {
			const unitsOnHand = units.get(r.variantId);
			if (unitsOnHand === undefined)
				throw new Error(`No stock for variant ${r.variantId}`);
			const group = groups.get(r.variantId) ?? {
				variantId: r.variantId,
				sku: r.sku,
				productSlug: r.productSlug,
				productName: r.productName,
				unitsOnHand,
				alerts: [],
			};
			group.alerts.push({ id: r.id, email: r.email, createdAt: r.createdAt });
			groups.set(r.variantId, group);
		}
		return c.json({ products: [...groups.values()] });
	})
	.post("/:id/notified", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const [updated] = await db
			.update(stockAlerts)
			.set({ notifiedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))` })
			.where(and(eq(stockAlerts.id, id), isNull(stockAlerts.notifiedAt)))
			.returning({ id: stockAlerts.id });
		if (!updated) return c.json({ error: "not_found" }, 404);
		return c.json({ ok: true });
	});
