import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { PurchaseDetail } from "#/features/purchases/purchase-detail";
import { purchaseQuery } from "#/features/purchases/queries";
import { isNotFound } from "#/lib/api";
import { adminSettingsQuery } from "#/lib/queries";
import { idParams, type LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/purchases/$id")({
	params: idParams,
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [purchase] = await Promise.all([
				context.queryClient.ensureQueryData(purchaseQuery(params.id)),
				context.queryClient.ensureQueryData(adminSettingsQuery),
			]);
			return { crumb: purchase.reference };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => (
		<RecordNotFound listLabel={m.admin_nav_purchases()} />
	),
	component: Purchase,
});

function Purchase() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(purchaseQuery(id));
	return <PurchaseDetail purchase={data} />;
}
