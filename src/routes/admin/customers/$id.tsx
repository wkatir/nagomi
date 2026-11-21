import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { customerLabel } from "#/features/customers/columns";
import { CustomerDetail } from "#/features/customers/customer-detail";
import { customerQuery } from "#/features/customers/queries";
import { isNotFound } from "#/lib/api";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/customers/$id")({
	params: {
		parse: ({ id }) => {
			const parsed = Number(id);
			if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
			return { id: parsed };
		},
		stringify: ({ id }) => ({ id: String(id) }),
	},
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const detail = await context.queryClient.ensureQueryData(
				customerQuery(params.id),
			);
			return { crumb: customerLabel(detail.customer) };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => (
		<RecordNotFound listLabel={m.admin_nav_customers()} />
	),
	component: Customer,
});

function Customer() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(customerQuery(id));
	return <CustomerDetail detail={data} />;
}
