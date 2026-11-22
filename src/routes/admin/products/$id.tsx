import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { productOptionsQuery } from "#/features/products/options";
import { ProductEditor } from "#/features/products/product-editor";
import { productQuery } from "#/features/products/queries";
import { productName } from "#/features/products/translations";
import { isNotFound } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import { idParams, type LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/products/$id")({
	params: idParams,
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const store = await context.queryClient.ensureQueryData(storeQuery);
			const [product] = await Promise.all([
				context.queryClient.ensureQueryData(productQuery(params.id)),
				context.queryClient.ensureQueryData(productOptionsQuery),
			]);
			return { crumb: productName(product, store.defaultLocale) };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => (
		<RecordNotFound listLabel={m.admin_nav_products()} />
	),
	component: Product,
});

function Product() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(productQuery(id));
	return <ProductEditor product={data} />;
}
