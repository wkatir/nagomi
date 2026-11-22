import { and, asc, eq, ne, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { ARCHIVABLE_STATUSES, now } from "#/db/schema";
import { supplierListSearch } from "#/lib/schemas/suppliers";
import type { AdminEnv } from "#/server/auth";
import { idParam, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { insertIfExists } from "../../domain/d1";
import { normalizePhone } from "../../domain/phone";
import { openPurchasesOf } from "../../domain/purchase-queries";
import { searchKey, withoutSearchKey } from "../../domain/search";
import { getSettings } from "../../domain/settings";
import {
	pagedSuppliers,
	supplierColumns,
	supplierOptions,
} from "../../domain/supplier-queries";
import { optionalText, requiredText } from "./catalog-inputs";

const {
	brands,
	productTranslations,
	products,
	supplierItems,
	suppliers,
	variants,
} = schema;

const supplierFields = z.object({
	name: requiredText(120),
	contactName: optionalText(120),
	phone: optionalText(40),
	email: z
		.string()
		.trim()
		.toLowerCase()
		.max(254)
		.nullable()
		.transform((v) => v || null)
		.pipe(z.email().nullable()),
	paymentTerms: optionalText(500),
	// Null while not known.
	leadTimeDays: z.number().int().min(0).max(365).nullable(),
	notes: optionalText(2000),
});

const itemFields = z.object({
	supplierSku: optionalText(60),
	packSize: z.number().int().positive().max(10_000).nullable(),
	minOrderQuantity: z.number().int().positive().max(100_000).nullable(),
	// Setting it moves the flag from another supplier.
	isPreferred: z.boolean(),
});
const itemParam = idParam.extend({
	itemId: z.coerce.number().int().positive(),
});

async function phoneE164(phone: string | null | undefined) {
	if (!phone) return null;
	const { countryCode } = await getSettings(getDb());
	return normalizePhone(phone, countryCode);
}

const itemRows = (locale: string) =>
	getDb()
		.select({
			id: supplierItems.id,
			supplierId: supplierItems.supplierId,
			supplier: suppliers.name,
			supplierStatus: suppliers.status,
			leadTimeDays: suppliers.leadTimeDays,
			variantId: supplierItems.variantId,
			sku: variants.sku,
			brand: brands.name,
			name: productTranslations.name,
			optionLabel: variants.optionLabel,
			supplierSku: supplierItems.supplierSku,
			packSize: supplierItems.packSize,
			minOrderQuantity: supplierItems.minOrderQuantity,
			isPreferred: supplierItems.isPreferred,
			status: supplierItems.status,
			updatedAt: supplierItems.updatedAt,
		})
		.from(supplierItems)
		.innerJoin(suppliers, eq(suppliers.id, supplierItems.supplierId))
		.innerJoin(variants, eq(variants.id, supplierItems.variantId))
		.innerJoin(products, eq(products.id, variants.productId))
		.innerJoin(brands, eq(brands.id, products.brandId))
		.leftJoin(
			productTranslations,
			and(
				eq(productTranslations.productId, variants.productId),
				sql`${productTranslations.locale} = ${locale}`,
			),
		)
		.$dynamic();

// One preferred active source per variant (a unique index), so the other one is cleared
// first. A no-op when `preferred` is false.
const clearPreferred = (
	variantId: number,
	preferred: boolean,
	exceptId: number | null,
	guard?: SQL,
) =>
	getDb()
		.update(supplierItems)
		.set({ isPreferred: false, updatedAt: now })
		.where(
			and(
				eq(supplierItems.variantId, variantId),
				eq(supplierItems.isPreferred, true),
				sql`${preferred ? 1 : 0} = 1`,
				exceptId === null ? undefined : ne(supplierItems.id, exceptId),
				guard,
			),
		);

const nameTaken = (name: string, exceptId: number | null) =>
	sql`exists (select 1 from ${suppliers} s where lower(s.name) = lower(${name})${exceptId === null ? sql`` : sql` and s.id <> ${exceptId}`})`;

// Suppliers are archived, never deleted; new purchase orders need an active supplier
// (also a trigger).
export const suppliersRouter = new Hono<AdminEnv>()
	.get("/", validate("query", supplierListSearch), async (c) =>
		c.json(await pagedSuppliers(getDb(), c.req.valid("query"))),
	)
	// A purchase order lists archived ones too.
	.get(
		"/options",
		validate(
			"query",
			z.object({ status: z.enum(ARCHIVABLE_STATUSES).optional() }),
		),
		async (c) =>
			c.json(await supplierOptions(getDb(), c.req.valid("query").status)),
	)
	.get(
		"/items",
		validate(
			"query",
			z.object({
				variantId: z.coerce.number().int().positive().optional(),
				supplierId: z.coerce.number().int().positive().optional(),
				status: z.enum(ARCHIVABLE_STATUSES).optional(),
			}),
		),
		async (c) => {
			const q = c.req.valid("query");
			const { defaultLocale } = await getSettings(getDb());
			const rows = await itemRows(defaultLocale)
				.where(
					and(
						q.variantId ? eq(supplierItems.variantId, q.variantId) : undefined,
						q.supplierId
							? eq(supplierItems.supplierId, q.supplierId)
							: undefined,
						q.status ? eq(supplierItems.status, q.status) : undefined,
					),
				)
				.orderBy(asc(variants.sku), asc(suppliers.name));
			return c.json(rows);
		},
	)
	.post(
		"/:id/items",
		validate("param", idParam),
		validate(
			"json",
			itemFields.partial().extend({ variantId: z.number().int().positive() }),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const input = c.req.valid("json");
			const [supplier, variant] = await Promise.all([
				db.query.suppliers.findFirst({ where: eq(suppliers.id, id) }),
				db.query.variants.findFirst({
					where: eq(variants.id, input.variantId),
				}),
			]);
			if (!supplier || !variant) return c.json({ error: "not_found" }, 404);
			if (supplier.status !== "active")
				return c.json({ error: "supplier_archived" }, 409);
			const values = {
				supplierId: id,
				variantId: input.variantId,
				supplierSku: input.supplierSku ?? null,
				packSize: input.packSize ?? null,
				minOrderQuantity: input.minOrderQuantity ?? null,
				isPreferred: input.isPreferred ?? false,
			};
			const itemId = sql<number>`(select id from supplier_items where supplier_id = ${id} and variant_id = ${input.variantId})`;
			const [, [row]] = await db.batch([
				clearPreferred(input.variantId, values.isPreferred, null),
				db.insert(supplierItems).values(values).returning(),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "supplier_item.create",
					entityType: "supplier_item",
					entityId: itemId,
					data: values,
				}),
			]);
			return c.json(row, 201);
		},
	)
	.patch(
		"/:id/items/:itemId",
		validate("param", itemParam),
		validate(
			"json",
			itemFields
				.extend({ status: z.enum(ARCHIVABLE_STATUSES) })
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id, itemId } = c.req.valid("param");
			const input = c.req.valid("json");
			const stored = await db.query.supplierItems.findFirst({
				where: and(
					eq(supplierItems.id, itemId),
					eq(supplierItems.supplierId, id),
				),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const status = input.status ?? stored.status;
			// An archived item, or an item of an archived supplier, is never the preferred
			// source: asking for it is refused; archiving the preferred item drops the flag.
			if (input.isPreferred && status !== "active")
				return c.json({ error: "supplier_item_archived" }, 409);
			const isPreferred =
				status === "active" && (input.isPreferred ?? stored.isPreferred);
			const supplierActive = sql`exists (select 1 from ${suppliers} s where s.id = ${id} and s.status = 'active')`;
			if (input.isPreferred) {
				const supplier = await db.query.suppliers.findFirst({
					where: eq(suppliers.id, id),
				});
				if (!supplier) throw new Error(`Supplier ${id} missing`);
				if (supplier.status !== "active")
					return c.json({ error: "supplier_archived" }, 409);
			}
			const patch = { ...input, isPreferred };
			const target = and(
				eq(supplierItems.id, itemId),
				input.isPreferred ? supplierActive : undefined,
			);
			const [, , rows] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit(
							"supplier_item",
							itemId,
							stored.status,
							input.status,
							{ before: stored, patch },
						),
					},
					db.select({ id: supplierItems.id }).from(supplierItems).where(target),
				),
				clearPreferred(
					stored.variantId,
					isPreferred,
					itemId,
					input.isPreferred ? supplierActive : undefined,
				),
				db
					.update(supplierItems)
					.set({ ...patch, updatedAt: now })
					.where(target)
					.returning(),
			]);
			const [row] = rows;
			if (!row) return c.json({ error: "supplier_archived" }, 409);
			return c.json(row);
		},
	)
	.get("/:id", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const [row] = await db
			.select(supplierColumns)
			.from(suppliers)
			.where(eq(suppliers.id, id));
		if (!row) return c.json({ error: "not_found" }, 404);
		return c.json({ ...row, openOrders: await openPurchasesOf(db, id) });
	})
	.post(
		"/",
		validate(
			"json",
			supplierFields.partial({
				contactName: true,
				phone: true,
				email: true,
				paymentTerms: true,
				leadTimeDays: true,
				notes: true,
			}),
		),
		async (c) => {
			const db = getDb();
			const { phone, ...fields } = c.req.valid("json");
			const normalized = await phoneE164(phone);
			const [taken] = await db
				.select({ taken: sql<number>`${nameTaken(fields.name, null)}` })
				.from(suppliers)
				.limit(1);
			if (taken?.taken) return c.json({ error: "duplicate_name" }, 409);
			const values = {
				...fields,
				phoneE164: normalized,
				searchKey: searchKey(fields.name, fields.contactName),
			};
			const supplierId = sql<number>`(select id from suppliers where name = ${fields.name})`;
			// Inserted only while no supplier has the name in any case; the audit row follows
			// only when that insert wrote a row (changes() of the statement before it).
			const [rows] = await db.batch([
				insertIfExists(
					db,
					suppliers,
					values,
					sql`(select 1 where not ${nameTaken(fields.name, null)})`,
				).returning(),
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						action: "supplier.create",
						entityType: "supplier",
						entityId: supplierId,
						data: values,
					},
					sql`(select 1 where changes() = 1)`,
				),
			]);
			const [row] = rows;
			if (!row) return c.json({ error: "duplicate_name" }, 409);
			return c.json(withoutSearchKey(row), 201);
		},
	)
	// An archived supplier's open purchase orders can still be received or cancelled.
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			supplierFields
				.extend({ status: z.enum(ARCHIVABLE_STATUSES) })
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { phone, ...fields } = c.req.valid("json");
			const stored = await db.query.suppliers.findFirst({
				where: eq(suppliers.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const normalized = await phoneE164(phone);
			const renaming = fields.name !== undefined && fields.name !== stored.name;
			if (renaming) {
				const [taken] = await db
					.select({
						taken: sql<number>`${nameTaken(fields.name as string, id)}`,
					})
					.from(suppliers)
					.limit(1);
				if (!taken) throw new Error(`Supplier ${id} missing`);
				if (taken.taken) return c.json({ error: "duplicate_name" }, 409);
			}
			const patch = {
				...fields,
				...(phone === undefined ? {} : { phoneE164: normalized }),
				...(fields.name !== undefined || fields.contactName !== undefined
					? {
							searchKey: searchKey(
								fields.name ?? stored.name,
								fields.contactName === undefined
									? stored.contactName
									: fields.contactName,
							),
						}
					: {}),
			};
			const target = and(
				eq(suppliers.id, id),
				renaming ? sql`not ${nameTaken(fields.name as string, id)}` : undefined,
			);
			const [, rows] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("supplier", id, stored.status, fields.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: suppliers.id }).from(suppliers).where(target),
				),
				db
					.update(suppliers)
					.set({ ...patch, updatedAt: now })
					.where(target)
					.returning(),
			]);
			const [row] = rows;
			if (!row) return c.json({ error: "duplicate_name" }, 409);
			return c.json(withoutSearchKey(row));
		},
	);
