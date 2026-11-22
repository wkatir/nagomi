import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DownloadIcon } from "lucide-react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { DateRangeFilter } from "#/components/admin/data-table/date-range-filter";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import {
	channelLabel,
	orderStatusLabel,
	paymentStatusLabel,
} from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	ORDER_CHANNELS,
	ORDER_PAYMENT_STATUSES,
	ORDER_STATUSES,
} from "#/lib/enums";
import { ORDER_SORTS, type OrderListSearch } from "#/lib/schemas/orders";
import { m } from "#/paraglide/messages";
import { useOrderColumns } from "./columns";
import { ordersQuery } from "./queries";
import { clearedFilters, exportHref, isFiltered } from "./search";

const options = <T extends string>(
	values: readonly T[],
	label: Record<T, () => string>,
) => values.map((value) => ({ value, label: label[value]() }));

export function OrdersTable({
	search,
	onSearchChange,
}: {
	search: OrderListSearch;
	onSearchChange: (change: Partial<OrderListSearch>) => void;
}) {
	const query = useQuery({
		...ordersQuery(search),
		placeholderData: keepPreviousData,
	});
	const columns = useOrderColumns();
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: ORDER_SORTS,
		onSearchChange,
		getRowId: (order) => String(order.id),
	});
	const filter = (change: Partial<OrderListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={ORDER_STATUSES}
				label={orderStatusLabel}
				allLabel={m.admin_orders_all()}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_orders_search(),
				}}
				filtered={filtered}
				onClearFilters={clear}
				filters={
					<>
						<SelectFilter
							label={m.admin_filter_payment()}
							allLabel={m.admin_filter_payment_all()}
							value={search.paymentStatus}
							options={options(ORDER_PAYMENT_STATUSES, paymentStatusLabel)}
							onChange={(paymentStatus) => filter({ paymentStatus })}
						/>
						<SelectFilter
							label={m.admin_filter_channel()}
							allLabel={m.admin_filter_channel_all()}
							value={search.channel}
							options={options(ORDER_CHANNELS, channelLabel)}
							onChange={(channel) => filter({ channel })}
						/>
						<DateRangeFilter
							value={{ from: search.from, to: search.to }}
							onChange={({ from, to }) => filter({ from, to })}
						/>
					</>
				}
				actions={
					<>
						<Button variant="outline" size="sm" asChild>
							<a href={exportHref(search)} download>
								<DownloadIcon aria-hidden />
								{m.admin_export_csv()}
							</a>
						</Button>
					</>
				}
			/>
			<DataTable
				table={table}
				query={query}
				filtered={filtered}
				onClearFilters={clear}
				empty={
					<Empty>
						<EmptyHeader>
							<EmptyTitle>{m.admin_orders_empty()}</EmptyTitle>
							<EmptyDescription>{m.admin_orders_empty_hint()}</EmptyDescription>
						</EmptyHeader>
					</Empty>
				}
			/>
		</>
	);
}
