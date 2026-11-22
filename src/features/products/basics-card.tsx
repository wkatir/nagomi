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
import { PRODUCT_BADGES, SLUG_REGEX } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { badgeLabel } from "./badge-label";
import { useRefreshAfterProductChange } from "./mutations";
import { SectionFooter, SectionForm } from "./section-form";

const FIELD_OF = {
	slug: "slug",
	warrantyMonths: "warrantyMonths",
	isFeatured: "isFeatured",
	badge: "badge",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

// The page remounts the card when this changes, so saving one card never resets another.
export const basicsValues = (product: AdminProduct) => ({
	slug: product.slug,
	warrantyMonths: String(product.warrantyMonths),
	isFeatured: product.isFeatured,
	badge: product.badge ?? "",
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
		warrantyMonths: z
			.string()
			.trim()
			.regex(/^\d+$/, m.admin_product_warranty_invalid())
			.refine(
				(value) => Number(value) <= PRODUCT_LIMITS.warrantyMonths,
				m.admin_product_warranty_invalid(),
			),
		isFeatured: z.boolean(),
		badge: z.union([z.literal(""), z.enum(PRODUCT_BADGES)]),
	});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.products[":id"].$patch({
					param: { id: String(product.id) },
					json: {
						slug: value.slug,
						warrantyMonths: Number(value.warrantyMonths),
						isFeatured: value.isFeatured,
						badge: value.badge || null,
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
						<form.AppField name="warrantyMonths">
							{(field) => (
								<field.TextField
									label={m.admin_product_warranty_months()}
									inputMode="numeric"
									maxLength={3}
								/>
							)}
						</form.AppField>
						<form.AppField name="badge">
							{(field) => (
								<field.SelectField
									label={m.admin_product_badge()}
									options={[
										{ value: "", label: m.admin_product_badge_none() },
										...PRODUCT_BADGES.map((badge) => ({
											value: badge,
											label: badgeLabel[badge](),
										})),
									]}
								/>
							)}
						</form.AppField>
						<form.AppField name="isFeatured">
							{(field) => (
								<field.CheckboxField label={m.admin_product_featured()} />
							)}
						</form.AppField>
					</div>
					<SectionFooter />
				</Section>
			</form.AppForm>
		</SectionForm>
	);
}
