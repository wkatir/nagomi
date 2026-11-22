import { and, eq } from "drizzle-orm";
import { schema } from "#/db";
import type { Locale } from "#/lib/enums";

const { products, productTranslations } = schema;

export const productTextIn = (locale: Locale) =>
	and(
		eq(productTranslations.productId, products.id),
		eq(productTranslations.locale, locale),
	);
