import { Link } from "@tanstack/react-router";
import { MoreHorizontalIcon, PlusIcon } from "lucide-react";
import { useState } from "react";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { supplierStatusLabel } from "#/components/admin/labels";
import { HeaderActions, PageHeader } from "#/components/admin/page-header";
import { PurchaseStatusBadge } from "#/components/admin/purchase-status-badge";
import { Fact, Section } from "#/components/admin/section";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { useMoney } from "#/hooks/use-money";
import { useCalendarDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { useSupplierStatus } from "./mutations";
import type { Supplier } from "./queries";
import { SupplierDialog } from "./supplier-dialog";
import { SupplierItems } from "./supplier-items";

export function SupplierDetail({ supplier }: { supplier: Supplier }) {
	const status = useSupplierStatus();
	const [editing, setEditing] = useState(false);
	const active = supplier.status === "active";

	return (
		<DetailPage>
			<PageHeader
				title={supplier.name}
				badges={
					<Badge variant={active ? "default" : "outline"}>
						{supplierStatusLabel[supplier.status]()}
					</Badge>
				}
				action={
					<HeaderActions>
						{active && (
							<Button className="max-sm:flex-1" asChild>
								<Link
									to="/admin/purchases/new"
									search={{ supplierId: supplier.id }}
								>
									<PlusIcon aria-hidden />
									{m.admin_purchase_new()}
								</Link>
							</Button>
						)}
						<DropdownMenu modal={false}>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									aria-label={m.admin_order_more_actions()}
								>
									<MoreHorizontalIcon aria-hidden />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								<DropdownMenuItem onSelect={() => setEditing(true)}>
									{m.admin_edit()}
								</DropdownMenuItem>
								<DropdownMenuItem
									disabled={status.isPending}
									onSelect={() =>
										status.mutate({
											id: supplier.id,
											status: active ? "archived" : "active",
										})
									}
								>
									{active
										? m.admin_supplier_archive()
										: m.admin_supplier_restore()}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</HeaderActions>
				}
			/>
			{!active && (
				<Alert className="mb-admin-section">
					<AlertDescription>
						{m.admin_supplier_archived_notice()}
					</AlertDescription>
				</Alert>
			)}
			<DetailColumns
				aside={
					<>
						<SupplierContact supplier={supplier} />
						<SupplierTerms supplier={supplier} />
					</>
				}
			>
				<SupplierItems supplier={supplier} />
				<SupplierOpenOrders supplier={supplier} />
			</DetailColumns>
			{editing && (
				<SupplierDialog supplier={supplier} onClose={() => setEditing(false)} />
			)}
		</DetailPage>
	);
}

function SupplierOpenOrders({ supplier }: { supplier: Supplier }) {
	const money = useMoney();
	const formatDate = useCalendarDate();
	return (
		<Section title={m.admin_supplier_open_orders()}>
			{supplier.openOrders.length === 0 ? (
				<p className="type-small p-admin-card text-muted-foreground">
					{m.admin_supplier_no_open_orders()}
				</p>
			) : (
				<ul>
					{supplier.openOrders.map((order) => (
						<li
							key={order.id}
							className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-0.5 border-b p-admin-card last:border-b-0"
						>
							<span className="type-small">
								<Link
									to="/admin/purchases/$id"
									params={{ id: order.id }}
									className="mr-2 font-bold underline-offset-4 hover:underline"
								>
									{order.reference}
								</Link>
								<PurchaseStatusBadge status={order.status} />
							</span>
							<span className="type-small text-right font-bold tabular-nums">
								{money(order.total)}
							</span>
							<span className="type-meta text-muted-foreground">
								{m.admin_units({ count: order.units })}
								{order.orderedOn && ` · ${formatDate(order.orderedOn)}`}
							</span>
						</li>
					))}
				</ul>
			)}
		</Section>
	);
}

function SupplierContact({ supplier }: { supplier: Supplier }) {
	return (
		<Section title={m.admin_supplier_contact()}>
			<dl className="grid gap-3 p-admin-card">
				<Fact
					label={m.admin_supplier_field_contact()}
					value={supplier.contactName}
				/>
				<Fact
					label={m.admin_field_phone()}
					value={
						supplier.phoneE164 && (
							<a
								href={`tel:${supplier.phoneE164}`}
								className="underline-offset-4 hover:underline"
							>
								{supplier.phoneE164}
							</a>
						)
					}
				/>
				<Fact
					label={m.admin_field_email()}
					value={
						supplier.email && (
							<a
								href={`mailto:${supplier.email}`}
								className="underline-offset-4 hover:underline"
							>
								{supplier.email}
							</a>
						)
					}
				/>
				{!supplier.contactName && !supplier.phoneE164 && !supplier.email && (
					<p className="type-small text-muted-foreground">
						{m.admin_supplier_no_contact()}
					</p>
				)}
			</dl>
		</Section>
	);
}

function SupplierTerms({ supplier }: { supplier: Supplier }) {
	return (
		<Section title={m.admin_supplier_terms()}>
			<dl className="grid gap-3 p-admin-card">
				<Fact
					label={m.admin_supplier_field_lead_time()}
					value={
						supplier.leadTimeDays !== null &&
						m.admin_supplier_lead_days({ count: supplier.leadTimeDays })
					}
				/>
				<Fact
					label={m.admin_supplier_field_terms()}
					value={supplier.paymentTerms}
				/>
				<Fact label={m.admin_supplier_field_notes()} value={supplier.notes} />
				{supplier.leadTimeDays === null &&
					!supplier.paymentTerms &&
					!supplier.notes && (
						<p className="type-small text-muted-foreground">
							{m.admin_supplier_no_terms()}
						</p>
					)}
			</dl>
		</Section>
	);
}
