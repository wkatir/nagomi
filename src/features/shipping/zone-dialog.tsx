import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import { invalidLocales } from "#/components/admin/form/translations";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { shippingMethodLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoneyInput } from "#/hooks/use-money";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import { LOCALES, type Locale, SHIPPING_METHODS } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { useRefreshZones } from "./mutations";
import type { AdminZone } from "./queries";
import {
	changedTexts,
	type ZoneValues,
	zoneFields,
	zoneSchema,
} from "./zone-form";

const FIELD_OF = {
	slug: "slug",
	method: "method",
	fee: "fee",
	freeFrom: "freeFrom",
	deliveryDaysMin: "deliveryDaysMin",
	deliveryDaysMax: "deliveryDaysMax",
	position: "position",
} as const;
type TextField = "name" | "description";
type Field =
	| (typeof FIELD_OF)[keyof typeof FIELD_OF]
	| `translations.${Locale}.${TextField}`;
const TEXT_FIELDS = LOCALES.flatMap((locale) =>
	(["name", "description"] as const).map(
		(text) => `translations.${locale}.${text}` as const,
	),
);
const fieldOf = (path: string): Field | undefined => {
	if (Object.hasOwn(FIELD_OF, path))
		return FIELD_OF[path as keyof typeof FIELD_OF];
	return TEXT_FIELDS.find((field) => field === path);
};

export function ZoneForm({
	zone,
	onClose,
}: {
	zone?: AdminZone;
	onClose: () => void;
}) {
	const refresh = useRefreshZones();
	const moneyInput = useMoneyInput();
	const { data: store } = useSuspenseQuery(storeQuery);
	const stored = new Map(
		(zone?.translations ?? []).map((t) => [
			t.locale,
			{ name: t.name, description: t.description },
		]),
	);
	const schema = zoneSchema({
		amount: moneyInput.parse,
		creating: !zone,
		defaultLocale: store.defaultLocale,
		stored: new Set(stored.keys()),
	});

	const save = useMutation({
		mutationFn: (v: ZoneValues) => {
			const texts = changedTexts(v, stored);
			const fields = zoneFields(v, moneyInput.parse);
			if (!zone)
				return parseResponse(
					api().admin["shipping-zones"].$post({
						json: { slug: v.slug, ...fields, translations: texts },
					}),
				);
			return parseResponse(
				api().admin["shipping-zones"][":id"].$patch({
					param: { id: String(zone.id) },
					json: {
						...fields,
						...(Object.keys(texts).length > 0 ? { translations: texts } : {}),
					},
				}),
			);
		},
		onSuccess: refresh,
	});

	const form = useAppForm({
		defaultValues: {
			slug: "",
			method: zone?.method ?? "own_delivery",
			fee: zone ? moneyInput.toInput(zone.fee) : "",
			freeFrom: zone?.freeFrom != null ? moneyInput.toInput(zone.freeFrom) : "",
			deliveryDaysMin: String(zone?.deliveryDaysMin ?? 1),
			deliveryDaysMax: String(zone?.deliveryDaysMax ?? 2),
			position: String(zone?.position ?? 0),
			translations: {
				es: {
					name: stored.get("es")?.name ?? "",
					description: stored.get("es")?.description ?? "",
				},
				en: {
					name: stored.get("en")?.name ?? "",
					description: stored.get("en")?.description ?? "",
				},
			} satisfies Record<Locale, { name: string; description: string }>,
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					onClose();
					return null;
				} catch (error) {
					if (apiErrorOf(error)?.code === "duplicate_slug")
						return { fields: { slug: errorMessage(error) } };
					return serverErrors(error, fieldOf);
				}
			},
		},
	});

	return (
		<form
			noValidate
			className="grid gap-4"
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<div className="grid gap-3 sm:grid-cols-2">
					{!zone && (
						<div className="sm:col-span-2">
							<form.AppField name="slug">
								{(field) => (
									<field.TextField
										label={m.admin_zone_slug()}
										maxLength={80}
										autoCapitalize="none"
										autoComplete="off"
									/>
								)}
							</form.AppField>
						</div>
					)}
					<form.AppField name="method">
						{(field) => (
							<field.SelectField
								label={m.admin_zone_col_method()}
								options={SHIPPING_METHODS.map((method) => ({
									value: method,
									label: shippingMethodLabel[method](),
								}))}
							/>
						)}
					</form.AppField>
					<form.AppField name="position">
						{(field) => (
							<field.TextField
								label={m.admin_zone_position()}
								inputMode="numeric"
								maxLength={4}
							/>
						)}
					</form.AppField>
					<form.AppField name="fee">
						{(field) => <field.MoneyField label={m.admin_zone_fee()} />}
					</form.AppField>
					<form.AppField name="freeFrom">
						{(field) => <field.MoneyField label={m.admin_zone_free_from()} />}
					</form.AppField>
					<form.AppField name="deliveryDaysMin">
						{(field) => (
							<field.TextField
								label={m.admin_zone_days_min()}
								inputMode="numeric"
								maxLength={3}
							/>
						)}
					</form.AppField>
					<form.AppField name="deliveryDaysMax">
						{(field) => (
							<field.TextField
								label={m.admin_zone_days_max()}
								inputMode="numeric"
								maxLength={3}
							/>
						)}
					</form.AppField>
				</div>
				<form.Subscribe
					selector={(state) => ({
						attempted: state.submissionAttempts > 0,
						values: state.values,
					})}
				>
					{({ attempted, values }) => (
						<LocaleTabs
							defaultLocale={store.defaultLocale}
							invalid={
								attempted ? invalidLocales(schema.safeParse(values)) : []
							}
						>
							{(locale) => (
								<>
									<form.AppField name={`translations.${locale}.name`}>
										{(field) => (
											<field.TextField
												label={m.admin_field_name()}
												maxLength={80}
											/>
										)}
									</form.AppField>
									<form.AppField name={`translations.${locale}.description`}>
										{(field) => (
											<field.TextField
												label={m.admin_zone_description()}
												maxLength={300}
											/>
										)}
									</form.AppField>
								</>
							)}
						</LocaleTabs>
					)}
				</form.Subscribe>
				<form.FormError />
				<DialogFooter>
					<Button type="button" variant="outline" onClick={onClose}>
						{m.admin_cancel()}
					</Button>
					<form.SubmitButton>{m.admin_save()}</form.SubmitButton>
				</DialogFooter>
			</form.AppForm>
		</form>
	);
}

export function ZoneDialog({
	zone,
	onClose,
}: {
	zone?: AdminZone;
	onClose: () => void;
}) {
	const { data: store } = useSuspenseQuery(storeQuery);
	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-2xl"
			title={
				zone
					? m.admin_zone_edit_title({
							name:
								zone.translations.find((t) => t.locale === store.defaultLocale)
									?.name ?? zone.slug,
						})
					: m.admin_zone_new()
			}
		>
			<ZoneForm zone={zone} onClose={onClose} />
		</AdminDialog>
	);
}
