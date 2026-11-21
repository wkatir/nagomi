import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { PRODUCT_STATUSES, type ProductStatus } from "#/lib/enums";
import { ROUTINE_SORTS, type RoutineListSearch } from "#/lib/schemas/routines";
import { m } from "#/paraglide/messages";
import { lifecycleStatusLabel } from "../merchandising/status-labels";
import {
	StatusList,
	type StatusListChange,
} from "../merchandising/status-list";
import { routineColumns } from "./columns";
import { useRoutineStatus } from "./mutations";
import { routinesQuery } from "./queries";

export function RoutinesTable({
	search,
	onSearchChange,
}: {
	search: RoutineListSearch;
	onSearchChange: (
		change: StatusListChange<RoutineListSearch["sort"], ProductStatus>,
	) => void;
}) {
	const query = useQuery({
		...routinesQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useRoutineStatus();
	return (
		<StatusList
			query={query}
			columns={routineColumns({
				onStatus: (id, next) => status.mutate({ id, status: next }),
			})}
			sorts={ROUTINE_SORTS}
			search={search}
			onSearchChange={onSearchChange}
			statuses={PRODUCT_STATUSES}
			statusLabel={lifecycleStatusLabel}
			allLabel={m.admin_merch_all()}
			searchLabel={m.admin_routine_search()}
			getRowId={(routine) => String(routine.id)}
			action={
				<Button size="sm" asChild>
					<Link to="/admin/routines/new">
						<PlusIcon aria-hidden />
						{m.admin_routine_new()}
					</Link>
				</Button>
			}
			emptyTitle={m.admin_routine_empty()}
			emptyHint={m.admin_routine_empty_hint()}
		/>
	);
}
