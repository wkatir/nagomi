import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { auth } from "#/lib/auth";
import { LOCALES } from "#/lib/enums";
import { CUSTOMER_ROLE } from "#/lib/roles";
import { isSvMunicipality } from "#/lib/sv-locations";
import { checkoutPageVersions } from "../domain/pages";
import { salvadoranE164 } from "../domain/phone";
import { productTextIn } from "../domain/product-text";
import { phoneDigits, searchKey } from "../domain/search";
import { getSettings } from "../domain/settings";
import { patchOf, validate } from "../validate";

const {
	customerAddresses,
	customerConsents,
	customers,
	orderItems,
	orderStatusHistory,
	orders,
	productReviews,
	productTranslations,
	products,
	variants,
	wishlistItems,
} = schema;

export type AccountEnv = { Variables: { customerId: number } };

export const requireCustomer = createMiddleware<AccountEnv>(async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });
	if (!session) return c.json({ error: "unauthorized" }, 401);
	if (session.user.banned || session.user.role !== CUSTOMER_ROLE)
		return c.json({ error: "forbidden" }, 403);
	const customer = await getDb().query.customers.findFirst({
		columns: { id: true },
		where: eq(customers.authUserId, session.user.id),
	});
	if (!customer) return c.json({ error: "forbidden" }, 403);
	c.set("customerId", customer.id);
	return next();
});

const MARKETING = ["marketing_email", "marketing_whatsapp"] as const;

const phoneInput = z.string().trim().min(1).max(30);

async function salvadoranPhone(input: string) {
	const { countryCode } = await getSettings(getDb());
	return salvadoranE164(input, countryCode);
}

const profilePatch = patchOf(
	z.object({
		name: z.string().trim().min(1).max(80),
		phone: phoneInput.nullable(),
	}),
);

const consentsInput = z.object({
	locale: z.enum(LOCALES),
	privacyNotice: z.literal(true).optional(),
	marketingEmail: z.boolean(),
	marketingWhatsapp: z.boolean(),
});

const addressShape = {
	recipientName: z.string().trim().min(1).max(80),
	department: z.string().trim().min(1).max(40),
	municipality: z.string().trim().min(1).max(60),
	addressLine: z.string().trim().min(1).max(200),
	reference: z.string().trim().max(200).nullable(),
	phone: phoneInput,
};
const placeIsKnown = (v: { department?: string; municipality?: string }) =>
	v.department === undefined ||
	v.municipality === undefined ||
	isSvMunicipality(v.department, v.municipality);
const unknownPlace = {
	message: "Unknown department or municipality",
	path: ["municipality"],
};

const addressInput = z
	.object({ ...addressShape, isDefault: z.boolean().default(false) })
	.refine(placeIsKnown, unknownPlace);
const addressPatch = patchOf(z.object(addressShape))
	.refine(
		(v) => (v.department === undefined) === (v.municipality === undefined),
		{
			message: "Department and municipality change together",
			path: ["municipality"],
		},
	)
	.refine(placeIsKnown, unknownPlace);

const addressId = z.object({ id: z.coerce.number().int().positive() });
const productSlug = z.object({ slug: z.string().trim().min(1).max(80) });
const reviewInput = z.object({
	rating: z.number().int().min(1).max(5),
	title: z.string().trim().min(1).max(120),
	body: z.string().trim().min(1).max(2000),
});

function publishedProduct(slug: string) {
	return getDb().query.products.findFirst({
		columns: { id: true },
		where: and(eq(products.slug, slug), eq(products.status, "published")),
	});
}
const orderCode = z.object({ code: z.string().trim().min(1).max(40) });

const addressColumns = {
	id: customerAddresses.id,
	recipientName: customerAddresses.recipientName,
	department: customerAddresses.department,
	municipality: customerAddresses.municipality,
	addressLine: customerAddresses.addressLine,
	reference: customerAddresses.reference,
	phone: customerAddresses.phoneE164,
	isDefault: customerAddresses.isDefault,
};

const ownAddress = (customerId: number, id: number) =>
	and(
		eq(customerAddresses.id, id),
		eq(customerAddresses.customerId, customerId),
		eq(customerAddresses.status, "active"),
	);

async function currentMarketing(customerId: number) {
	const rows = await getDb()
		.select({
			purpose: customerConsents.purpose,
			granted: customerConsents.granted,
		})
		.from(customerConsents)
		.where(
			and(
				eq(customerConsents.customerId, customerId),
				sql`${customerConsents.id} = (select max(c2.id) from customer_consents c2 where c2.customer_id = ${customerConsents.customerId} and c2.purpose = ${customerConsents.purpose})`,
			),
		);
	const granted = (purpose: (typeof MARKETING)[number]) =>
		rows.find((r) => r.purpose === purpose)?.granted ?? null;
	return {
		marketingEmail: granted("marketing_email"),
		marketingWhatsapp: granted("marketing_whatsapp"),
	};
}

async function profileOf(customerId: number) {
	const customer = await getDb().query.customers.findFirst({
		columns: { name: true, email: true, phoneE164: true },
		where: eq(customers.id, customerId),
	});
	if (!customer) throw new Error(`Customer ${customerId} vanished`);
	return {
		name: customer.name,
		email: customer.email,
		phone: customer.phoneE164,
		consents: await currentMarketing(customerId),
	};
}

export const account = new Hono<AccountEnv>()
	.use("*", requireCustomer)
	.get("/profile", async (c) => c.json(await profileOf(c.var.customerId)))
	.patch("/profile", validate("json", profilePatch), async (c) => {
		const db = getDb();
		const id = c.var.customerId;
		const input = c.req.valid("json");
		let phoneE164: string | null | undefined;
		if (input.phone === null) phoneE164 = null;
		else if (input.phone !== undefined) {
			phoneE164 = await salvadoranPhone(input.phone);
			if (phoneE164 === null)
				return c.json({ error: "phone_not_salvadoran" }, 422);
		}
		const customer = await db.query.customers.findFirst({
			where: eq(customers.id, id),
		});
		if (!customer) throw new Error(`Customer ${id} vanished`);
		const after = {
			name: input.name ?? customer.name,
			phoneE164: phoneE164 === undefined ? customer.phoneE164 : phoneE164,
		};
		await db
			.update(customers)
			.set({
				...after,
				searchKey: searchKey(
					after.name,
					customer.email,
					phoneDigits(after.phoneE164),
				),
			})
			.where(eq(customers.id, id));
		return c.json(await profileOf(id));
	})
	.put("/consents", validate("json", consentsInput), async (c) => {
		const db = getDb();
		const input = c.req.valid("json");
		const { defaultLocale } = await getSettings(db);
		const pages = await checkoutPageVersions(db, input.locale, defaultLocale);
		if (!pages.ok)
			return c.json({ error: "store_not_ready", missing: pages.missing }, 409);
		const rows = [
			...(input.privacyNotice
				? [{ purpose: "privacy_notice" as const, granted: true }]
				: []),
			{ purpose: "marketing_email" as const, granted: input.marketingEmail },
			{
				purpose: "marketing_whatsapp" as const,
				granted: input.marketingWhatsapp,
			},
		].map((r) => ({
			...r,
			customerId: c.var.customerId,
			pageVersionId: pages.versions.privacy,
			channel: "web" as const,
		}));
		await db.insert(customerConsents).values(rows);
		return c.json(await profileOf(c.var.customerId));
	})
	.get("/addresses", async (c) =>
		c.json(
			await getDb()
				.select(addressColumns)
				.from(customerAddresses)
				.where(
					and(
						eq(customerAddresses.customerId, c.var.customerId),
						eq(customerAddresses.status, "active"),
					),
				)
				.orderBy(desc(customerAddresses.isDefault), asc(customerAddresses.id)),
		),
	)
	.post("/addresses", validate("json", addressInput), async (c) => {
		const db = getDb();
		const customerId = c.var.customerId;
		const { phone, isDefault, ...input } = c.req.valid("json");
		const phoneE164 = await salvadoranPhone(phone);
		if (phoneE164 === null)
			return c.json({ error: "phone_not_salvadoran" }, 422);
		const insert = db
			.insert(customerAddresses)
			.values({ ...input, phoneE164, customerId, isDefault })
			.returning(addressColumns);
		if (!isDefault) {
			const [created] = await insert;
			return c.json(created, 201);
		}
		const [, [created]] = await db.batch([
			db
				.update(customerAddresses)
				.set({ isDefault: false })
				.where(
					and(
						eq(customerAddresses.customerId, customerId),
						eq(customerAddresses.isDefault, true),
					),
				),
			insert,
		]);
		return c.json(created, 201);
	})
	.patch(
		"/addresses/:id",
		validate("param", addressId),
		validate("json", addressPatch),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { phone, ...input } = c.req.valid("json");
			let phoneE164: string | undefined;
			if (phone !== undefined) {
				const normalized = await salvadoranPhone(phone);
				if (normalized === null)
					return c.json({ error: "phone_not_salvadoran" }, 422);
				phoneE164 = normalized;
			}
			const [updated] = await db
				.update(customerAddresses)
				.set({
					...input,
					...(phoneE164 === undefined ? {} : { phoneE164 }),
					updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
				})
				.where(ownAddress(c.var.customerId, id))
				.returning(addressColumns);
			if (!updated) return c.json({ error: "not_found" }, 404);
			return c.json(updated);
		},
	)
	.post("/addresses/:id/default", validate("param", addressId), async (c) => {
		const db = getDb();
		const customerId = c.var.customerId;
		const { id } = c.req.valid("param");
		const found = await db.query.customerAddresses.findFirst({
			columns: { id: true },
			where: ownAddress(customerId, id),
		});
		if (!found) return c.json({ error: "not_found" }, 404);
		const [, [updated]] = await db.batch([
			db
				.update(customerAddresses)
				.set({ isDefault: false })
				.where(
					and(
						eq(customerAddresses.customerId, customerId),
						eq(customerAddresses.isDefault, true),
						ne(customerAddresses.id, id),
					),
				),
			db
				.update(customerAddresses)
				.set({ isDefault: true })
				.where(ownAddress(customerId, id))
				.returning(addressColumns),
		]);
		return c.json(updated);
	})
	.delete("/addresses/:id", validate("param", addressId), async (c) => {
		const [archived] = await getDb()
			.update(customerAddresses)
			.set({
				status: "archived",
				isDefault: false,
				updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
			})
			.where(ownAddress(c.var.customerId, c.req.valid("param").id))
			.returning({ id: customerAddresses.id });
		if (!archived) return c.json({ error: "not_found" }, 404);
		return c.json({ ok: true });
	})
	.get("/orders", async (c) =>
		c.json(
			await getDb()
				.select({
					code: orders.code,
					status: orders.status,
					subtotal: orders.subtotal,
					discount: orders.discount,
					shipping: orders.shipping,
					total: orders.total,
					createdAt: orders.createdAt,
					items: sql<number>`(select coalesce(sum(i.quantity), 0) from order_items i where i.order_id = ${orders.id})`,
				})
				.from(orders)
				.where(eq(orders.customerId, c.var.customerId))
				.orderBy(desc(orders.createdAt), desc(orders.id)),
		),
	)
	.get("/orders/:code", validate("param", orderCode), async (c) => {
		const db = getDb();
		const order = await db.query.orders.findFirst({
			columns: {
				id: true,
				code: true,
				status: true,
				subtotal: true,
				discount: true,
				shipping: true,
				total: true,
				shippingZoneName: true,
				paymentMethod: true,
				shipDepartment: true,
				shipMunicipality: true,
				shipAddressLine: true,
				shipReference: true,
				courier: true,
				trackingCode: true,
				taxIncluded: true,
				deliveryEstimateFrom: true,
				deliveryEstimateTo: true,
				createdAt: true,
			},
			where: and(
				eq(orders.code, c.req.valid("param").code),
				eq(orders.customerId, c.var.customerId),
			),
		});
		if (!order) return c.json({ error: "not_found" }, 404);
		const [lines, history] = await db.batch([
			db
				.select({
					sku: orderItems.sku,
					brandName: orderItems.brandName,
					productName: orderItems.productName,
					optionLabel: orderItems.optionLabel,
					quantity: orderItems.quantity,
					unitPrice: orderItems.unitPrice,
				})
				.from(orderItems)
				.where(eq(orderItems.orderId, order.id))
				.orderBy(asc(orderItems.id)),
			db
				.select({
					from: orderStatusHistory.fromStatus,
					to: orderStatusHistory.toStatus,
					at: orderStatusHistory.changedAt,
				})
				.from(orderStatusHistory)
				.where(eq(orderStatusHistory.orderId, order.id))
				.orderBy(asc(orderStatusHistory.id)),
		]);
		const { id: _, ...head } = order;
		return c.json({ ...head, lines, statusHistory: history });
	})
	.get(
		"/reviews",
		validate("query", z.object({ locale: z.enum(LOCALES) })),
		async (c) => {
			const db = getDb();
			const { locale } = c.req.valid("query");
			const rows = await db
				.selectDistinct({
					productId: products.id,
					slug: products.slug,
					name: productTranslations.name,
				})
				.from(orders)
				.innerJoin(orderItems, eq(orderItems.orderId, orders.id))
				.innerJoin(variants, eq(variants.id, orderItems.variantId))
				.innerJoin(products, eq(products.id, variants.productId))
				.innerJoin(productTranslations, productTextIn(locale))
				.where(
					and(
						eq(orders.customerId, c.var.customerId),
						eq(orders.status, "delivered"),
					),
				)
				.orderBy(asc(productTranslations.name));
			const reviews = await db
				.select({
					productId: productReviews.productId,
					rating: productReviews.rating,
					title: productReviews.title,
					body: productReviews.body,
					status: productReviews.status,
					updatedAt: productReviews.updatedAt,
				})
				.from(productReviews)
				.where(eq(productReviews.customerId, c.var.customerId));
			return c.json(
				rows.map((r) => ({
					...r,
					review: reviews.find((x) => x.productId === r.productId) ?? null,
				})),
			);
		},
	)
	// The product_reviews_requires_delivered_order trigger refuses customers without a delivered order.
	.put(
		"/reviews/:slug",
		validate("param", productSlug),
		validate("json", reviewInput),
		async (c) => {
			const db = getDb();
			const product = await publishedProduct(c.req.valid("param").slug);
			if (!product) return c.json({ error: "not_found" }, 404);
			const input = c.req.valid("json");
			const [saved] = await db
				.insert(productReviews)
				.values({
					productId: product.id,
					customerId: c.var.customerId,
					...input,
				})
				.onConflictDoUpdate({
					target: [productReviews.customerId, productReviews.productId],
					set: {
						...input,
						status: "pending",
						moderatedAt: null,
						updatedAt: sql`(strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))`,
					},
				})
				.returning({
					rating: productReviews.rating,
					title: productReviews.title,
					body: productReviews.body,
					status: productReviews.status,
				});
			return c.json(saved);
		},
	)
	.get("/wishlist", async (c) =>
		c.json(
			await getDb()
				.select({
					slug: products.slug,
					createdAt: wishlistItems.createdAt,
				})
				.from(wishlistItems)
				.innerJoin(products, eq(products.id, wishlistItems.productId))
				.where(eq(wishlistItems.customerId, c.var.customerId))
				.orderBy(desc(wishlistItems.createdAt)),
		),
	)
	.put("/wishlist/:slug", validate("param", productSlug), async (c) => {
		const product = await publishedProduct(c.req.valid("param").slug);
		if (!product) return c.json({ error: "not_found" }, 404);
		await getDb()
			.insert(wishlistItems)
			.values({ customerId: c.var.customerId, productId: product.id })
			.onConflictDoNothing();
		return c.json({ ok: true });
	})
	.delete("/wishlist/:slug", validate("param", productSlug), async (c) => {
		const db = getDb();
		const product = await db.query.products.findFirst({
			columns: { id: true },
			where: eq(products.slug, c.req.valid("param").slug),
		});
		if (product)
			await db
				.delete(wishlistItems)
				.where(
					and(
						eq(wishlistItems.customerId, c.var.customerId),
						eq(wishlistItems.productId, product.id),
					),
				);
		return c.json({ ok: true });
	});
