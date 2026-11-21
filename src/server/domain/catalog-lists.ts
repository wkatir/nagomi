import { and, asc, count, eq, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/lib/enums";
import type { BrandListSearch } from "#/lib/schemas/brands";
import type { CategoryListSearch } from "#/lib/schemas/categories";
import type { CollectionListSearch } from "#/lib/schemas/collections";
import type { ConcernListSearch } from "#/lib/schemas/concerns";
import type { RoutineListSearch } from "#/lib/schemas/routines";
import { qualified } from "./d1";
import { mediaUrl } from "./images";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { foldedText, searchMatch } from "./search-sql";

const {
	brands,
	categories,
	categoryTranslations,
	collectionProducts,
	collections,
	collectionTranslations,
	concernTranslations,
	concerns,
	mediaFiles,
	productConcerns,
	products,
	routineItems,
	routines,
	routineTranslations,
} = schema;

const totalOf = (rows: { total: number }[]) => {
	const [row] = rows;
	if (!row) throw new Error("A count answered no row");
	return row.total;
};

const brandProducts = sql<number>`(select count(*) from ${products} where ${qualified(products.brandId)} = ${qualified(brands.id)} and ${qualified(products.status)} <> 'archived')`;
const categoryProducts = sql<number>`(select count(*) from ${products} where ${qualified(products.categoryId)} = ${qualified(categories.id)} and ${qualified(products.status)} <> 'archived')`;
const concernProducts = sql<number>`(select count(*) from ${productConcerns} pc join ${products} p on p.id = pc.product_id where pc.concern_id = ${qualified(concerns.id)} and p.status <> 'archived')`;

export async function pagedBrands(db: Db, query: BrandListSearch) {
	const where = and(
		query.status ? eq(brands.status, query.status) : undefined,
		query.q ? searchMatch(query.q, [brands.searchKey]) : undefined,
	);
	const sorts = {
		name: foldedText(brands.name),
		country: brands.countryCode,
		products: brandProducts,
		status: brands.status,
	};
	const [items, counted] = await db.batch([
		db
			.select({
				id: brands.id,
				slug: brands.slug,
				name: brands.name,
				countryCode: brands.countryCode,
				status: brands.status,
				products: brandProducts,
			})
			.from(brands)
			.where(where)
			.orderBy(...sortBy(sorts, query.sort, query.dir, brands.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db.select({ total: count() }).from(brands).where(where),
	]);
	return toPaged(items, totalOf(counted), query);
}

export const brandOptions = (db: Db) =>
	db
		.select({ id: brands.id, name: brands.name, status: brands.status })
		.from(brands)
		.orderBy(asc(foldedText(brands.name)), asc(brands.id));

// An archived category may lack the default-language name.
const categoryName = (defaultLocale: Locale) =>
	and(
		eq(categoryTranslations.categoryId, categories.id),
		eq(categoryTranslations.locale, defaultLocale),
	);

export async function pagedCategories(
	db: Db,
	defaultLocale: Locale,
	query: CategoryListSearch,
) {
	const where = and(
		query.status ? eq(categories.status, query.status) : undefined,
		query.q
			? searchMatch(query.q, [
					foldedText(categoryTranslations.name),
					categories.slug,
				])
			: undefined,
	);
	const sorts = {
		name: foldedText(categoryTranslations.name),
		routineStep: categories.routineStep,
		products: categoryProducts,
		status: categories.status,
	};
	const [items, counted] = await db.batch([
		db
			.select({
				id: categories.id,
				slug: categories.slug,
				name: categoryTranslations.name,
				routineStep: categories.routineStep,
				status: categories.status,
				products: categoryProducts,
			})
			.from(categories)
			.leftJoin(categoryTranslations, categoryName(defaultLocale))
			.where(where)
			.orderBy(...sortBy(sorts, query.sort, query.dir, categories.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(categories)
			.leftJoin(categoryTranslations, categoryName(defaultLocale))
			.where(where),
	]);
	return toPaged(items, totalOf(counted), query);
}

// An archived one may lack the default-language name.
export const categoryOptions = (db: Db, defaultLocale: Locale) =>
	db
		.select({
			id: categories.id,
			name: categoryTranslations.name,
			status: categories.status,
		})
		.from(categories)
		.innerJoin(categoryTranslations, categoryName(defaultLocale))
		.orderBy(asc(foldedText(categoryTranslations.name)), asc(categories.id));

const concernName = (defaultLocale: Locale) =>
	and(
		eq(concernTranslations.concernId, concerns.id),
		eq(concernTranslations.locale, defaultLocale),
	);

export async function pagedConcerns(
	db: Db,
	defaultLocale: Locale,
	query: ConcernListSearch,
) {
	const where = and(
		query.status ? eq(concerns.status, query.status) : undefined,
		query.q
			? searchMatch(query.q, [
					foldedText(concernTranslations.name),
					concerns.slug,
				])
			: undefined,
	);
	const sorts = {
		name: foldedText(concernTranslations.name),
		position: concerns.position,
		products: concernProducts,
		status: concerns.status,
	};
	const [items, counted] = await db.batch([
		db
			.select({
				id: concerns.id,
				slug: concerns.slug,
				name: concernTranslations.name,
				position: concerns.position,
				status: concerns.status,
				products: concernProducts,
			})
			.from(concerns)
			.leftJoin(concernTranslations, concernName(defaultLocale))
			.where(where)
			.orderBy(...sortBy(sorts, query.sort, query.dir, concerns.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(concerns)
			.leftJoin(concernTranslations, concernName(defaultLocale))
			.where(where),
	]);
	return toPaged(items, totalOf(counted), query);
}

// An archived one may lack the default-language name.
export const concernOptions = (db: Db, defaultLocale: Locale) =>
	db
		.select({
			id: concerns.id,
			name: concernTranslations.name,
			status: concerns.status,
		})
		.from(concerns)
		.innerJoin(concernTranslations, concernName(defaultLocale))
		.orderBy(asc(foldedText(concernTranslations.name)), asc(concerns.id));

const routineSteps = sql<number>`(select count(*) from ${routineItems} where ${qualified(routineItems.routineId)} = ${qualified(routines.id)})`;
const routineTitle = (defaultLocale: Locale) =>
	and(
		eq(routineTranslations.routineId, routines.id),
		eq(routineTranslations.locale, defaultLocale),
	);

export async function pagedRoutines(
	db: Db,
	defaultLocale: Locale,
	query: RoutineListSearch,
) {
	const where = and(
		query.status ? eq(routines.status, query.status) : undefined,
		query.q
			? searchMatch(query.q, [
					foldedText(routineTranslations.title),
					routines.slug,
				])
			: undefined,
	);
	const sorts = {
		title: foldedText(routineTranslations.title),
		position: routines.position,
		steps: routineSteps,
		featured: routines.isFeatured,
		status: routines.status,
	};
	const [items, counted] = await db.batch([
		db
			.select({
				id: routines.id,
				slug: routines.slug,
				title: routineTranslations.title,
				status: routines.status,
				isFeatured: routines.isFeatured,
				position: routines.position,
				steps: routineSteps,
			})
			.from(routines)
			.leftJoin(routineTranslations, routineTitle(defaultLocale))
			.where(where)
			.orderBy(...sortBy(sorts, query.sort, query.dir, routines.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(routines)
			.leftJoin(routineTranslations, routineTitle(defaultLocale))
			.where(where),
	]);
	return toPaged(items, totalOf(counted), query);
}

// An archived one may lack the default-language title.
export const routineOptions = (db: Db, defaultLocale: Locale) =>
	db
		.select({
			id: routines.id,
			name: routineTranslations.title,
			status: routines.status,
		})
		.from(routines)
		.innerJoin(routineTranslations, routineTitle(defaultLocale))
		.orderBy(asc(foldedText(routineTranslations.title)), asc(routines.id));

const collectionCount = sql<number>`(select count(*) from ${collectionProducts} where ${qualified(collectionProducts.collectionId)} = ${qualified(collections.id)})`;
const collectionTitle = (defaultLocale: Locale) =>
	and(
		eq(collectionTranslations.collectionId, collections.id),
		eq(collectionTranslations.locale, defaultLocale),
	);

export async function pagedCollections(
	db: Db,
	defaultLocale: Locale,
	query: CollectionListSearch,
) {
	const where = and(
		query.status ? eq(collections.status, query.status) : undefined,
		query.q
			? searchMatch(query.q, [
					foldedText(collectionTranslations.title),
					collections.slug,
				])
			: undefined,
	);
	const sorts = {
		title: foldedText(collectionTranslations.title),
		position: collections.position,
		products: collectionCount,
		home: collections.showOnHome,
		status: collections.status,
	};
	const [rows, counted] = await db.batch([
		db
			.select({
				id: collections.id,
				slug: collections.slug,
				title: collectionTranslations.title,
				status: collections.status,
				position: collections.position,
				showOnHome: collections.showOnHome,
				products: collectionCount,
				coverKey: mediaFiles.r2Key,
			})
			.from(collections)
			.leftJoin(collectionTranslations, collectionTitle(defaultLocale))
			.leftJoin(mediaFiles, eq(mediaFiles.id, collections.coverMediaId))
			.where(where)
			.orderBy(...sortBy(sorts, query.sort, query.dir, collections.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(collections)
			.leftJoin(collectionTranslations, collectionTitle(defaultLocale))
			.where(where),
	]);
	const items = rows.map(({ coverKey, ...row }) => ({
		...row,
		cover: coverKey === null ? null : mediaUrl(coverKey),
	}));
	return toPaged(items, totalOf(counted), query);
}

// An archived one may lack the default-language title.
export const collectionOptions = (db: Db, defaultLocale: Locale) =>
	db
		.select({
			id: collections.id,
			name: collectionTranslations.title,
			status: collections.status,
		})
		.from(collections)
		.innerJoin(collectionTranslations, collectionTitle(defaultLocale))
		.orderBy(
			asc(foldedText(collectionTranslations.title)),
			asc(collections.id),
		);
