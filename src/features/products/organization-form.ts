import type { AdminProduct } from "#/lib/api";
import type { SkinType } from "#/lib/enums";

// Ids as the text of a select.
export type OrganizationValues = {
	brandId: string;
	categoryId: string;
	concernIds: string[];
	skinTypes: SkinType[];
};

// The page remounts the card when this changes (see basicsValues).
export const organizationValues = (
	product: AdminProduct,
): OrganizationValues => ({
	brandId: String(product.brandId),
	categoryId: String(product.categoryId),
	concernIds: product.concernIds.map(String),
	skinTypes: [...product.skinTypes],
});

const sameSet = (a: readonly string[], b: readonly string[]) =>
	a.length === b.length && a.every((value) => b.includes(value));

// Only what differs: sending an unchanged brand, category or need would make the API check it
// again and refuse one archived after the product chose it.
export function organizationPatch(
	value: OrganizationValues,
	started: OrganizationValues,
) {
	return {
		...(value.brandId === started.brandId
			? {}
			: { brandId: Number(value.brandId) }),
		...(value.categoryId === started.categoryId
			? {}
			: { categoryId: Number(value.categoryId) }),
		...(sameSet(value.concernIds, started.concernIds)
			? {}
			: { concernIds: value.concernIds.map(Number) }),
		...(sameSet(value.skinTypes, started.skinTypes)
			? {}
			: { skinTypes: value.skinTypes }),
	};
}
