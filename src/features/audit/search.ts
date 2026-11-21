import type { AuditListSearch } from "#/lib/schemas/audit";

export const clearedFilters = {
	entityType: undefined,
	actor: undefined,
	verb: undefined,
	from: undefined,
	to: undefined,
} satisfies Partial<AuditListSearch>;

export const isFiltered = (search: AuditListSearch) =>
	Boolean(
		search.entityType ||
			search.actor ||
			search.verb ||
			search.from ||
			search.to,
	);
