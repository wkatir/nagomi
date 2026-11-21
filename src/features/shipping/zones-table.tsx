import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import {
	shippingMethodLabel,
	zoneStatusLabel,
} from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { ARCHIVABLE_STATUSES, SHIPPING_METHODS } from "#/lib/enums";
import { ZONE_SORTS, type ZoneListSearch } from "#/lib/schemas/shipping";
import { m } from "#/paraglide/messages";
import { useZoneColumns } from "./columns";
import { type AdminZone, zonesQuery } from "./queries";
import { clearedFilters, isFiltered } from "./search";
import { ZoneDialog } from "./zone-dialog";

export function ZonesTable({
	search,
	onSearchChange,
}: {
	search: ZoneListSearch;
	onSearchChange: (change: Partial<ZoneListSearch>) => void;
}) {
	const [dialog, setDialog] = useState<"new" | AdminZone | null>(null);
	const query = useQuery({
		...zonesQuery(search),
		placeholderData: keepPreviousData,
	});
	const columns = useZoneColumns({ onEdit: setDialog });
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: ZONE_SORTS,
		onSearchChange,
		getRowId: (zone) => String(zone.id),
	});
	const filter = (change: Partial<ZoneListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={ARCHIVABLE_STATUSES}
				label={zoneStatusLabel}
				allLabel={m.admin_zone_all()}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<div className="mb-4 flex flex-wrap items-center gap-2">
				<SelectFilter
					label={m.admin_zone_filter_method()}
					allLabel={m.admin_zone_filter_method_all()}
					value={search.method}
					options={SHIPPING_METHODS.map((method) => ({
						value: method,
						label: shippingMethodLabel[method](),
					}))}
					onChange={(method) => filter({ method })}
				/>
				{filtered && (
					<Button variant="ghost" size="sm" onClick={clear}>
						<XIcon aria-hidden />
						{m.admin_table_clear_filters()}
					</Button>
				)}
				<Button size="sm" className="ml-auto" onClick={() => setDialog("new")}>
					<PlusIcon aria-hidden />
					{m.admin_zone_new()}
				</Button>
			</div>
			<DataTable
				table={table}
				query={query}
				filtered={filtered}
				onClearFilters={clear}
				empty={
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{m.admin_zone_empty()}</EmptyTitle>
							<EmptyDescription>{m.admin_zone_empty_hint()}</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={() => setDialog("new")}>
								<PlusIcon aria-hidden />
								{m.admin_zone_new()}
							</Button>
						</EmptyContent>
					</Empty>
				}
			/>
			{dialog && (
				<ZoneDialog
					zone={dialog === "new" ? undefined : dialog}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}
