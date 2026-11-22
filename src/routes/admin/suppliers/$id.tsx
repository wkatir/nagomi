import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import {
	supplierItemsQuery,
	supplierQuery,
} from "#/features/suppliers/queries";
import { SupplierDetail } from "#/features/suppliers/supplier-detail";
import { isNotFound } from "#/lib/api";
import { idParams, type LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/suppliers/$id")({
	params: idParams,
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [supplier] = await Promise.all([
				context.queryClient.ensureQueryData(supplierQuery(params.id)),
				context.queryClient.ensureQueryData(supplierItemsQuery(params.id)),
			]);
			return { crumb: supplier.name };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => (
		<RecordNotFound listLabel={m.admin_nav_suppliers()} />
	),
	component: Supplier,
});

function Supplier() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(supplierQuery(id));
	return <SupplierDetail supplier={data} />;
}
