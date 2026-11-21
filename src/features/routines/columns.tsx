import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { lifecycleColumns } from "../merchandising/lifecycle-columns";
import type { RoutineRow } from "./queries";

const column = createColumnHelper<ListFeatures, RoutineRow>();

// Column ids are the sorts the API accepts (ROUTINE_SORTS).
export const routineColumns = (actions: {
	onStatus: (id: number, status: ProductStatus) => void;
}) => {
	const shared = lifecycleColumns<RoutineRow>({
		title: (routine) => (
			<Link
				to="/admin/routines/$id"
				params={{ id: routine.id }}
				className="font-bold underline-offset-4 hover:underline"
			>
				{routine.title ?? (
					<span className="font-normal text-muted-foreground">
						{m.admin_merch_no_name()}
					</span>
				)}
			</Link>
		),
		onStatus: actions.onStatus,
	});
	return column.columns([
		shared.title,
		shared.slug,
		column.accessor("steps", {
			header: m.admin_routine_steps(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("isFeatured", {
			id: "featured",
			header: m.admin_routine_col_featured(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) =>
				getValue() && (
					<Badge variant="secondary">{m.admin_routine_col_featured()}</Badge>
				),
		}),
		shared.position,
		shared.status,
		shared.actions,
	]);
};
