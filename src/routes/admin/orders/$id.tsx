import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { OrderDetail } from "#/features/orders/order-detail";
import { orderQuery } from "#/features/orders/queries";
import { activeZonesQuery } from "#/features/shipping/queries";
import { isNotFound } from "#/lib/api";
import { adminSettingsQuery } from "#/lib/queries";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/orders/$id")({
	params: {
		parse: ({ id }) => {
			const parsed = Number(id);
			if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
			return { id: parsed };
		},
		stringify: ({ id }) => ({ id: String(id) }),
	},
	// What the confirm dialog needs is loaded with the order, so opening it never waits.
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [detail] = await Promise.all([
				context.queryClient.ensureQueryData(orderQuery(params.id)),
				context.queryClient.ensureQueryData(activeZonesQuery),
				context.queryClient.ensureQueryData(adminSettingsQuery),
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
	const { data } = useSuspenseQuery(orderQuery(id));
	return <OrderDetail detail={data} />;
}
