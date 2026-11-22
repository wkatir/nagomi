import { useSuspenseQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { RowActions } from "#/components/admin/data-table/row-actions";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import {
	shippingMethodLabel,
	zoneStatusLabel,
} from "#/components/admin/labels";
import { useStaffAccess } from "#/components/admin/staff-access";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { DropdownMenuItem } from "#/components/ui/dropdown-menu";
import { useMoney } from "#/hooks/use-money";
import type { Locale } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { useZoneStatus } from "./mutations";
import type { AdminZone } from "./queries";

const column = createColumnHelper<ListFeatures, AdminZone>();

export const zoneName = (zone: AdminZone, defaultLocale: Locale) =>
	zone.translations.find((t) => t.locale === defaultLocale)?.name ?? zone.slug;

export const deliveryTime = (zone: {
	deliveryDaysMin: number;
	deliveryDaysMax: number;
}) =>
	zone.deliveryDaysMin !== zone.deliveryDaysMax
		? m.admin_zone_days_range({
				min: zone.deliveryDaysMin,
				max: zone.deliveryDaysMax,
			})
		: zone.deliveryDaysMax === 0
			? m.admin_zone_same_day()
			: m.admin_zone_days_exact({ count: zone.deliveryDaysMax });

function RowMenu({
	zone,
	name,
	onEdit,
}: {
	zone: AdminZone;
	name: string;
	onEdit: (zone: AdminZone) => void;
}) {
	const change = useZoneStatus();
	const archive = zone.status === "active";
	if (!useStaffAccess().canWrite("shipping")) return null;
	return (
		<RowActions label={m.admin_zone_row_actions({ name })}>
			<DropdownMenuItem onSelect={() => onEdit(zone)}>
				{m.admin_edit()}
			</DropdownMenuItem>
			<DropdownMenuItem
				disabled={change.isPending}
				onSelect={() =>
					change.mutate({
						zone: { id: zone.id, name },
						status: archive ? "archived" : "active",
					})
				}
			>
				{archive ? m.admin_zone_archive() : m.admin_zone_restore()}
			</DropdownMenuItem>
		</RowActions>
	);
}

// Column ids are the sorts the API accepts (ZONE_SORTS).
export function useZoneColumns({
	onEdit,
}: {
	onEdit: (zone: AdminZone) => void;
}) {
	const money = useMoney();
	const { data: store } = useSuspenseQuery(storeQuery);
	return column.columns([
		column.accessor((zone) => zoneName(zone, store.defaultLocale), {
			id: "name",
			header: m.admin_field_name(),
			cell: ({ row }) => {
				const zone = row.original;
				return (
					<div className="grid justify-items-start">
						<Button
							variant="link"
							className="h-auto p-0 font-bold"
							onClick={() => onEdit(zone)}
						>
							{zoneName(zone, store.defaultLocale)}
						</Button>
						<span className="type-meta text-muted-foreground">{zone.slug}</span>
					</div>
				);
			},
		}),
		column.accessor("method", {
			header: m.admin_zone_col_method(),
			cell: ({ getValue }) => shippingMethodLabel[getValue()](),
		}),
		column.accessor("fee", {
			header: m.admin_zone_col_fee(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.display({
			id: "coverage",
			header: m.admin_zone_col_coverage(),
			meta: { hideOnMobile: true },
			cell: ({ row }) =>
				row.original.coversRest ? (
					<span className="text-muted-foreground">
						{m.admin_zone_covers_rest()}
					</span>
				) : (
					<span className="tabular-nums">
						{m.admin_zone_municipalities_n({
							count: row.original.municipalities.length,
						})}
					</span>
				),
		}),
		column.accessor(
			(zone) => zone.deliveryDaysMin * 1000 + zone.deliveryDaysMax,
			{
				id: "deliveryDays",
				header: m.admin_zone_col_days(),
				cell: ({ row }) => deliveryTime(row.original),
			},
		),
		column.accessor("position", {
			header: m.admin_zone_col_position(),
			meta: { align: "right", hideOnMobile: true },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("status", {
			header: m.admin_col_status(),
			enableSorting: false,
			cell: ({ getValue }) => {
				const status = getValue();
				return (
					<Badge variant={status === "active" ? "default" : "outline"}>
						{zoneStatusLabel[status]()}
					</Badge>
				);
			},
		}),
		column.display({
			id: "actions",
			header: () => (
				<span className="sr-only">{m.admin_zone_col_actions()}</span>
			),
			meta: { align: "right" },
			cell: ({ row }) => (
				<RowMenu
					zone={row.original}
					name={zoneName(row.original, store.defaultLocale)}
					onEdit={onEdit}
				/>
			),
		}),
	]);
}
