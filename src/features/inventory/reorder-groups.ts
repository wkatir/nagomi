import type { Suggestion } from "./queries";

// Groups follow the report's priority order: the supplier with the most urgent size first.
export function groupSuggestions(suggestions: Suggestion[]) {
	const groups = new Map<
		number | null,
		{ supplier: NonNullable<Suggestion["supplier"]> | null; rows: Suggestion[] }
	>();
	for (const row of suggestions) {
		if (row.orderQuantity === 0) continue;
		const key = row.supplier?.supplierId ?? null;
		const group = groups.get(key) ?? { supplier: row.supplier, rows: [] };
		group.rows.push(row);
		groups.set(key, group);
	}
	const unassigned = groups.get(null);
	groups.delete(null);
	return [...groups.values(), ...(unassigned ? [unassigned] : [])];
}
