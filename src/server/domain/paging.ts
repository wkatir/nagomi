// `rows` is read with `limit + 1`: the extra row only tells that a next page exists.
export function pageOf<T extends { id: number }>(rows: T[], limit: number) {
	const page = rows.slice(0, limit);
	if (rows.length <= limit) return { page, nextCursor: null };
	const last = page.at(-1);
	if (!last)
		throw new Error(`pageOf needs a limit of at least 1, got ${limit}`);
	return { page, nextCursor: last.id };
}
