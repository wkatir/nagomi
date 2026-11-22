import { desc, eq, sql } from "drizzle-orm";
import { Hono } from "hono";
import { z } from "zod";
import { getDb, schema } from "#/db";
import { brandListSearch } from "#/lib/schemas/brands";
import { bundleListSearch } from "#/lib/schemas/bundles";
import { categoryListSearch } from "#/lib/schemas/categories";
import { collectionListSearch } from "#/lib/schemas/collections";
import { customerListSearch } from "#/lib/schemas/customers";
import { promotionListSearch } from "#/lib/schemas/promotions";
import { purchaseListSearch } from "#/lib/schemas/purchasing";
import { supplierListSearch } from "#/lib/schemas/suppliers";
import type { AdminEnv } from "#/server/auth";
import { validate } from "#/server/validate";
import {
	pagedBrands,
	pagedBundles,
	pagedCategories,
	pagedCollections,
} from "../../domain/catalog-lists";
import { pagedCustomers } from "../../domain/customer-queries";
import { productSearch } from "../../domain/product-search";
import { pagedPromotions } from "../../domain/promotion-queries";
import { pagedPurchases } from "../../domain/purchase-queries";
import { searchMatch } from "../../domain/search-sql";
import { getSettings } from "../../domain/settings";
import { pagedSuppliers } from "../../domain/supplier-queries";
import { searchHitsFor } from "./areas";

const { brands, customers, orders, productTranslations, products } = schema;

const PER_GROUP = 5;

type Hit = { id: number; label: string; hint: string | null };

// Each group asks the list its module's screen shows, so a record is found by what that
// screen would find it by.
export const searchRouter = new Hono<AdminEnv>().get(
	"/",
	validate("query", z.object({ q: z.string().trim().min(1).max(80) })),
	async (c) => {
		const { q } = c.req.valid("query");
		const db = getDb();
		const { defaultLocale, timeZone } = await getSettings(db);
		// The lists' own page size is the smallest they offer; the box shows fewer.
		const first = <T>(items: T[]) => items.slice(0, PER_GROUP);
		const [
			orderRows,
			productRows,
			customerPage,
			supplierPage,
			purchasePage,
			brandPage,
			categoryPage,
			bundlePage,
			collectionPage,
			promotionPage,
		] = await Promise.all([
			db
				.select({
					id: orders.id,
					code: orders.code,
					customerName: sql<
						string | null
					>`coalesce(${orders.customerName}, ${customers.name})`.as(
						"customer_name",
					),
				})
				.from(orders)
				.leftJoin(customers, eq(customers.id, orders.customerId))
				.where(searchMatch(q, [orders.searchKey, customers.searchKey]))
				.orderBy(desc(orders.createdAt), desc(orders.id))
				.limit(PER_GROUP),
			db
				.select({
					id: products.id,
					name: productTranslations.name,
					brand: brands.name,
				})
				.from(products)
				.innerJoin(brands, eq(brands.id, products.brandId))
				.innerJoin(
					productTranslations,
					sql`${productTranslations.productId} = ${products.id} and ${productTranslations.locale} = ${defaultLocale}`,
				)
				.where(productSearch(db, q))
				.orderBy(productTranslations.name)
				.limit(PER_GROUP),
			pagedCustomers(db, customerListSearch.parse({ q, pageSize: 10 })),
			pagedSuppliers(db, supplierListSearch.parse({ q, pageSize: 10 })),
			pagedPurchases(
				db,
				timeZone,
				purchaseListSearch.parse({ q, pageSize: 10 }),
			),
			pagedBrands(db, brandListSearch.parse({ q, pageSize: 10 })),
			pagedCategories(
				db,
				defaultLocale,
				categoryListSearch.parse({ q, pageSize: 10 }),
			),
			pagedBundles(
				db,
				defaultLocale,
				bundleListSearch.parse({ q, pageSize: 10 }),
			),
			pagedCollections(
				db,
				defaultLocale,
				collectionListSearch.parse({ q, pageSize: 10 }),
			),
			pagedPromotions(db, promotionListSearch.parse({ q, pageSize: 10 })),
		]);
		const hits = {
			orders: orderRows.map(
				(o): Hit => ({ id: o.id, label: o.code, hint: o.customerName }),
			),
			products: productRows.map(
				(p): Hit => ({ id: p.id, label: p.name, hint: p.brand }),
			),
			customers: first(customerPage.items).map(
				(x): Hit => ({
					id: x.id,
					label: x.name ?? x.phoneE164 ?? String(x.id),
					hint: x.name ? (x.phoneE164 ?? x.email) : x.email,
				}),
			),
			suppliers: first(supplierPage.items).map(
				(x): Hit => ({ id: x.id, label: x.name, hint: x.contactName }),
			),
			purchases: first(purchasePage.items).map(
				(x): Hit => ({
					id: x.id,
					label: x.reference ?? `#${x.id}`,
					hint: x.supplier,
				}),
			),
			brands: first(brandPage.items).map(
				(x): Hit => ({ id: x.id, label: x.name, hint: null }),
			),
			categories: first(categoryPage.items).map(
				(x): Hit => ({ id: x.id, label: x.name ?? x.slug, hint: null }),
			),
			bundles: first(bundlePage.items).map(
				(x): Hit => ({ id: x.id, label: x.name ?? x.slug, hint: null }),
			),
			collections: first(collectionPage.items).map(
				(x): Hit => ({ id: x.id, label: x.title ?? x.slug, hint: null }),
			),
			promotions: first(promotionPage.items).map(
				(x): Hit => ({ id: x.id, label: x.code, hint: null }),
			),
		};
		return c.json(searchHitsFor(c.var.staffRole, hits));
	},
);
