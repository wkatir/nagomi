import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { z } from "zod";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { OrderDetail } from "#/features/orders/order-detail";
import { orderQuery } from "#/features/orders/queries";
import { isNotFound } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { idParams, type LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders/$id")({
	params: idParams,
	validateSearch: z.object({ action: z.enum(["ship"]).optional() }),
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [detail] = await Promise.all([
				context.queryClient.ensureQueryData(orderQuery(params.id)),
				context.queryClient.ensureQueryData(storeQuery),
			]);
			return { crumb: detail.order.code };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => <RecordNotFound listLabel={m.admin_nav_orders()} />,
	component: Order,
});

function Order() {
	const { id } = Route.useParams();
	const { action } = Route.useSearch();
	const { data } = useSuspenseQuery(orderQuery(id));
	return <OrderDetail detail={data} initialDialog={action ?? null} />;
}
