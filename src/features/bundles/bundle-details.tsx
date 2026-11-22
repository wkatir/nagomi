import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Fact, Section } from "#/components/admin/section";
import { useMoney, useMoneyInput } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { SLUG_REGEX } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { useRefresh } from "../merchandising/status-change";
import { type BundleDetail, bundlesKeys } from "./queries";

const FIELDS = ["slug", "price", "position", "isFeatured"] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const baseSchema = z.object({
	slug: z
		.string()
		.trim()
		.max(80)
		.regex(SLUG_REGEX, m.admin_merch_slug_invalid()),
	position: z
		.string()
		.trim()
		.regex(/^(?:0|[1-9]\d{0,2}|1000)$/, m.admin_merch_position_invalid()),
	isFeatured: z.boolean(),
	price: z.string(),
});

export function BundleDetails({ bundle }: { bundle: BundleDetail }) {
	const refresh = useRefresh(bundlesKeys.all);
	const locked = bundle.status === "published";
	const money = useMoney();
	const moneyInput = useMoneyInput();
	const schema = baseSchema.superRefine((value, ctx) => {
		const amount = moneyInput.parse(value.price);
		if (amount === null || amount < 1)
			ctx.addIssue({
				code: "custom",
				path: ["price"],
				message: m.admin_invalid_amount(),
			});
	});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const position = Number(value.position);
			const price = moneyInput.parse(value.price) as number;
			const fields = {
				...(price === bundle.price ? {} : { price }),
				...(value.slug === bundle.slug ? {} : { slug: value.slug }),
				...(position === bundle.position ? {} : { position }),
				...(value.isFeatured === bundle.isFeatured
					? {}
					: { isFeatured: value.isFeatured }),
			};
			return parseResponse(
				api().admin.bundles[":id"].$patch({
					param: { id: String(bundle.id) },
					json: fields,
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: {
			slug: bundle.slug,
			position: String(bundle.position),
			isFeatured: bundle.isFeatured,
			price: moneyInput.toInput(bundle.price),
		},
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
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<Section
					title={m.admin_bundle_details()}
					action={
						<form.Subscribe selector={(state) => state.isDefaultValue}>
							{(unchanged) => (
								<form.SubmitButton
									size="sm"
									variant="outline"
									disabled={unchanged}
								>
									{m.admin_save()}
								</form.SubmitButton>
							)}
						</form.Subscribe>
					}
				>
					<div className="grid gap-3 p-admin-card">
						<form.AppField name="price">
							{(field) => <field.MoneyField label={m.admin_bundle_price()} />}
						</form.AppField>
						<dl className="grid grid-cols-2 gap-3">
							<Fact
								label={m.admin_bundle_items_total()}
								value={
									bundle.itemsTotal === null
										? m.admin_no_price()
										: money(bundle.itemsTotal)
								}
							/>
							<Fact
								label={m.admin_bundle_saving()}
								value={
									bundle.saving === null
										? m.admin_no_price()
										: money(bundle.saving)
								}
							/>
						</dl>
						<p className="type-meta text-muted-foreground">
							{m.admin_bundle_price_help()}
						</p>
						<form.AppField name="slug">
							{(field) => (
								<field.TextField
									label={m.admin_merch_slug()}
									maxLength={80}
									disabled={locked}
								/>
							)}
						</form.AppField>
						{locked && (
							<p className="type-meta text-muted-foreground">
								{m.admin_bundle_slug_locked()}
							</p>
						)}
						<form.AppField name="position">
							{(field) => (
								<field.TextField
									label={m.admin_bundle_position()}
									inputMode="numeric"
									maxLength={4}
								/>
							)}
						</form.AppField>
						<form.AppField name="isFeatured">
							{(field) => (
								<field.CheckboxField label={m.admin_bundle_featured()} />
							)}
						</form.AppField>
						<form.FormError />
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
