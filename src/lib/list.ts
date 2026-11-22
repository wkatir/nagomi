import { z } from "zod";

export const PAGE_SIZES = [10, 25, 50, 100] as const;
export type PageSize = (typeof PAGE_SIZES)[number];
export const DEFAULT_PAGE_SIZE: PageSize = 25;
const SORT_DIRS = ["asc", "desc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];

export type Paged<T> = {
	items: T[];
	total: number;
	page: number;
	pageSize: number;
	pageCount: number;
};

export type Feed<T> = { items: T[]; nextCursor: number | null };

export const pageCountOf = (total: number, pageSize: number) =>
	Math.max(1, Math.ceil(total / pageSize));

const isPageSize = (n: number): n is PageSize =>
	(PAGE_SIZES as readonly number[]).includes(n);

// Values may come as text (the API's query string) or already typed (the router's search).
export const pagedSearch = <const S extends readonly [string, ...string[]]>(
	sorts: S,
	defaults: { sort: S[number]; dir: SortDir },
) =>
	z.object({
		page: z.coerce.number().int().min(1).default(1),
		pageSize: z.coerce
			.number()
			.refine(isPageSize, "Unsupported page size")
			.default(DEFAULT_PAGE_SIZE),
		sort: z.enum(sorts).default(defaults.sort),
		dir: z.enum(SORT_DIRS).default(defaults.dir),
		q: z.string().trim().min(1).max(80).optional(),
	});

export const toQuery = (search: Record<string, string | number | undefined>) =>
	Object.fromEntries(
		Object.entries(search).flatMap(([key, value]) =>
			value === undefined ? [] : [[key, String(value)]],
		),
	);
