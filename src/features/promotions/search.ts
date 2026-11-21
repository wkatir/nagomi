import {
	type PromotionListSearch,
	promotionListSearch,
} from "#/lib/schemas/promotions";

export const promotionSearchDefaults = promotionListSearch.parse({});

export const clearedFilters = {
	page: 1,
	q: undefined,
	status: undefined,
} satisfies Partial<PromotionListSearch>;

export const isFiltered = (search: PromotionListSearch) =>
	Boolean(search.q || search.status);
