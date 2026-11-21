import { m } from "#/paraglide/messages";

// Feminine in Spanish, as all these entities are ("una marca"); products have their own,
// masculine.
export const archivableStatusLabel = {
	active: m.admin_merch_status_active,
	archived: m.admin_merch_status_archived,
} as const;

export const lifecycleStatusLabel = {
	draft: m.admin_merch_status_draft,
	published: m.admin_merch_status_published,
	archived: m.admin_merch_status_archived,
} as const;

export const lifecycleBadge = {
	draft: "secondary",
	published: "default",
	archived: "outline",
} as const;
