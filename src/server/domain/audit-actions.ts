export const statusAction = (
	entity: string,
	from: string,
	to: string | undefined,
) =>
	to === undefined || to === from
		? `${entity}.update`
		: to === "archived"
			? `${entity}.archive`
			: `${entity}.status`;

export const statusAudit = (
	entity: string,
	entityId: number,
	from: string,
	to: string | undefined,
	data: Record<string, unknown>,
) => ({
	action: statusAction(entity, from, to),
	entityType: entity,
	entityId,
	data: to !== undefined && to !== from ? { ...data, from, to } : data,
});
