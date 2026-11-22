import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { shippingMethodLabel } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { activeZonesQuery } from "#/features/shipping/queries";
import { useMoney, useMoneyInput } from "#/hooks/use-money";
import { type AdminOrder, api, parseResponse } from "#/lib/api";
import { addDays, localDate } from "#/lib/dates";
import { PAYMENT_METHODS, SHIPPING_METHODS } from "#/lib/enums";
import { paymentLabel } from "#/lib/payment";
import { storeQuery } from "#/lib/queries";
import { calendarDate } from "#/lib/schemas/dates";
import { m } from "#/paraglide/messages";
import { useRefreshAfterOrderChange } from "./mutations";

const FIELD_OF = {
	paymentMethod: "paymentMethod",
	shippingMethod: "shippingMethod",
	shippingZoneId: "zoneId",
	shippingFee: "fee",
	discount: "discount",
	discountReason: "discountReason",
	deliveryFrom: "deliveryFrom",
	deliveryTo: "deliveryTo",
	shipTo: "shipTo",
	"customer.name": "customerName",
	"customer.phone": "phone",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

export function ConfirmOrderDialog({
	order,
	onClose,
}: {
	order: AdminOrder["order"];
	onClose: () => void;
}) {
	const refresh = useRefreshAfterOrderChange();
	const money = useMoney();
	const moneyInput = useMoneyInput();
	const { data: store } = useSuspenseQuery(storeQuery);
	const { data: zones } = useSuspenseQuery(activeZonesQuery);
	const today = localDate(new Date(), store.timeZone);
	const methods = store.paymentMethods;

	// Active zones always have a default-locale name (the API refuses to activate one without it).
	const zoneName = (zone: (typeof zones)[number]) => {
		const text = zone.translations.find(
			(t) => t.locale === store.defaultLocale,
		);
		if (!text)
			throw new Error(
				`Shipping zone ${zone.id} has no ${store.defaultLocale} name`,
			);
		return text.name;
	};

	const amount = (text: string) => moneyInput.parse(text);
	const schema = z
		.object({
			paymentMethod: z.enum(PAYMENT_METHODS, m.admin_required()),
			paid: z.boolean(),
			shippingMethod: z.enum(SHIPPING_METHODS),
			zoneId: z.string(),
			fee: z.string(),
			discount: z.string(),
			discountReason: z.string().trim().max(120),
			deliveryFrom: calendarDate.refine(Boolean, m.admin_required()),
			deliveryTo: calendarDate.refine(Boolean, m.admin_required()),
			shipTo: z.string().trim().max(500),
			customerName: z.string().trim().max(80),
			phone: z.string().trim().max(30),
		})
		.superRefine((v, ctx) => {
			const issue = (path: Field, message: string) =>
				ctx.addIssue({ code: "custom", path: [path], message });
			if (v.fee.trim() !== "" && amount(v.fee) === null)
				issue("fee", m.admin_invalid_amount());
			if (v.discount.trim() !== "" && amount(v.discount) === null)
				issue("discount", m.admin_invalid_amount());
			if (
				v.shippingMethod !== "pickup" &&
				v.zoneId === "" &&
				v.fee.trim() === ""
			)
				issue("fee", m.admin_shipping_fee_required());
			if ((amount(v.discount) ?? 0) > 0 && v.discountReason === "")
				issue("discountReason", m.admin_discount_needs_reason());
			if (v.deliveryFrom > v.deliveryTo)
				issue("deliveryTo", m.admin_delivery_range());
			if (v.phone !== "" && v.customerName === "")
				issue("customerName", m.admin_phone_needs_name());
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const fee = value.fee.trim() === "" ? undefined : amount(value.fee);
			const discount =
				value.discount.trim() === "" ? undefined : amount(value.discount);
			return parseResponse(
				api().admin.orders[":id"].confirm.$post({
					param: { id: String(order.id) },
					json: {
						paymentMethod: value.paymentMethod,
						paid: value.paid,
						shippingMethod: value.shippingMethod,
						shippingZoneId: value.zoneId ? Number(value.zoneId) : undefined,
						shippingFee: value.zoneId ? undefined : (fee ?? undefined),
						deliveryFrom: value.deliveryFrom,
						deliveryTo: value.deliveryTo,
						// Blank keeps the order's discount (its discount code's, or none).
						discount: discount ?? undefined,
						discountReason: value.discountReason || undefined,
						shipTo: value.shipTo || undefined,
						customer: value.phone
							? { name: value.customerName, phone: value.phone }
							: undefined,
					},
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: {
			paymentMethod: methods[0] ?? "",
			paid: false,
			shippingMethod: "own_delivery" as (typeof SHIPPING_METHODS)[number],
			zoneId: "",
			fee: "",
			discount: "",
			discountReason: "",
			deliveryFrom: addDays(today, 1),
			deliveryTo: addDays(today, 1),
			shipTo: "",
			customerName: order.customerName ?? "",
			phone: order.customerPhone ?? "",
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
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-2xl"
			title={m.admin_order_confirm_title({ code: order.code })}
		>
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
						<form.AppField name="paymentMethod">
							{(field) => (
								<field.SelectField
									label={m.admin_order_payment_method()}
									options={methods.map((method) => ({
										value: method,
										label: paymentLabel[method](),
									}))}
								/>
							)}
						</form.AppField>
						<form.AppField
							name="shippingMethod"
							listeners={{ onChange: () => form.setFieldValue("zoneId", "") }}
						>
							{(field) => (
								<field.SelectField
									label={m.admin_order_shipping_method()}
									options={SHIPPING_METHODS.map((method) => ({
										value: method,
										label: shippingMethodLabel[method](),
									}))}
								/>
							)}
						</form.AppField>
						<form.Subscribe
							selector={(state) =>
								[state.values.shippingMethod, state.values.zoneId] as const
							}
						>
							{([shippingMethod, zoneId]) =>
								shippingMethod !== "pickup" && (
									<>
										<form.AppField
											name="zoneId"
											listeners={{
												onChange: ({ value }) => {
													const zone = zones.find(
														(z) => String(z.id) === value,
													);
													if (!zone) return;
													form.setFieldValue(
														"deliveryFrom",
														addDays(today, zone.deliveryDaysMin),
													);
													form.setFieldValue(
														"deliveryTo",
														addDays(today, zone.deliveryDaysMax),
													);
												},
											}}
										>
											{(field) => (
												<field.SelectField
													label={m.admin_order_shipping_zone()}
													options={[
														{
															value: "",
															label: m.admin_order_shipping_zone_none(),
														},
														...zones
															.filter((z) => z.method === shippingMethod)
															.map((zone) => ({
																value: String(zone.id),
																label: `${zoneName(zone)} · ${money(zone.fee)}`,
															})),
													]}
												/>
											)}
										</form.AppField>
										{zoneId === "" && (
											<form.AppField name="fee">
												{(field) => (
													<field.MoneyField label={m.admin_order_shipping()} />
												)}
											</form.AppField>
										)}
									</>
								)
							}
						</form.Subscribe>
						<form.AppField name="deliveryFrom">
							{(field) => (
								<field.DateField label={m.admin_order_delivery_from()} />
							)}
						</form.AppField>
						<form.AppField name="deliveryTo">
							{(field) => (
								<field.DateField label={m.admin_order_delivery_to()} />
							)}
						</form.AppField>
						<form.AppField name="discount">
							{(field) => <field.MoneyField label={m.admin_order_discount()} />}
						</form.AppField>
						<form.AppField name="discountReason">
							{(field) => (
								<field.TextField
									label={m.admin_order_discount_reason()}
									maxLength={120}
								/>
							)}
						</form.AppField>
						<form.AppField name="customerName">
							{(field) => (
								<field.TextField
									label={m.admin_order_customer()}
									maxLength={80}
								/>
							)}
						</form.AppField>
						<form.AppField name="phone">
							{(field) => (
								<field.TextField
									label={m.admin_order_phone()}
									inputMode="tel"
									maxLength={30}
								/>
							)}
						</form.AppField>
						<form.Subscribe selector={(state) => state.values.shippingMethod}>
							{(shippingMethod) =>
								shippingMethod !== "pickup" && (
									<div className="sm:col-span-2">
										<form.AppField name="shipTo">
											{(field) => (
												<field.TextField
													label={m.admin_order_ship_to()}
													maxLength={500}
												/>
											)}
										</form.AppField>
									</div>
								)
							}
						</form.Subscribe>
						<div className="sm:col-span-2">
							<form.AppField name="paid">
								{(field) => (
									<field.CheckboxField label={m.admin_order_already_paid()} />
								)}
							</form.AppField>
						</div>
					</div>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_order_confirm()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
