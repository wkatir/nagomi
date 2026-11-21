import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "#/components/ui/button";
import { m } from "#/paraglide/messages";
import { TableSearch } from "./table-search";

export function TableToolbar({
	search,
	filtered,
	onClearFilters,
	filters,
	actions,
}: {
	search: Parameters<typeof TableSearch>[0];
	filtered: boolean;
	onClearFilters: () => void;
	filters?: ReactNode;
	actions?: ReactNode;
}) {
	return (
		<div className="mb-4 flex flex-wrap items-center gap-2">
			<TableSearch {...search} />
			{filters}
			{filtered && (
				<Button variant="ghost" size="sm" onClick={onClearFilters}>
					<XIcon aria-hidden />
					{m.admin_table_clear_filters()}
				</Button>
			)}
			{actions && (
				<div className="ml-auto flex items-center gap-2">{actions}</div>
			)}
		</div>
	);
}
