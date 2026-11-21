import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { productOptionsQuery } from "#/features/products/options";
import { ProductEditor } from "#/features/products/product-editor";
import { productQuery } from "#/features/products/queries";
import { productName } from "#/features/products/translations";
import { isNotFound } from "#/lib/api";
import { storeQuery } from "#/lib/queries";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/products/$id")({
	params: {
		parse: ({ id }) => {
			const parsed = Number(id);
			if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
			return { id: parsed };
		},
		stringify: ({ id }) => ({ id: String(id) }),
	},
	// The brands, categories and needs the cards offer are loaded with the product, so the
	// page opens ready.
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
