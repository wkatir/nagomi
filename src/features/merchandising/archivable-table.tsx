import type { RowData } from "@tanstack/react-table";
import { PlusIcon } from "lucide-react";
import { type ComponentType, useState } from "react";
import type { ListColumns } from "#/components/admin/data-table/use-data-table";
import { Button } from "#/components/ui/button";
import { ARCHIVABLE_STATUSES, type ArchivableStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import type { ArchivableActions } from "./archivable-columns";
import { archivableStatusLabel } from "./status-labels";
import {
	type ListQuery,
	StatusList,
	type StatusListChange,
	type StatusListSearch,
} from "./status-list";

export type ArchivableChange<Sort extends string> = StatusListChange<
	Sort,
	ArchivableStatus
>;

export function ArchivableTable<
	Row extends RowData & { id: number },
	Sort extends string,
>({
	query,
	search,
	onSearchChange,
	sorts,
	columns,
	onStatus,
	Dialog,
	newLabel,
	searchLabel,
	emptyTitle,
	emptyHint,
}: {
	query: ListQuery<Row>;
	search: StatusListSearch<Sort, ArchivableStatus>;
	onSearchChange: (change: ArchivableChange<Sort>) => void;
	sorts: readonly Sort[];
	columns: (actions: ArchivableActions) => ListColumns<Row>;
	onStatus: ArchivableActions["onStatus"];
	Dialog: ComponentType<{ id?: number; onClose: () => void }>;
	newLabel: string;
	searchLabel: string;
	emptyTitle: string;
	emptyHint: string;
}) {
	const [dialog, setDialog] = useState<"new" | number | null>(null);
	const create = (
		<Button size="sm" onClick={() => setDialog("new")}>
			<PlusIcon aria-hidden />
			{newLabel}
		</Button>
	);
	return (
		<>
			<StatusList
				query={query}
				columns={columns({ onEdit: setDialog, onStatus })}
				sorts={sorts}
				search={search}
				onSearchChange={onSearchChange}
				statuses={ARCHIVABLE_STATUSES}
				statusLabel={archivableStatusLabel}
				allLabel={m.admin_merch_all()}
				searchLabel={searchLabel}
				getRowId={(row) => String(row.id)}
				action={create}
				emptyTitle={emptyTitle}
				emptyHint={emptyHint}
			/>
			{dialog !== null && (
				<Dialog
					id={dialog === "new" ? undefined : dialog}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}
