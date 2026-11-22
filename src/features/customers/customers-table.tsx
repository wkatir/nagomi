import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { DownloadIcon, MegaphoneIcon } from "lucide-react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { SelectFilter } from "#/components/admin/data-table/select-filter";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { customerSegmentLabel } from "#/components/admin/labels";
import { IfWritable } from "#/components/admin/staff-access";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { CUSTOMER_SEGMENTS } from "#/lib/enums";
import {
	CUSTOMER_SORTS,
	type CustomerListSearch,
	MARKETING_CHANNELS,
} from "#/lib/schemas/customers";
import { m } from "#/paraglide/messages";
import { useCustomerColumns } from "./columns";
import { customersQuery } from "./queries";
import { campaignHref, clearedFilters, exportHref, isFiltered } from "./search";

const marketingLabel = {
	email: m.admin_customer_marketing_email,
	whatsapp: m.admin_customer_marketing_whatsapp,
} as const;

function CampaignExport({
	segment,
}: {
	segment: CustomerListSearch["segment"];
}) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button size="sm">
					<MegaphoneIcon aria-hidden />
					{m.admin_customer_campaign()}
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="max-w-72">
				<DropdownMenuLabel className="type-meta font-normal text-muted-foreground">
					{segment
						? m.admin_customer_campaign_segment({
								segment: customerSegmentLabel[segment](),
							})
						: m.admin_customer_campaign_all()}
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				{MARKETING_CHANNELS.map((channel) => (
					<DropdownMenuItem key={channel} asChild>
						<a href={campaignHref(channel, segment)} download>
							{m.admin_customer_campaign_channel({
								channel: marketingLabel[channel](),
							})}
						</a>
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}

// No create button: customers are born from orders and sign-ups.
export function CustomersTable({
	search,
	onSearchChange,
}: {
	search: CustomerListSearch;
	onSearchChange: (change: Partial<CustomerListSearch>) => void;
}) {
	const query = useQuery({
		...customersQuery(search),
		placeholderData: keepPreviousData,
	});
	const columns = useCustomerColumns();
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: CUSTOMER_SORTS,
		onSearchChange,
		getRowId: (customer) => String(customer.id),
	});
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => onSearchChange({ page: 1, q }),
					label: m.admin_customer_search(),
				}}
				filters={
					<>
						<SelectFilter
							label={m.admin_customer_col_segment()}
							allLabel={m.admin_customer_segment_all()}
							value={search.segment}
							options={CUSTOMER_SEGMENTS.map((segment) => ({
								value: segment,
								label: customerSegmentLabel[segment](),
							}))}
							onChange={(segment) => onSearchChange({ page: 1, segment })}
						/>
						<SelectFilter
							label={m.admin_customer_marketing_filter()}
							allLabel={m.admin_customer_marketing_all()}
							value={search.marketing}
							options={MARKETING_CHANNELS.map((channel) => ({
								value: channel,
								label: marketingLabel[channel](),
							}))}
							onChange={(marketing) => onSearchChange({ page: 1, marketing })}
						/>
					</>
				}
				filtered={filtered}
				onClearFilters={clear}
				actions={
					<IfWritable area="reports">
						<CampaignExport segment={search.segment} />
						<Button variant="outline" size="sm" asChild>
							<a href={exportHref(search)} download>
								<DownloadIcon aria-hidden />
								{m.admin_export_csv()}
							</a>
						</Button>
					</IfWritable>
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
							<EmptyTitle>{m.admin_customer_empty()}</EmptyTitle>
							<EmptyDescription>
								{m.admin_customer_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				}
			/>
		</>
	);
}
