import { asc, desc, type SQL, type SQLWrapper } from "drizzle-orm";
import { type Paged, pageCountOf, type SortDir } from "#/lib/list";

// A page past the end is an empty list with the real total, so a screen can send the user
// to the last page.
export function toPaged<T>(
	items: T[],
	total: number,
	query: { page: number; pageSize: number },
): Paged<T> {
	return {
		items,
		total,
		page: query.page,
		pageSize: query.pageSize,
		pageCount: pageCountOf(total, query.pageSize),
	};
}

export const pageWindow = (query: { page: number; pageSize: number }) => ({
	limit: query.pageSize,
	offset: (query.page - 1) * query.pageSize,
});

// The id tiebreak keeps rows with equal values in one order from page to page.
export function sortBy<K extends string>(
	columns: Record<K, SQLWrapper>,
	sort: K,
	dir: SortDir,
	id: SQLWrapper,
): SQL[] {
	const direction = dir === "asc" ? asc : desc;
	return [direction(columns[sort]), direction(id)];
}
