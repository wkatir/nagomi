import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { IfWritable } from "#/components/admin/staff-access";
import { Button } from "#/components/ui/button";
import { PRODUCT_STATUSES, type ProductStatus } from "#/lib/enums";
import { BUNDLE_SORTS, type BundleListSearch } from "#/lib/schemas/bundles";
import { m } from "#/paraglide/messages";
import { lifecycleStatusLabel } from "../merchandising/status-labels";
import {
	StatusList,
	type StatusListChange,
} from "../merchandising/status-list";
import { bundleColumns } from "./columns";
import { useBundleStatus } from "./mutations";
import { bundlesQuery } from "./queries";

export function BundlesTable({
	search,
	onSearchChange,
}: {
	search: BundleListSearch;
	onSearchChange: (
		change: StatusListChange<BundleListSearch["sort"], ProductStatus>,
	) => void;
}) {
	const query = useQuery({
		...bundlesQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useBundleStatus();
	return (
		<StatusList
			query={query}
			columns={bundleColumns({
				onStatus: (id, next) => status.mutate({ id, status: next }),
			})}
			sorts={BUNDLE_SORTS}
			search={search}
			onSearchChange={onSearchChange}
			statuses={PRODUCT_STATUSES}
			statusLabel={lifecycleStatusLabel}
			allLabel={m.admin_merch_all()}
			searchLabel={m.admin_routine_search()}
			getRowId={(bundle) => String(bundle.id)}
			action={
				<IfWritable area="catalog">
					<Button size="sm" asChild>
						<Link to="/admin/bundles/new">
							<PlusIcon aria-hidden />
							{m.admin_routine_new()}
						</Link>
					</Button>
				</IfWritable>
			}
			emptyTitle={m.admin_routine_empty()}
			emptyHint={m.admin_routine_empty_hint()}
		/>
	);
}
