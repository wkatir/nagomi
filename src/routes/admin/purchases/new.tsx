import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { PageHeader } from "#/components/admin/page-header";
import { NewPurchaseForm } from "#/features/purchases/new-purchase-form";
import { supplierOptionsQuery } from "#/features/suppliers/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/purchases/new")({
	staticData: { crumb: m.admin_purchase_new },
	validateSearch: z.object({
		supplierId: z.coerce.number().int().positive().optional(),
	}),
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(supplierOptionsQuery("active")),
	component: NewPurchase,
});

function NewPurchase() {
	const { supplierId } = Route.useSearch();
	return (
		<>
			<PageHeader title={m.admin_purchase_new()} />
			<NewPurchaseForm supplierId={supplierId} />
		</>
	);
}
