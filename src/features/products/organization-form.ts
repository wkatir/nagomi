import type { AdminProduct } from "#/lib/api";

export type OrganizationValues = {
	brandId: string;
	categoryId: string;
};

export const organizationValues = (
	product: AdminProduct,
): OrganizationValues => ({
	brandId: String(product.brandId),
	categoryId: String(product.categoryId),
});

// Only what differs: the API would refuse an unchanged brand or category archived since.
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
