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
import { SLUG_REGEX } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { useRefreshAfterProductChange } from "./mutations";
import { SectionFooter, SectionForm } from "./section-form";

const FIELD_OF = {
	slug: "slug",
	sanitaryRegistration: "sanitaryRegistration",
	inci: "inci",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

// The page remounts the card when this changes, so a saved card shows what was stored and one
// being edited is untouched by the saves of the others.
export const basicsValues = (product: AdminProduct) => ({
	slug: product.slug,
	sanitaryRegistration: product.sanitaryRegistration ?? "",
	inci: product.inci ?? "",
});

export function BasicsCard({ product }: { product: AdminProduct }) {
	const refresh = useRefreshAfterProductChange();
	const schema = z.object({
		slug: z
			.string()
			.trim()
			.min(1, m.admin_required())
			.max(PRODUCT_LIMITS.slug)
			.regex(SLUG_REGEX, m.admin_product_slug_invalid()),
		sanitaryRegistration: z
			.string()
			.trim()
			.max(PRODUCT_LIMITS.sanitaryRegistration),
		inci: z.string().trim().max(PRODUCT_LIMITS.inci),
	});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.products[":id"].$patch({
					param: { id: String(product.id) },
					json: {
						slug: value.slug,
						sanitaryRegistration: value.sanitaryRegistration || null,
						inci: value.inci || null,
					},
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: basicsValues(product),
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
				<Section title={m.admin_product_basics()}>
					<div className="grid gap-3 p-admin-card">
						<form.AppField name="slug">
							{(field) => (
								<field.TextField
									label={m.admin_product_slug()}
									maxLength={PRODUCT_LIMITS.slug}
									disabled={product.status !== "draft"}
								/>
							)}
						</form.AppField>
						{product.status !== "draft" && (
							<p className="type-meta -mt-1 text-muted-foreground">
								{m.admin_product_slug_locked()}
							</p>
						)}
						<form.AppField name="sanitaryRegistration">
							{(field) => (
								<field.TextField
									label={m.admin_field_sanitary_registration()}
									maxLength={PRODUCT_LIMITS.sanitaryRegistration}
								/>
							)}
						</form.AppField>
						<form.AppField name="inci">
							{(field) => (
								<field.TextareaField
									label={m.admin_product_inci()}
									rows={4}
									maxLength={PRODUCT_LIMITS.inci}
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
