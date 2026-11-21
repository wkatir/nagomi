import { and, desc, eq, lt, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { MOVEMENT_REASONS } from "#/db/schema";
import { storeToday } from "#/lib/dates";
import type { Feed } from "#/lib/list";
import {
	lotListSearch,
	type MovementFilters,
	movementFilters,
	stockListSearch,
} from "#/lib/schemas/inventory";
import type { AdminEnv } from "#/server/auth";
import { validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { nextId, withinLocalDays } from "../../domain/d1";
import { formatExpiry } from "../../domain/expiry";
import { lotStock } from "../../domain/inventory";
import {
	pagedLots,
	pagedStock,
	stockSummary,
} from "../../domain/inventory-queries";
import { pageOf } from "../../domain/paging";
import { e4ToMinor } from "../../domain/receiving";
import { getSettings, type StoreSettings } from "../../domain/settings";

const {
	brands,
	inventoryMovements,
	lots,
	products,
	productTranslations,
	users,
	variants,
} = schema;

const movementsQuery = z
	.object({
		cursor: z.coerce.number().int().positive().optional(),
		limit: z.coerce.number().int().min(1).max(200).default(100),
	})
	.and(movementFilters);

const orderCode = sql<
	string | null
>`(select o.code from orders o where o.id = coalesce((select oi.order_id from order_items oi where oi.id = ${inventoryMovements.orderItemId}), (select r.order_id from return_lines rl join returns r on r.id = rl.return_id where rl.id = ${inventoryMovements.returnLineId})))`;

export async function listMovements(
	db: Db,
	settings: Pick<StoreSettings, "timeZone" | "defaultLocale">,
	filters: MovementFilters,
	cursor: number | null,
	limit: number,
) {
	const rows = await db
		.select({
			id: inventoryMovements.id,
			createdAt: inventoryMovements.createdAt,
			kind: inventoryMovements.kind,
			quantity: inventoryMovements.quantity,
			reason: inventoryMovements.reason,
			note: inventoryMovements.note,
			lotId: lots.id,
			lotCode: lots.code,
			expiresOn: lots.expiresOn,
			expiryPrecision: lots.expiryPrecision,
			unitCostE4: lots.unitCostE4,
			variantId: variants.id,
			sku: variants.sku,
			brand: brands.name,
			name: productTranslations.name,
			sizeValue: variants.sizeValue,
			sizeUnit: variants.sizeUnit,
			orderItemId: inventoryMovements.orderItemId,
			returnLineId: inventoryMovements.returnLineId,
			orderCode,
			createdBy: inventoryMovements.createdBy,
			createdByName: users.name,
		})
		.from(inventoryMovements)
		.innerJoin(lots, eq(lots.id, inventoryMovements.lotId))
		.innerJoin(variants, eq(variants.id, lots.variantId))
		.innerJoin(products, eq(products.id, variants.productId))
		.innerJoin(brands, eq(brands.id, products.brandId))
		.leftJoin(
			productTranslations,
			and(
				eq(productTranslations.productId, products.id),
				eq(productTranslations.locale, settings.defaultLocale),
			),
		)
		.leftJoin(users, eq(users.id, inventoryMovements.createdBy))
		.where(
			and(
				filters.kind ? eq(inventoryMovements.kind, filters.kind) : undefined,
				filters.reason
					? eq(inventoryMovements.reason, filters.reason)
					: undefined,
				filters.sku ? eq(variants.sku, filters.sku) : undefined,
				filters.lotId ? eq(lots.id, filters.lotId) : undefined,
				withinLocalDays(
					inventoryMovements.createdAt,
					filters,
					settings.timeZone,
				),
				cursor === null ? undefined : lt(inventoryMovements.id, cursor),
			),
		)
		.orderBy(desc(inventoryMovements.id))
		.limit(limit + 1);
	const { page, nextCursor } = pageOf(rows, limit);
	return {
		items: page.map(({ unitCostE4, expiryPrecision, ...m }) => ({
			...m,
			expiry: formatExpiry(m.expiresOn, expiryPrecision),
			unitCost: e4ToMinor(unitCostE4),
			value: e4ToMinor(m.quantity * unitCostE4),
		})),
		nextCursor,
	} satisfies Feed<unknown>;
}

const adjustInput = z
	.object({
		lotId: z.number().int().positive(),
		kind: z.enum(["adjustment", "waste"]),
		quantity: z
			.number()
			.int()
			.min(-100_000)
			.max(100_000)
			.refine((n) => n !== 0, "Quantity cannot be zero"),
		reason: z.enum(MOVEMENT_REASONS).exclude(["customer_return"]),
		note: z.string().trim().min(1).max(200).optional(),
	})
	.refine((a) => a.kind !== "waste" || a.quantity < 0, {
		message: "Waste must be negative",
		path: ["quantity"],
	})
	.refine((a) => a.reason !== "other" || a.note !== undefined, {
		message: "Explain 'other' in the note",
		path: ["note"],
	});

async function stockClock(db: Db) {
	const { timeZone, expiryWarningDays, defaultLocale } = await getSettings(db);
	return {
		today: storeToday(timeZone),
		expiryWarningDays,
		locale: defaultLocale,
	};
}

export const inventoryRouter = new Hono<AdminEnv>()
	.get("/", validate("query", stockListSearch), async (c) => {
		const db = getDb();
		return c.json(
			await pagedStock(db, await stockClock(db), c.req.valid("query")),
		);
	})
	.get("/summary", async (c) => {
		const db = getDb();
		return c.json(await stockSummary(db, await stockClock(db)));
	})
	.get("/lots", validate("query", lotListSearch), async (c) => {
		const db = getDb();
		return c.json(
			await pagedLots(db, await stockClock(db), c.req.valid("query")),
		);
	})
	.get("/movements", validate("query", movementsQuery), async (c) => {
		const db = getDb();
		const { cursor, limit, ...filters } = c.req.valid("query");
		return c.json(
			await listMovements(
				db,
				await getSettings(db),
				filters,
				cursor ?? null,
				limit,
			),
		);
	})
	// The lot balance trigger is the real guard: a concurrent change that took the units
	// first ends in 409 stock_changed.
	.post("/adjustments", validate("json", adjustInput), async (c) => {
		const db = getDb();
		const input = c.req.valid("json");
		const actor = c.var.adminUserId;
		const [lot] = await lotStock(db, eq(lots.id, input.lotId));
		if (!lot) return c.json({ error: "not_found" }, 404);
		if (lot.available + input.quantity < 0)
			return c.json(
				{ error: "insufficient_stock", available: lot.available },
				409,
			);
		// The audit row goes first: the movement gets the next id.
		await db.batch([
			audit(db, {
				actorUserId: actor,
				action: "inventory_movement.create",
				entityType: "inventory_movement",
				entityId: nextId(inventoryMovements),
				data: {
					lotId: input.lotId,
					kind: input.kind,
					quantity: input.quantity,
					reason: input.reason,
				},
			}),
			db.insert(inventoryMovements).values({
				lotId: input.lotId,
				kind: input.kind,
				quantity: input.quantity,
				reason: input.reason,
				note: input.note ?? null,
				createdBy: actor,
			}),
		]);
		return c.json({ ok: true }, 201);
	});
