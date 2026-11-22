import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { slideQuery } from "#/features/slides/queries";
import { SlideDetail } from "#/features/slides/slide-detail";
import { slideTitle } from "#/features/slides/use-slide-title";
import { isNotFound } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { idParams, type LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/slides/$id")({
	params: idParams,
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [slide, store] = await Promise.all([
				context.queryClient.ensureQueryData(slideQuery(params.id)),
				context.queryClient.ensureQueryData(storeQuery),
			]);
			return { crumb: slideTitle(slide, store.defaultLocale) };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => <RecordNotFound listLabel={m.admin_nav_slides()} />,
	component: Slide,
});

function Slide() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(slideQuery(id));
	return <SlideDetail slide={data} />;
}
