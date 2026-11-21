import { AdminDialog } from "#/components/admin/admin-dialog";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { entityText, verbText } from "./labels";
import type { AuditEvent } from "./queries";

// `actorName` is null when the user no longer exists.
export const actorName = (event: AuditEvent) =>
	event.actorName ?? m.admin_audit_actor_unknown();

export const eventTitle = (event: AuditEvent) =>
	`${entityText(event.entityType)} #${event.entityId}`;

export function AuditEventDetails({ event }: { event: AuditEvent }) {
	const formatDate = useStoreDate();
	return (
		<dl className="type-small grid gap-3">
			<div className="grid gap-0.5">
				<dt className="type-meta text-muted-foreground">
					{m.admin_audit_action()}
				</dt>
				<dd>
					{verbText(event.action)}
					<span className="ml-2 type-meta text-muted-foreground">
						{event.action}
					</span>
				</dd>
			</div>
			<div className="grid gap-0.5">
				<dt className="type-meta text-muted-foreground">
					{m.admin_audit_actor()}
				</dt>
				<dd>
					{actorName(event)}
					{event.actorEmail && (
						<span className="ml-2 type-meta text-muted-foreground">
							{event.actorEmail}
						</span>
					)}
				</dd>
			</div>
			<div className="grid gap-0.5">
				<dt className="type-meta text-muted-foreground">
					{m.admin_audit_when()}
				</dt>
				<dd>
					{formatDate(event.createdAt, {
						dateStyle: "long",
						timeStyle: "medium",
					})}
				</dd>
			</div>
			<div className="grid gap-1">
				<dt className="type-meta text-muted-foreground">
					{m.admin_audit_data()}
				</dt>
				<dd>
					{event.data === null ? (
						<span className="text-muted-foreground">
							{m.admin_audit_no_data()}
						</span>
					) : (
						<pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 type-meta">
							{JSON.stringify(event.data, null, 2)}
						</pre>
					)}
				</dd>
			</div>
		</dl>
	);
}

export function AuditEventDialog({
	event,
	onClose,
}: {
	event: AuditEvent;
	onClose: () => void;
}) {
	return (
		<AdminDialog
			title={eventTitle(event)}
			onClose={onClose}
			className="sm:max-w-xl"
		>
			<AuditEventDetails event={event} />
		</AdminDialog>
	);
}
