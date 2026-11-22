import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { Badge } from "#/components/ui/badge";
import { useMoney } from "#/hooks/use-money";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { lifecycleColumns } from "../merchandising/lifecycle-columns";
import type { BundleRow } from "./queries";

const column = createColumnHelper<ListFeatures, BundleRow>();

function Price({ amount }: { amount: number }) {
	const money = useMoney();
	return <span className="tabular-nums">{money(amount)}</span>;
}

// Column ids are the sorts the API accepts (BUNDLE_SORTS).
export const bundleColumns = (actions: {
	onStatus: (id: number, status: ProductStatus) => void;
}) => {
	const shared = lifecycleColumns<BundleRow>({
		titleOf: (bundle) => bundle.name,
		titleSort: "name",
		titleHeader: m.admin_field_name,
		title: (bundle) => (
			<Link
				to="/admin/bundles/$id"
				params={{ id: bundle.id }}
				className="font-bold underline-offset-4 hover:underline"
			>
				{bundle.name ?? (
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
		column.accessor("items", {
			header: m.admin_routine_steps(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("price", {
			header: m.admin_bundle_price(),
			meta: { align: "right" },
			cell: ({ getValue }) => <Price amount={getValue()} />,
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
