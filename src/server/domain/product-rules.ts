import { eq, type SQLWrapper, sql } from "drizzle-orm";
import type { Db } from "#/db";
import { schema } from "#/db";
import type { Locale } from "#/lib/enums";
import {
	PUBLISH_REQUIREMENTS,
	type PublishRequirement,
} from "#/lib/schemas/products";
import { qualified } from "./d1";

const { products } = schema;

export const photoWithoutAlt = (
	productId: number | SQLWrapper,
	locale: Locale,
) =>
	sql`exists (select 1 from product_images i where i.product_id = ${productId} and i.status = 'active' and not exists (select 1 from product_image_translations t where t.image_id = i.id and t.locale = ${locale}))`;

// The database enforces the price (a trigger), the API the rest.
export async function publishMissing(
	db: Db,
	productId: number,
	defaultLocale: Locale,
): Promise<PublishRequirement[]> {
	const [row] = await db
		.select({
			text: sql<boolean>`exists (select 1 from product_translations t where t.product_id = ${qualified(products.id)} and t.locale = ${defaultLocale})`.mapWith(
				Boolean,
			),
			price:
				sql<boolean>`exists (select 1 from variants v where v.product_id = ${qualified(products.id)} and v.status = 'active' and v.price is not null)`.mapWith(
					Boolean,
				),
			photo_alt:
				sql<boolean>`not ${photoWithoutAlt(qualified(products.id), defaultLocale)}`.mapWith(
					Boolean,
				),
			brand:
				sql<boolean>`exists (select 1 from brands b where b.id = ${qualified(products.brandId)} and b.status = 'active')`.mapWith(
					Boolean,
				),
			category:
				sql<boolean>`exists (select 1 from categories c where c.id = ${qualified(products.categoryId)} and c.status = 'active')`.mapWith(
					Boolean,
				),
		})
		.from(products)
		.where(eq(products.id, productId));
	if (!row) throw new Error(`Product ${productId} missing`);
	return PUBLISH_REQUIREMENTS.filter((requirement) => !row[requirement]);
}

export const skuIsFree = (
	productId: number | SQLWrapper,
	variantId: number | SQLWrapper,
) =>
	sql`exists (select 1 from products p where p.id = ${productId} and p.status = 'draft') and not exists (select 1 from order_items oi where oi.variant_id = ${variantId}) and not exists (select 1 from purchase_order_items poi where poi.variant_id = ${variantId})`;
