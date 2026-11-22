import type { AdminProduct } from "#/lib/api";

// Ids as the text of a select.
export type OrganizationValues = {
	brandId: string;
	categoryId: string;
};

// The page remounts the card when this changes (see basicsValues).
export const organizationValues = (
	product: AdminProduct,
): OrganizationValues => ({
	brandId: String(product.brandId),
	categoryId: String(product.categoryId),
});

// Only what differs: sending an unchanged brand or category would make the API check it
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
	};
}
