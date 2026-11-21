import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { NewOrderForm } from "#/features/orders/new-order-form";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders/new")({
	staticData: { crumb: m.admin_order_new_title },
	component: NewOrder,
});

function NewOrder() {
	return (
		<>
			<PageHeader title={m.admin_order_new_title()} />
			<NewOrderForm />
		</>
	);
}
