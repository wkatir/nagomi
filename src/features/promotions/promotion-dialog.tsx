import {
	useMutation,
	useQueryClient,
	useSuspenseQuery,
} from "@tanstack/react-query";
import { LockIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import { invalidLocales } from "#/components/admin/form/translations";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import {
	promotionStatusLabel,
	promotionTypeLabel,
} from "#/components/admin/labels";
import { Panel } from "#/components/admin/panel";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { useMoney, useMoneyInput } from "#/hooks/use-money";
import { api, apiErrorOf, parseResponse } from "#/lib/api";
import {
	LOCALES,
	type Locale,
	PROMOTION_STATUSES,
	PROMOTION_TYPES,
} from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import {
	changedTexts,
	type PromotionValues,
	promotionSchema,
	promotionSettings,
	promotionTerms,
} from "./promotion-form";
import { type AdminPromotion, promotionsKeys } from "./queries";

const FIELD_OF = {
	code: "code",
	type: "type",
	value: "value",
	minSubtotal: "minSubtotal",
	startsOn: "startsOn",
	endsOn: "endsOn",
	usageLimit: "usageLimit",
	perCustomerLimit: "oncePerCustomer",
	firstOrderOnly: "firstOrderOnly",
	status: "status",
} as const;
type Field =
	| (typeof FIELD_OF)[keyof typeof FIELD_OF]
	| `translations.${Locale}.description`;
const fieldOf = (path: string): Field | undefined => {
	if (Object.hasOwn(FIELD_OF, path))
		return FIELD_OF[path as keyof typeof FIELD_OF];
	return LOCALES.map(
		(locale) => `translations.${locale}.description` as const,
	).find((field) => field === path);
};

const Fixed = ({ label, value }: { label: string; value: ReactNode }) => (
	<div className="grid gap-0.5">
		<dt className="type-meta text-muted-foreground">{label}</dt>
		<dd className="type-small font-bold">{value}</dd>
	</div>
);

export function PromotionForm({
	promotion,
	onClose,
}: {
	promotion?: AdminPromotion;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const money = useMoney();
	const moneyInput = useMoneyInput();
	const { data: store } = useSuspenseQuery(storeQuery);
	const locked = promotion?.termsLocked ?? false;
	const stored = new Map(
		(promotion?.translations ?? []).map((t) => [t.locale, t.description]),
	);
	const schema = promotionSchema({
		amount: moneyInput.parse,
		locked,
		defaultLocale: store.defaultLocale,
		stored: new Set(stored.keys()),
	});

	const save = useMutation({
		mutationFn: (v: PromotionValues) => {
			const texts = changedTexts(v, stored);
			if (!promotion)
				return parseResponse(
					api().admin.promotions.$post({
						json: {
							...promotionTerms(v, moneyInput.parse),
							...promotionSettings(v),
							translations: texts,
						},
					}),
				);
			return parseResponse(
				api().admin.promotions[":id"].$patch({
					param: { id: String(promotion.id) },
					json: {
						...(locked ? {} : promotionTerms(v, moneyInput.parse)),
						...promotionSettings(v),
						...(Object.keys(texts).length > 0 ? { translations: texts } : {}),
					},
				}),
			);
		},
		onSuccess: () =>
			queryClient.invalidateQueries({ queryKey: promotionsKeys.all }),
	});

	const form = useAppForm({
		defaultValues: {
			code: promotion?.code ?? "",
			type: promotion?.type ?? "percentage",
			value: promotion
				? promotion.type === "percentage"
					? String(promotion.value)
					: moneyInput.toInput(promotion.value)
				: "",
			minSubtotal:
				promotion?.minSubtotal != null
					? moneyInput.toInput(promotion.minSubtotal)
					: "",
			startsOn: promotion?.startsOn ?? "",
			endsOn: promotion?.endsOn ?? "",
			usageLimit:
				promotion?.usageLimit != null ? String(promotion.usageLimit) : "",
			oncePerCustomer: promotion?.perCustomerLimit != null,
			firstOrderOnly: promotion?.firstOrderOnly ?? false,
			status: promotion?.status ?? "inactive",
			translations: {
				es: { description: stored.get("es") ?? "" },
				en: { description: stored.get("en") ?? "" },
			} satisfies Record<Locale, { description: string }>,
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
					if (apiErrorOf(error)?.code === "duplicate_code")
						return { fields: { code: errorMessage(error) } };
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
				{promotion && locked ? (
					<div className="grid gap-3">
						<Alert>
							<LockIcon aria-hidden />
							<AlertDescription>{m.admin_promotion_locked()}</AlertDescription>
						</Alert>
						<Panel>
							<dl className="grid gap-3 p-3 sm:grid-cols-2">
								<Fixed
									label={m.admin_promotion_col_code()}
									value={promotion.code}
								/>
								<Fixed
									label={m.admin_promotion_type()}
									value={promotionTypeLabel[promotion.type]()}
								/>
								<Fixed
									label={
										promotion.type === "percentage"
											? m.admin_promotion_value_percentage()
											: m.admin_promotion_value_fixed()
									}
									value={
										promotion.type === "percentage"
											? `${promotion.value}%`
											: money(promotion.value)
									}
								/>
								<Fixed
									label={m.admin_promotion_min_subtotal()}
									value={
										promotion.minSubtotal === null
											? m.admin_promotion_none()
											: money(promotion.minSubtotal)
									}
								/>
							</dl>
						</Panel>
					</div>
				) : (
					<div className="grid gap-3 sm:grid-cols-2">
						<form.AppField name="code">
							{(field) => (
								<field.TextField
									label={m.admin_promotion_col_code()}
									className="uppercase"
									maxLength={32}
									autoCapitalize="characters"
									autoComplete="off"
								/>
							)}
						</form.AppField>
						<form.AppField
							name="type"
							listeners={{ onChange: () => form.setFieldValue("value", "") }}
						>
							{(field) => (
								<field.SelectField
									label={m.admin_promotion_type()}
									options={PROMOTION_TYPES.map((type) => ({
										value: type,
										label: promotionTypeLabel[type](),
									}))}
								/>
							)}
						</form.AppField>
						<form.Subscribe selector={(state) => state.values.type}>
							{(type) => (
								<form.AppField name="value">
									{(field) =>
										type === "percentage" ? (
											<field.TextField
												label={m.admin_promotion_value_percentage()}
												inputMode="numeric"
												maxLength={3}
											/>
										) : (
											<field.MoneyField
												label={m.admin_promotion_value_fixed()}
											/>
										)
									}
								</form.AppField>
							)}
						</form.Subscribe>
						<form.AppField name="minSubtotal">
							{(field) => (
								<field.MoneyField label={m.admin_promotion_min_subtotal()} />
							)}
						</form.AppField>
					</div>
				)}
				<div className="grid gap-3 sm:grid-cols-2">
					<form.AppField name="startsOn">
						{(field) => (
							<field.DateField label={m.admin_promotion_starts_on()} />
						)}
					</form.AppField>
					<form.AppField name="endsOn">
						{(field) => <field.DateField label={m.admin_promotion_ends_on()} />}
					</form.AppField>
					<form.AppField name="usageLimit">
						{(field) => (
							<field.TextField
								label={m.admin_promotion_usage_limit()}
								inputMode="numeric"
								maxLength={7}
							/>
						)}
					</form.AppField>
					{!locked && (
						<>
							<form.AppField name="oncePerCustomer">
								{(field) => (
									<field.CheckboxField
										label={m.admin_promotion_once_per_customer()}
									/>
								)}
							</form.AppField>
							<form.AppField name="firstOrderOnly">
								{(field) => (
									<field.CheckboxField
										label={m.admin_promotion_first_order_only()}
									/>
								)}
							</form.AppField>
						</>
					)}
					<form.AppField name="status">
						{(field) => (
							<field.SelectField
								label={m.admin_col_status()}
								options={PROMOTION_STATUSES.filter(
									(status) => promotion || status !== "archived",
								).map((status) => ({
									value: status,
									label: promotionStatusLabel[status](),
								}))}
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
								<form.AppField name={`translations.${locale}.description`}>
									{(field) => (
										<field.TextField
											label={m.admin_field_description()}
											maxLength={200}
										/>
									)}
								</form.AppField>
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

export function PromotionDialog({
	promotion,
	onClose,
}: {
	promotion?: AdminPromotion;
	onClose: () => void;
}) {
	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-2xl"
			title={
				promotion
					? m.admin_promotion_edit_title({ code: promotion.code })
					: m.admin_promotion_new()
			}
		>
			<PromotionForm promotion={promotion} onClose={onClose} />
		</AdminDialog>
	);
}
