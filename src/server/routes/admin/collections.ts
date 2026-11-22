import { and, asc, eq, ne, type SQL, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import { now, PRODUCT_STATUSES, type ProductStatus } from "#/db/schema";
import { collectionListSearch } from "#/lib/schemas/collections";
import type { AdminEnv } from "#/server/auth";
import { idParam, patchOf, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import {
	collectionOptions,
	pagedCollections,
} from "../../domain/catalog-lists";
import { inList, nonEmpty } from "../../domain/d1";
import { mediaUrl } from "../../domain/images";
import { productTextIn } from "../../domain/product-text";
import { readSettings } from "../../domain/settings";
import { canMoveStatus } from "../../domain/status";
import {
	localeParam,
	optionalText,
	requiredText,
	seoFields,
	slug,
	translationEntries,
	translations,
} from "./catalog-inputs";

const {
	collectionProducts,
	collections,
	collectionTranslations,
	mediaFiles,
	products,
	productTranslations,
} = schema;

const collectionText = z.object({
	title: requiredText(120),
	description: optionalText(2000).optional(),
	coverAlt: optionalText(250).optional(),
	...seoFields,
});
const fullText = (text: z.infer<typeof collectionText>) => ({
	description: null,
	coverAlt: null,
	seoTitle: null,
	seoDescription: null,
	...text,
});
const productIds = z
	.array(z.number().int().positive())
	.max(200)
	.refine((ids) => new Set(ids).size === ids.length, "Duplicate product");
const collectionFields = z.object({
	slug,
	position: z.number().int().min(0).max(1000),
	showOnHome: z.boolean(),
	coverMediaId: z.number().int().positive().nullable(),
});

const mediaView = (file: typeof mediaFiles.$inferSelect | undefined) =>
	file ? { ...file, url: mediaUrl(file.r2Key) } : null;

async function collectionDetails(db: Db, ids: number[]) {
	if (ids.length === 0) return [];
	const { defaultLocale } = await readSettings(db);
	// Batched selects need unique column names (see loadCatalog): covers are read apart.
	const [rows, covers, texts, items] = await db.batch([
		db
			.select()
			.from(collections)
			.where(inList(collections.id, ids))
			.orderBy(asc(collections.position), asc(collections.id)),
		db
			.select()
			.from(mediaFiles)
			.where(
				sql`${mediaFiles.id} in (select cover_media_id from ${collections} where ${inList(sql`id`, ids)})`,
			),
		db
			.select()
			.from(collectionTranslations)
			.where(inList(collectionTranslations.collectionId, ids)),
		db
			.select({
				collectionId: collectionProducts.collectionId,
				productId: collectionProducts.productId,
				position: collectionProducts.position,
				slug: products.slug,
				status: products.status,
				name: productTranslations.name,
			})
			.from(collectionProducts)
			.innerJoin(products, eq(products.id, collectionProducts.productId))
			.leftJoin(productTranslations, productTextIn(defaultLocale))
			.where(inList(collectionProducts.collectionId, ids))
			.orderBy(asc(collectionProducts.position)),
	]);
	return rows.map((collection) => ({
		...collection,
		cover: mediaView(covers.find((m) => m.id === collection.coverMediaId)),
		translations: texts.filter((t) => t.collectionId === collection.id),
		products: items
			.filter((i) => i.collectionId === collection.id)
			.map(({ collectionId: _, ...item }) => item),
	}));
}

const mediaExists = async (db: Db, id: number | null | undefined) =>
	id == null ||
	Boolean(
		await db.query.mediaFiles.findFirst({ where: eq(mediaFiles.id, id) }),
	);

async function productsAvailable(db: Db, ids: number[]) {
	if (ids.length === 0) return true;
	const found = await db
		.select({ id: products.id })
		.from(products)
		.where(and(inList(products.id, ids), ne(products.status, "archived")));
	return found.length === ids.length;
}

const productStatements = (
	db: Db,
	collectionId: number | SQL<number>,
	ids: number[],
) =>
	ids.map((productId, index) =>
		db
			.insert(collectionProducts)
			.values({ collectionId, productId, position: index + 1 }),
	);

export const collectionsRouter = new Hono<AdminEnv>()
	.get("/", validate("query", collectionListSearch), async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(
			await pagedCollections(db, defaultLocale, c.req.valid("query")),
		);
	})
	.get("/options", async (c) => {
		const db = getDb();
		const { defaultLocale } = await readSettings(db);
		return c.json(await collectionOptions(db, defaultLocale));
	})
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const [collection] = await collectionDetails(getDb(), [id]);
		return collection
			? c.json(collection)
			: c.json({ error: "not_found" }, 404);
	})
	.post(
		"/",
		validate(
			"json",
			collectionFields
				.partial({ position: true, showOnHome: true, coverMediaId: true })
				.extend({
					translations: translations(collectionText),
					productIds: productIds.default([]),
				}),
		),
		async (c) => {
			const db = getDb();
			const {
				translations: texts,
				productIds: ids,
				...fields
			} = c.req.valid("json");
			const { defaultLocale } = await readSettings(db);
			if (!texts[defaultLocale])
				return c.json({ error: "publish_requires_default_translation" }, 409);
			const [taken, cover, available] = await Promise.all([
				db.query.collections.findFirst({
					where: eq(collections.slug, fields.slug),
				}),
				mediaExists(db, fields.coverMediaId),
				productsAvailable(db, ids),
			]);
			if (taken) return c.json({ error: "duplicate_slug" }, 409);
			if (!cover || !available)
				return c.json({ error: "reference_unavailable" }, 409);
			const collectionId = sql<number>`(select id from collections where slug = ${fields.slug})`;
			await db.batch([
				db.insert(collections).values({ ...fields, status: "draft" }),
				...translationEntries(texts).map(([locale, text]) =>
					db
						.insert(collectionTranslations)
						.values({ collectionId, locale, ...fullText(text) }),
				),
				...productStatements(db, collectionId, ids),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "collection.create",
					entityType: "collection",
					entityId: collectionId,
					data: { ...fields, translations: texts, productIds: ids },
				}),
			]);
			const created = await db.query.collections.findFirst({
				where: eq(collections.slug, fields.slug),
			});
			if (!created) throw new Error(`Collection ${fields.slug} missing`);
			const [collection] = await collectionDetails(db, [created.id]);
			return c.json(collection, 201);
		},
	)
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			patchOf(collectionFields.extend({ status: z.enum(PRODUCT_STATUSES) })),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const patch = c.req.valid("json");
			const stored = await db.query.collections.findFirst({
				where: eq(collections.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			if (patch.slug && patch.slug !== stored.slug) {
				if (stored.status === "published")
					return c.json({ error: "slug_locked" }, 409);
				const taken = await db.query.collections.findFirst({
					where: eq(collections.slug, patch.slug),
				});
				if (taken) return c.json({ error: "duplicate_slug" }, 409);
			}
			if (!(await mediaExists(db, patch.coverMediaId)))
				return c.json({ error: "reference_unavailable" }, 409);
			const moving =
				patch.status !== undefined && patch.status !== stored.status;
			if (
				moving &&
				!canMoveStatus(stored.status, patch.status as ProductStatus)
			)
				return c.json({ error: "invalid_transition" }, 409);
			const publishing = moving && patch.status === "published";
			const { defaultLocale } = await readSettings(db);
			// Checked again inside the batch against a concurrent change.
			const ready = sql`exists (select 1 from ${collectionTranslations} t where t.collection_id = ${id} and t.locale = ${defaultLocale}) and exists (select 1 from ${collectionProducts} cp where cp.collection_id = ${id})`;
			if (publishing) {
				const [state] = await db
					.select({
						translated: sql<number>`(select count(*) from ${collectionTranslations} t where t.collection_id = ${id} and t.locale = ${defaultLocale})`,
						items: sql<number>`(select count(*) from ${collectionProducts} cp where cp.collection_id = ${id})`,
					})
					.from(collections)
					.where(eq(collections.id, id));
				if (!state) throw new Error(`Collection ${id} missing`);
				if (!state.translated)
					return c.json({ error: "publish_requires_default_translation" }, 409);
				if (!state.items)
					return c.json({ error: "collection_requires_products" }, 409);
			}
			// Applies only while the collection is in the status that was read.
			const unchanged = and(
				eq(collections.id, id),
				eq(collections.status, stored.status),
				publishing ? ready : undefined,
			);
			const [, [row]] = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						...statusAudit("collection", id, stored.status, patch.status, {
							before: stored,
							patch,
						}),
					},
					db.select({ id: collections.id }).from(collections).where(unchanged),
				),
				db
					.update(collections)
					.set({ ...patch, updatedAt: now })
					.where(unchanged)
					.returning(),
			]);
			if (!row) return c.json({ error: "invalid_transition" }, 409);
			const [collection] = await collectionDetails(db, [id]);
			return c.json(collection);
		},
	)
	.put(
		"/:id/translations/:locale",
		validate("param", localeParam),
		validate("json", collectionText),
		async (c) => {
			const db = getDb();
			const { id, locale } = c.req.valid("param");
			const text = fullText(c.req.valid("json"));
			const collection = await db.query.collections.findFirst({
				where: eq(collections.id, id),
			});
			if (!collection) return c.json({ error: "not_found" }, 404);
			const [[row]] = await db.batch([
				db
					.insert(collectionTranslations)
					.values({ collectionId: id, locale, ...text })
					.onConflictDoUpdate({
						target: [
							collectionTranslations.collectionId,
							collectionTranslations.locale,
						],
						set: text,
					})
					.returning(),
				db
					.update(collections)
					.set({ updatedAt: now })
					.where(eq(collections.id, id)),
				audit(db, {
					actorUserId: c.var.adminUserId,
					action: "collection.update",
					entityType: "collection",
					entityId: id,
					data: { translation: locale, ...text },
				}),
			]);
			return c.json(row);
		},
	)
	.put(
		"/:id/products",
		validate("param", idParam),
		validate("json", z.object({ productIds })),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { productIds: ids } = c.req.valid("json");
			const collection = await db.query.collections.findFirst({
				where: eq(collections.id, id),
			});
			if (!collection) return c.json({ error: "not_found" }, 404);
			if (collection.status === "published" && ids.length === 0)
				return c.json({ error: "collection_requires_products" }, 409);
			if (!(await productsAvailable(db, ids)))
				return c.json({ error: "reference_unavailable" }, 409);
			// Keeps the emptiness check above true inside the batch.
			const asRead = and(
				eq(collections.id, id),
				eq(collections.status, collection.status),
			);
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						action: "collection.update",
						entityType: "collection",
						entityId: id,
						data: { productIds: ids },
					},
					db.select({ id: collections.id }).from(collections).where(asRead),
				),
				db
					.delete(collectionProducts)
					.where(
						and(
							eq(collectionProducts.collectionId, id),
							sql`exists ${db.select({ id: collections.id }).from(collections).where(asRead)}`,
						),
					),
				...productStatements(db, id, ids),
				db
					.update(collections)
					.set({ updatedAt: now })
					.where(asRead)
					.returning({ id: collections.id }),
			]);
			if ((results.at(-1) as { id: number }[]).length === 0)
				return c.json({ error: "invalid_transition" }, 409);
			const [updated] = await collectionDetails(db, [id]);
			return c.json(updated);
		},
	)
	.put(
		"/order",
		validate(
			"json",
			z.object({
				collectionIds: z
					.array(z.number().int().positive())
					.min(1)
					.max(200)
					.refine((ids) => new Set(ids).size === ids.length, "Duplicate"),
			}),
		),
		async (c) => {
			const db = getDb();
			const { collectionIds: ids } = c.req.valid("json");
			const current = await db
				.select({ id: collections.id })
				.from(collections)
				.where(ne(collections.status, "archived"));
			if (
				current.length !== ids.length ||
				current.some((x) => !ids.includes(x.id))
			)
				return c.json({ error: "collections_changed" }, 409);
			const sameSet = sql`(select count(*) from ${collections} x where x.status <> 'archived') = ${ids.length} and not exists (select 1 from ${collections} x where x.status <> 'archived' and not ${inList(sql`x.id`, ids)})`;
			const results = await db.batch(
				nonEmpty(
					ids.flatMap((collectionId, index) => {
						const target = and(eq(collections.id, collectionId), sameSet);
						return [
							audit(
								db,
								{
									actorUserId: c.var.adminUserId,
									action: "collection.update",
									entityType: "collection",
									entityId: collectionId,
									data: { position: index, order: ids },
								},
								db
									.select({ id: collections.id })
									.from(collections)
									.where(target),
							),
							db.update(collections).set({ position: index }).where(target),
						];
					}),
				),
			);
			if (!results[results.length - 1].meta.changes)
				return c.json({ error: "collections_changed" }, 409);
			return c.json(
				await db
					.select({ id: collections.id, position: collections.position })
					.from(collections)
					.where(inList(collections.id, ids))
					.orderBy(asc(collections.position)),
			);
		},
	);
