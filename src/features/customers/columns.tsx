import { Link } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import type { ListFeatures } from "#/components/admin/data-table/use-data-table";
import { useMoney } from "#/hooks/use-money";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import type { AdminCustomers } from "./queries";

type CustomerRow = AdminCustomers["items"][number];

const column = createColumnHelper<ListFeatures, CustomerRow>();

export const customerLabel = (customer: {
	name: string | null;
	phoneE164: string | null;
}) => customer.name ?? customer.phoneE164 ?? m.admin_customer_no_name();

// Column ids are the sorts the API accepts (CUSTOMER_SORTS).
export function useCustomerColumns() {
	const money = useMoney();
	const formatDate = useStoreDate();
	return column.columns([
		column.accessor((customer) => customerLabel(customer), {
			id: "name",
			header: m.admin_col_customer(),
			cell: ({ row }) => {
				const customer = row.original;
				const contact = [
					customer.name ? customer.phoneE164 : null,
					customer.email,
				]
					.filter(Boolean)
					.join(" · ");
				return (
					<div className="grid">
						<Link
							to="/admin/customers/$id"
							params={{ id: customer.id }}
							className="font-bold underline-offset-4 hover:underline"
						>
							{customerLabel(customer)}
						</Link>
						{contact && (
							<span className="type-meta text-muted-foreground">{contact}</span>
						)}
					</div>
				);
			},
		}),
		column.accessor("orders", {
			header: m.admin_customer_col_orders(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{getValue()}</span>
			),
		}),
		column.accessor("lifetimeValue", {
			id: "spent",
			header: m.admin_customer_col_spent(),
			meta: { align: "right" },
			cell: ({ getValue }) => (
				<span className="tabular-nums">{money(getValue())}</span>
			),
		}),
		column.accessor("lastOrderAt", {
			id: "lastOrder",
			header: m.admin_customer_col_last_order(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => {
				const last = getValue();
				return last
					? formatDate(last, { dateStyle: "medium" })
					: m.admin_customer_no_orders();
			},
		}),
		column.accessor("createdAt", {
			header: m.admin_customer_col_since(),
			meta: { hideOnMobile: true },
			cell: ({ getValue }) => formatDate(getValue(), { dateStyle: "medium" }),
		}),
	]);
}
