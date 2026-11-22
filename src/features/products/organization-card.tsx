import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Section } from "#/components/admin/section";
import { type AdminProduct, api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { choosable } from "./choosable";
import { useRefreshAfterProductChange } from "./mutations";
import { useLoadedProductOptions } from "./options";
import { organizationPatch, organizationValues } from "./organization-form";
import { SectionFooter, SectionForm } from "./section-form";

const FIELD_OF = {
	brandId: "brandId",
	categoryId: "categoryId",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

export function OrganizationCard({ product }: { product: AdminProduct }) {
	const refresh = useRefreshAfterProductChange();
	const options = useLoadedProductOptions();
	const schema = z.object({
		brandId: z.string().min(1, m.admin_required()),
		categoryId: z.string().min(1, m.admin_required()),
	});

	const save = useMutation({
		mutationFn: async (value: z.output<typeof schema>) => {
			const patch = organizationPatch(value, organizationValues(product));
			if (Object.keys(patch).length === 0) return;
			await parseResponse(
				api().admin.products[":id"].$patch({
					param: { id: String(product.id) },
					json: patch,
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: organizationValues(product),
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});

	return (
		<SectionForm onSubmit={() => form.handleSubmit()}>
			<form.AppForm>
				<Section title={m.admin_product_organization()}>
					<div className="grid gap-4 p-admin-card">
						<form.AppField name="brandId">
							{(field) => (
								<field.ComboboxField
									label={m.admin_product_col_brand()}
									options={choosable(options.brands, [String(product.brandId)])}
								/>
							)}
						</form.AppField>
						<form.AppField name="categoryId">
							{(field) => (
								<field.ComboboxField
									label={m.admin_product_col_category()}
									options={choosable(options.categories, [
										String(product.categoryId),
									])}
								/>
							)}
						</form.AppField>
					</div>
					<SectionFooter />
				</Section>
			</form.AppForm>
		</SectionForm>
	);
}
