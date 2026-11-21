import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { NewProductForm } from "#/features/products/new-product-form";
import { productOptionsQuery } from "#/features/products/options";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/products/new")({
	staticData: { crumb: m.admin_product_new_title },
	// The brands, categories and needs the form offers come with the page, so it opens ready.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(productOptionsQuery),
	component: NewProduct,
});

function NewProduct() {
	return (
		<>
			<PageHeader title={m.admin_product_new_title()} />
			<NewProductForm />
		</>
	);
}
