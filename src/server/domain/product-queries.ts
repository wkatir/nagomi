import { and, count, eq, max, min, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/lib/enums";
import type { ProductListSearch } from "#/lib/schemas/products";
import { qualified } from "./d1";
import { mediaUrl } from "./images";
import { holdsStock, type StockClock } from "./inventory";
import { pageWindow, sortBy, toPaged } from "./list-query";
import { productSearch } from "./product-search";

const {
	brands,
	categories,
	categoryTranslations,
	inventoryMovements,
	lots,
	orderItems,
	orders,
	productTranslations,
	products,
	variants,
} = schema;

type ProductFilter = Pick<
	ProductListSearch,
	"q" | "status" | "brandId" | "categoryId"
>;

// For a query that joins the products to their brand and to their default-locale text
// (productSearch).
export const productFilter = (db: Db, filter: ProductFilter) =>
	and(
		filter.status ? eq(products.status, filter.status) : undefined,
		filter.brandId ? eq(products.brandId, filter.brandId) : undefined,
		filter.categoryId ? eq(products.categoryId, filter.categoryId) : undefined,
		filter.q ? productSearch(db, filter.q) : undefined,
	);

export async function pagedProducts(
	db: Db,
	clock: StockClock & { defaultLocale: Locale },
	query: ProductListSearch,
) {
	// The sellable units of stock.ts, in SQL.
	const sizes = db
		.select({
			productId: variants.productId,
			total: count().as("size_total"),
			priceFrom: min(variants.price).as("price_from"),
			priceTo: max(variants.price).as("price_to"),
		})
		.from(variants)
		.where(eq(variants.status, "active"))
		.groupBy(variants.productId)
		.as("sizes");
	const onHand = db
		.select({
			variantId: lots.variantId,
			units: sql<number>`sum(${inventoryMovements.quantity})`.as(
				"on_hand_units",
			),
		})
		.from(lots)
		.innerJoin(inventoryMovements, eq(inventoryMovements.lotId, lots.id))
		.groupBy(lots.variantId)
		.as("on_hand");
	const held = db
		.select({
			variantId: orderItems.variantId,
			units: sql<number>`sum(${orderItems.quantity})`.as("held_units"),
		})
		.from(orderItems)
		.innerJoin(orders, eq(orders.id, orderItems.orderId))
		.where(holdsStock(clock.holdStart))
		.groupBy(orderItems.variantId)
		.as("held");
	const sellable = db
		.select({
			productId: variants.productId,
			units:
				sql<number>`sum(max(0, coalesce(${onHand.units}, 0) - coalesce(${held.units}, 0)))`.as(
					"sellable_units",
				),
		})
		.from(variants)
		.leftJoin(onHand, eq(onHand.variantId, variants.id))
		.leftJoin(held, eq(held.variantId, variants.id))
		.where(eq(variants.status, "active"))
		.groupBy(variants.productId)
		.as("sellable");

	const name = sql<string>`coalesce(${productTranslations.name}, ${products.slug})`;
	const stock = sql<number>`coalesce(${sellable.units}, 0)`;
	const sortColumns = {
		name: sql`coalesce(${productTranslations.searchKey}, ${products.slug})`,
		brand: brands.searchKey,
		status: products.status,
		createdAt: products.createdAt,
		priceFrom: sizes.priceFrom,
		stock,
	};
	const where = productFilter(db, query);
	const defaultText = and(
		eq(productTranslations.productId, products.id),
		eq(productTranslations.locale, clock.defaultLocale),
	);

	const [rows, [counted]] = await db.batch([
		db
			.select({
				id: products.id,
				slug: products.slug,
				status: products.status,
				createdAt: products.createdAt,
				name: name.as("product_name"),
				brand: sql<string>`${brands.name}`.as("brand_name"),
				category:
					sql<string>`coalesce(${categoryTranslations.name}, ${categories.slug})`.as(
						"category_name",
					),
				variantCount: sql<number>`coalesce(${sizes.total}, 0)`.as(
					"variant_count",
				),
				priceFrom: sizes.priceFrom,
				priceTo: sizes.priceTo,
				stock: stock.as("stock_units"),
				photoKey: sql<
					string | null
				>`(select mf.r2_key from product_images pi join media_files mf on mf.id = pi.media_file_id where pi.product_id = ${qualified(products.id)} and pi.status = 'active' order by pi.position, pi.id limit 1)`.as(
					"photo_key",
				),
			})
			.from(products)
			.innerJoin(brands, eq(brands.id, products.brandId))
			.innerJoin(categories, eq(categories.id, products.categoryId))
			.leftJoin(productTranslations, defaultText)
			.leftJoin(
				categoryTranslations,
				and(
					eq(categoryTranslations.categoryId, categories.id),
					eq(categoryTranslations.locale, clock.defaultLocale),
				),
			)
			.leftJoin(sizes, eq(sizes.productId, products.id))
			.leftJoin(sellable, eq(sellable.productId, products.id))
			.where(where)
			.orderBy(...sortBy(sortColumns, query.sort, query.dir, products.id))
			.limit(pageWindow(query).limit)
			.offset(pageWindow(query).offset),
		db
			.select({ total: count() })
			.from(products)
			.innerJoin(brands, eq(brands.id, products.brandId))
			.leftJoin(productTranslations, defaultText)
			.where(where),
	]);
	if (!counted) throw new Error("The products count returned no row");
	return toPaged(
		rows.map(({ photoKey, ...row }) => ({
			...row,
			photoUrl: photoKey === null ? null : mediaUrl(photoKey),
		})),
		counted.total,
		query,
	);
}
