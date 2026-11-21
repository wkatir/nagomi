import { env } from "cloudflare:workers";
import { and, asc, desc, eq, lt, or, sql } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { z } from "zod";
import { type Db, getDb, schema } from "#/db";
import {
	ARCHIVABLE_STATUSES,
	IMAGE_KINDS,
	IMAGE_TYPES,
	type ImageType,
	LOCALES,
	type Locale,
} from "#/db/schema";
import type { AdminEnv } from "#/server/auth";
import { multipartForm } from "#/server/form";
import { idParam, invalidRequest, validate } from "#/server/validate";
import { audit } from "../../domain/audit";
import { statusAudit } from "../../domain/audit-actions";
import { inList } from "../../domain/d1";
import { sha256Hex } from "../../domain/hash";
import {
	type ImageInfo,
	MAX_IMAGE_BYTES,
	mediaKey,
	mediaUrl,
	readImageInfo,
} from "../../domain/images";
import { pageOf } from "../../domain/paging";
import { productPhotoColumns } from "../../domain/product-photos";
import { readSettings } from "../../domain/settings";
import { translationEntries } from "./catalog-inputs";

const {
	collections,
	collectionTranslations,
	homeSlides,
	homeSlideTranslations,
	mediaFiles,
	productImages,
	productImageTranslations,
	productTranslations,
	products,
	variants,
} = schema;

// Allowed a larger body in src/server/app.ts.
export const IMAGE_UPLOAD_PATHS = [
	"/api/admin/product-images",
	"/api/admin/media",
];

type Upload = {
	bytes: Uint8Array<ArrayBuffer>;
	info: ImageInfo;
	sha256: string;
	key: string;
};

async function readUpload(c: Context, file: FormDataEntryValue | null) {
	if (!(file instanceof File) || file.size === 0)
		return { response: c.json({ error: "invalid_image" as const }, 400) };
	if (file.size > MAX_IMAGE_BYTES)
		return {
			response: c.json(
				{ error: "image_too_large" as const, max: MAX_IMAGE_BYTES },
				413,
			),
		};
	if (!IMAGE_TYPES.includes(file.type as ImageType))
		return {
			response: c.json({ error: "unsupported_image_type" as const }, 415),
		};
	const bytes = new Uint8Array(await file.arrayBuffer());
	const info = readImageInfo(bytes);
	if (!info || info.contentType !== file.type)
		return { response: c.json({ error: "invalid_image" as const }, 400) };
	const sha256 = await sha256Hex(bytes);
	const upload: Upload = {
		bytes,
		info,
		sha256,
		key: mediaKey(sha256, info.contentType),
	};
	return { upload };
}

// The same content always has the same key, so an existing object is this file.
async function putInBucket({ bytes, info, sha256, key }: Upload) {
	if (!(await env.MEDIA.head(key)))
		await env.MEDIA.put(key, bytes, {
			httpMetadata: { contentType: info.contentType },
			sha256,
		});
}

const altText = z.string().trim().min(1).max(250);
const uploadFields = z.object({
	productId: z.coerce.number().int().positive(),
	variantId: z.coerce.number().int().positive().optional(),
	kind: z.enum(IMAGE_KINDS),
	alt: z.partialRecord(z.enum(LOCALES), altText),
});

async function imageDetail(db: Db, id: number) {
	const [image] = await db
		.select(productPhotoColumns)
		.from(productImages)
		.innerJoin(mediaFiles, eq(mediaFiles.id, productImages.mediaFileId))
		.where(eq(productImages.id, id));
	if (!image) return null;
	const alts = await db
		.select()
		.from(productImageTranslations)
		.where(eq(productImageTranslations.imageId, id));
	return {
		...image,
		url: mediaUrl(image.r2Key),
		alt: Object.fromEntries(alts.map((a) => [a.locale, a.alt])),
	};
}

async function variantOfProduct(db: Db, variantId: number, productId: number) {
	const variant = await db.query.variants.findFirst({
		where: and(eq(variants.id, variantId), eq(variants.productId, productId)),
	});
	return Boolean(variant);
}

export const mediaRouter = new Hono<AdminEnv>()
	.post("/", async (c) => {
		const db = getDb();
		const form = await multipartForm(c);
		if (form instanceof Response) return form;
		const file = form.get("file");
		const fields = uploadFields.safeParse({
			productId: form.get("productId"),
			variantId: form.get("variantId") || undefined,
			kind: form.get("kind"),
			alt: Object.fromEntries(
				LOCALES.flatMap((l) => {
					const value = form.get(`alt.${l}`);
					return value === null ? [] : [[l, value]];
				}),
			),
		});
		if (!fields.success) return invalidRequest(c, fields.error);
		const read = await readUpload(c, file);
		if ("response" in read) return read.response;
		const { upload } = read;
		const { info, key } = upload;

		const { productId, variantId, kind, alt } = fields.data;
		const { defaultLocale } = await readSettings(db);
		if (!alt[defaultLocale])
			return c.json({ error: "publish_requires_default_translation" }, 409);
		const product = await db.query.products.findFirst({
			where: eq(products.id, productId),
		});
		if (!product) return c.json({ error: "not_found" }, 404);
		if (product.status === "archived")
			return c.json({ error: "invalid_transition" }, 409);
		if (variantId && !(await variantOfProduct(db, variantId, productId)))
			return c.json({ error: "variant_not_in_product" }, 409);

		const known = await db.query.mediaFiles.findFirst({
			where: eq(mediaFiles.r2Key, key),
		});
		const duplicate =
			known &&
			(await db.query.productImages.findFirst({
				where: and(
					eq(productImages.productId, productId),
					eq(productImages.mediaFileId, known.id),
					eq(productImages.status, "active"),
				),
			}));
		if (duplicate) return c.json({ error: "duplicate_image" }, 409);
		await putInBucket(upload);

		// A file seen before (another product's photo, an editorial image) already has its row.
		const fileId = sql<number>`(select id from media_files where r2_key = ${key})`;
		const imageId = sql<number>`(select max(id) from product_images where product_id = ${productId} and media_file_id = ${fileId})`;
		await db.batch([
			db
				.insert(mediaFiles)
				.values({
					r2Key: key,
					contentType: info.contentType,
					byteSize: upload.bytes.byteLength,
					width: info.width,
					height: info.height,
					createdBy: c.var.adminUserId,
				})
				.onConflictDoNothing({ target: mediaFiles.r2Key }),
			db.insert(productImages).values({
				productId,
				variantId: variantId ?? null,
				mediaFileId: fileId,
				kind,
				position: sql<number>`(select coalesce(max(position), 0) + 1 from product_images where product_id = ${productId} and status = 'active')`,
				createdBy: c.var.adminUserId,
			}),
			...translationEntries(alt).map(([locale, text]) =>
				db
					.insert(productImageTranslations)
					.values({ imageId, locale, alt: text }),
			),
			audit(db, {
				actorUserId: c.var.adminUserId,
				action: "product_image.create",
				entityType: "product_image",
				entityId: imageId,
				data: { productId, variantId, kind, key, alt, ...info },
			}),
		]);
		const [created] = await db
			.select({ id: productImages.id })
			.from(productImages)
			.where(
				and(
					eq(productImages.productId, productId),
					eq(productImages.mediaFileId, fileId),
					eq(productImages.status, "active"),
				),
			);
		if (!created) throw new Error(`Image ${key} missing after upload`);
		const detail = await imageDetail(db, created.id);
		if (!detail) throw new Error(`Image ${created.id} missing`);
		return c.json(detail, 201);
	})
	.patch(
		"/:id",
		validate("param", idParam),
		validate(
			"json",
			z
				.object({
					kind: z.enum(IMAGE_KINDS),
					variantId: z.number().int().positive().nullable(),
					status: z.enum(ARCHIVABLE_STATUSES),
					alt: z.partialRecord(z.enum(LOCALES), altText.nullable()),
				})
				.partial()
				.refine((v) => Object.keys(v).length > 0, "Nothing to change"),
		),
		async (c) => {
			const db = getDb();
			const { id } = c.req.valid("param");
			const { alt = {}, ...patch } = c.req.valid("json");
			const stored = await db.query.productImages.findFirst({
				where: eq(productImages.id, id),
			});
			if (!stored) return c.json({ error: "not_found" }, 404);
			const { defaultLocale } = await readSettings(db);
			if (alt[defaultLocale] === null)
				return c.json({ error: "publish_requires_default_translation" }, 409);
			if (
				patch.variantId &&
				!(await variantOfProduct(db, patch.variantId, stored.productId))
			)
				return c.json({ error: "variant_not_in_product" }, 409);
			const reactivating =
				patch.status === "active" && stored.status === "archived";
			if (reactivating && !alt[defaultLocale]) {
				const labelled = await db.query.productImageTranslations.findFirst({
					where: and(
						eq(productImageTranslations.imageId, id),
						eq(productImageTranslations.locale, defaultLocale),
					),
				});
				if (!labelled) return c.json({ error: "image_alt_required" }, 409);
			}
			await db.batch([
				audit(db, {
					actorUserId: c.var.adminUserId,
					...statusAudit("product_image", id, stored.status, patch.status, {
						before: stored,
						patch,
						alt,
					}),
				}),
				...(Object.keys(patch).length > 0
					? [
							db
								.update(productImages)
								.set({
									...patch,
									...(reactivating
										? {
												position: sql<number>`(select coalesce(max(position), 0) + 1 from product_images where product_id = ${stored.productId} and status = 'active')`,
											}
										: {}),
								})
								.where(eq(productImages.id, id)),
						]
					: []),
				...translationEntries(alt).map(
					([locale, text]: [Locale, string | null]) =>
						text === null
							? db
									.delete(productImageTranslations)
									.where(
										and(
											eq(productImageTranslations.imageId, id),
											eq(productImageTranslations.locale, locale),
										),
									)
							: db
									.insert(productImageTranslations)
									.values({ imageId: id, locale, alt: text })
									.onConflictDoUpdate({
										target: [
											productImageTranslations.imageId,
											productImageTranslations.locale,
										],
										set: { alt: text },
									}),
				),
			]);
			const detail = await imageDetail(db, id);
			if (!detail) throw new Error(`Image ${id} missing`);
			return c.json(detail);
		},
	)
	.put(
		"/order",
		validate(
			"json",
			z.object({
				productId: z.number().int().positive(),
				imageIds: z
					.array(z.number().int().positive())
					.min(1)
					.max(50)
					.refine((ids) => new Set(ids).size === ids.length, "Duplicate image"),
			}),
		),
		async (c) => {
			const db = getDb();
			const { productId, imageIds } = c.req.valid("json");
			const active = await db
				.select({ id: productImages.id })
				.from(productImages)
				.where(
					and(
						eq(productImages.productId, productId),
						eq(productImages.status, "active"),
					),
				);
			if (
				active.length !== imageIds.length ||
				active.some((i) => !imageIds.includes(i.id))
			)
				return c.json({ error: "images_changed" }, 409);
			const sameSet = sql`(select count(*) from ${productImages} i where i.product_id = ${productId} and i.status = 'active') = ${imageIds.length} and not exists (select 1 from ${productImages} i where i.product_id = ${productId} and i.status = 'active' and not ${inList(sql`i.id`, imageIds)})`;
			const results = await db.batch([
				audit(
					db,
					{
						actorUserId: c.var.adminUserId,
						action: "product.update",
						entityType: "product",
						entityId: productId,
						data: { imageOrder: imageIds },
					},
					db
						.select({ id: productImages.id })
						.from(productImages)
						.where(and(eq(productImages.productId, productId), sameSet)),
				),
				...imageIds.map((id, index) =>
					db
						.update(productImages)
						.set({ position: index + 1 })
						.where(
							and(
								eq(productImages.id, id),
								eq(productImages.productId, productId),
								eq(productImages.status, "active"),
								sameSet,
							),
						),
				),
			]);
			if (!results[results.length - 1].meta.changes)
				return c.json({ error: "images_changed" }, 409);
			const ordered = await db
				.select({ id: productImages.id, position: productImages.position })
				.from(productImages)
				.where(inList(productImages.id, imageIds))
				.orderBy(asc(productImages.position));
			return c.json(ordered);
		},
	);

const mediaFileView = (row: typeof mediaFiles.$inferSelect) => ({
	...row,
	url: mediaUrl(row.r2Key),
});

// Images that are not product photos (home slides, collection covers).
export const mediaFilesRouter = new Hono<AdminEnv>()
	.get(
		"/",
		validate(
			"query",
			z.object({
				cursor: z.coerce.number().int().positive().optional(),
				limit: z.coerce.number().int().min(1).max(100).default(50),
			}),
		),
		async (c) => {
			const { cursor, limit } = c.req.valid("query");
			const rows = await getDb()
				.select()
				.from(mediaFiles)
				.where(cursor ? lt(mediaFiles.id, cursor) : undefined)
				.orderBy(desc(mediaFiles.id))
				.limit(limit + 1);
			const { page, nextCursor } = pageOf(rows, limit);
			return c.json({ items: page.map(mediaFileView), nextCursor });
		},
	)
	.get("/:id", validate("param", idParam), async (c) => {
		const { id } = c.req.valid("param");
		const row = await getDb().query.mediaFiles.findFirst({
			where: eq(mediaFiles.id, id),
		});
		return row
			? c.json(mediaFileView(row))
			: c.json({ error: "not_found" }, 404);
	})
	.get("/:id/usage", validate("param", idParam), async (c) => {
		const db = getDb();
		const { id } = c.req.valid("param");
		const file = await db.query.mediaFiles.findFirst({
			where: eq(mediaFiles.id, id),
		});
		if (!file) return c.json({ error: "not_found" }, 404);
		const { defaultLocale } = await readSettings(db);
		// Batched selects need unique column names: no two of a query share one.
		const [slides, covers, photos] = await db.batch([
			db
				.select({
					id: homeSlides.id,
					status: homeSlides.status,
					desktopMediaId: homeSlides.desktopMediaId,
					mobileMediaId: homeSlides.mobileMediaId,
					title: homeSlideTranslations.title,
				})
				.from(homeSlides)
				.leftJoin(
					homeSlideTranslations,
					and(
						eq(homeSlideTranslations.slideId, homeSlides.id),
						eq(homeSlideTranslations.locale, defaultLocale),
					),
				)
				.where(
					or(
						eq(homeSlides.desktopMediaId, id),
						eq(homeSlides.mobileMediaId, id),
					),
				)
				.orderBy(asc(homeSlides.id)),
			db
				.select({
					id: collections.id,
					slug: collections.slug,
					status: collections.status,
					title: collectionTranslations.title,
				})
				.from(collections)
				.leftJoin(
					collectionTranslations,
					and(
						eq(collectionTranslations.collectionId, collections.id),
						eq(collectionTranslations.locale, defaultLocale),
					),
				)
				.where(eq(collections.coverMediaId, id))
				.orderBy(asc(collections.id)),
			db
				.select({
					id: productImages.id,
					productId: productImages.productId,
					slug: products.slug,
					status: productImages.status,
					name: productTranslations.name,
				})
				.from(productImages)
				.innerJoin(products, eq(products.id, productImages.productId))
				.leftJoin(
					productTranslations,
					and(
						eq(productTranslations.productId, products.id),
						eq(productTranslations.locale, defaultLocale),
					),
				)
				.where(eq(productImages.mediaFileId, id))
				.orderBy(asc(productImages.id)),
		]);
		return c.json({
			slides: slides.map(({ desktopMediaId, mobileMediaId, ...slide }) => ({
				...slide,
				desktop: desktopMediaId === id,
				mobile: mobileMediaId === id,
			})),
			collections: covers,
			photos,
		});
	})
	.post("/", async (c) => {
		const db = getDb();
		const form = await multipartForm(c);
		if (form instanceof Response) return form;
		const read = await readUpload(c, form.get("file"));
		if ("response" in read) return read.response;
		const { upload } = read;
		const stored = await db.query.mediaFiles.findFirst({
			where: eq(mediaFiles.r2Key, upload.key),
		});
		if (stored) return c.json(mediaFileView(stored), 200);
		await putInBucket(upload);
		const row = {
			r2Key: upload.key,
			contentType: upload.info.contentType,
			byteSize: upload.bytes.byteLength,
			width: upload.info.width,
			height: upload.info.height,
		};
		// Another admin's concurrent upload of the same file wins; this one audits nothing.
		const ours = db
			.select({ id: mediaFiles.id })
			.from(mediaFiles)
			.where(
				and(
					eq(mediaFiles.r2Key, upload.key),
					eq(mediaFiles.createdBy, c.var.adminUserId),
				),
			);
		await db.batch([
			db
				.insert(mediaFiles)
				.values({ ...row, createdBy: c.var.adminUserId })
				.onConflictDoNothing({ target: mediaFiles.r2Key }),
			audit(
				db,
				{
					actorUserId: c.var.adminUserId,
					action: "media_file.create",
					entityType: "media_file",
					entityId: sql<number>`(select id from media_files where r2_key = ${upload.key})`,
					data: row,
				},
				ours,
			),
		]);
		const created = await db.query.mediaFiles.findFirst({
			where: eq(mediaFiles.r2Key, upload.key),
		});
		if (!created) throw new Error(`Media file ${upload.key} missing`);
		return c.json(mediaFileView(created), 201);
	});
