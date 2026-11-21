import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { DataTable } from "#/components/admin/data-table/data-table";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { TableToolbar } from "#/components/admin/data-table/table-toolbar";
import { useDataTable } from "#/components/admin/data-table/use-data-table";
import { promotionStatusLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { PROMOTION_STATUSES } from "#/lib/enums";
import {
	PROMOTION_SORTS,
	type PromotionListSearch,
} from "#/lib/schemas/promotions";
import { m } from "#/paraglide/messages";
import { usePromotionColumns } from "./columns";
import { PromotionDialog } from "./promotion-dialog";
import { type AdminPromotion, promotionsQuery } from "./queries";
import { clearedFilters, isFiltered } from "./search";

export function PromotionsTable({
	search,
	onSearchChange,
}: {
	search: PromotionListSearch;
	onSearchChange: (change: Partial<PromotionListSearch>) => void;
}) {
	const [dialog, setDialog] = useState<"new" | AdminPromotion | null>(null);
	const query = useQuery({
		...promotionsQuery(search),
		placeholderData: keepPreviousData,
	});
	const columns = usePromotionColumns({ onEdit: setDialog });
	const table = useDataTable({
		data: query.data?.items ?? [],
		columns,
		rowCount: query.data?.total ?? 0,
		search,
		sorts: PROMOTION_SORTS,
		onSearchChange,
		getRowId: (promotion) => String(promotion.id),
	});
	const filter = (change: Partial<PromotionListSearch>) =>
		onSearchChange({ page: 1, ...change });
	const filtered = isFiltered(search);
	const clear = () => onSearchChange(clearedFilters);

	return (
		<>
			<StatusTabs
				values={PROMOTION_STATUSES}
				label={promotionStatusLabel}
				allLabel={m.admin_promotion_all()}
				value={search.status}
				onChange={(status) => filter({ status })}
			/>
			<TableToolbar
				search={{
					value: search.q,
					onChange: (q) => filter({ q }),
					label: m.admin_promotion_search(),
				}}
				filtered={filtered}
				onClearFilters={clear}
				actions={
					<Button size="sm" onClick={() => setDialog("new")}>
						<PlusIcon aria-hidden />
						{m.admin_promotion_new()}
					</Button>
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
							<EmptyTitle>{m.admin_promotion_empty()}</EmptyTitle>
							<EmptyDescription>
								{m.admin_promotion_empty_hint()}
							</EmptyDescription>
						</EmptyHeader>
						<EmptyContent>
							<Button onClick={() => setDialog("new")}>
								<PlusIcon aria-hidden />
								{m.admin_promotion_new()}
							</Button>
						</EmptyContent>
					</Empty>
				}
			/>
			{dialog && (
				<PromotionDialog
					promotion={dialog === "new" ? undefined : dialog}
					onClose={() => setDialog(null)}
				/>
			)}
		</>
	);
}
