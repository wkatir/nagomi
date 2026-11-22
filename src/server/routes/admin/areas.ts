import { canRead, type StaffArea, type StaffRole } from "#/lib/roles";

export const ADMIN_AREAS = {
	"/dashboard": "dashboard",
	"/products": "catalog",
	"/product-images": "catalog",
	"/media": "catalog",
	"/brands": "catalog",
	"/categories": "catalog",
	"/bundles": "catalog",
	"/collections": "merchandising",
	"/home-slides": "merchandising",
	"/promotions": "merchandising",
	"/orders": "orders",
	"/followups": "orders",
	"/customers": "customers",
	"/shipping-zones": "shipping",
	"/inventory": "inventory",
	"/suppliers": "purchasing",
	"/purchase-orders": "purchasing",
	"/reports": "reports",
	"/exports": "reports",
	"/audit-events": "audit",
	"/settings": "settings",
	"/search": "search",
} as const satisfies Record<string, StaffArea>;

const SEARCH_AREAS: Record<string, StaffArea> = {
	orders: "orders",
	products: "catalog",
	customers: "customers",
	suppliers: "purchasing",
	purchases: "purchasing",
	brands: "catalog",
	categories: "catalog",
	bundles: "catalog",
	collections: "merchandising",
	promotions: "merchandising",
};

export const searchHitsFor = <T extends Record<string, unknown[]>>(
	role: StaffRole | undefined,
	hits: T,
): T =>
	Object.fromEntries(
		Object.entries(hits).map(([group, items]) => {
			const area = SEARCH_AREAS[group];
			if (!area) throw new Error(`Search group ${group} has no staff area`);
			return [group, canRead({ role }, area) ? items : []];
		}),
	) as T;
