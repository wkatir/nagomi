import { useStore } from "@tanstack/react-form";
import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { DetailColumns } from "#/components/admin/detail-layout";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Panel } from "#/components/admin/panel";
import { Section } from "#/components/admin/section";
import { SizePicker } from "#/components/admin/size-picker";
import { Button } from "#/components/ui/button";
import { supplierOptionsQuery } from "#/features/suppliers/queries";
import { useMoney, useMoneyInput } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { isCalendarDate } from "#/lib/dates";
import { m } from "#/paraglide/messages";
import { useRefreshAfterPurchaseChange } from "./mutations";
import { PurchaseLineRow } from "./purchase-line-row";
import {
	checkPurchaseLines,
	lineFieldOf,
	linesTotal,
	type PurchaseLine,
	toRequestItems,
} from "./purchase-lines";
import { type TaxChoice, taxOfChoice, taxOptions } from "./tax";

const FIELD_OF = {
	supplierId: "supplierId",
	reference: "reference",
	orderedOn: "orderedOn",
	taxIncluded: "tax",
	notes: "notes",
} as const;
const fieldOf = (path: string) =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: lineFieldOf(path);

// Without an order date it is saved as a draft. Shipping is not here: it comes with each delivery,
// spread over its lots as landed cost.
export function NewPurchaseForm({
	supplierId,
}: {
	supplierId: number | undefined;
}) {
	const navigate = useNavigate();
	const refresh = useRefreshAfterPurchaseChange();
	const money = useMoney();
	const moneyInput = useMoneyInput();
	// An archived supplier takes no new purchase orders.
	const { data: suppliers } = useSuspenseQuery(supplierOptionsQuery("active"));

	const schema = z
		.object({
			supplierId: z
				.string()
				.refine(
					(id) => suppliers.some((supplier) => String(supplier.id) === id),
					m.admin_required(),
				),
			reference: z.string().trim().min(1, m.admin_required()).max(40),
			orderedOn: z
				.string()
				.refine((day) => day === "" || isCalendarDate(day), m.admin_required()),
			tax: z.enum(["", "included", "excluded"]),
			notes: z.string().trim().max(1000),
			lines: z.array(
				z.object({
					id: z.number().nullable(),
					variantId: z.number(),
					sku: z.string(),
					label: z.string(),
					quantity: z.string(),
					unitCost: z.string(),
				}),
			),
		})
		.superRefine((value, ctx) =>
			checkPurchaseLines(value.lines, ctx, moneyInput.parse),
		);

	const create = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin["purchase-orders"].$post({
					json: {
						supplierId: Number(value.supplierId),
						reference: value.reference,
						orderedOn: value.orderedOn || undefined,
						taxIncluded: taxOfChoice(value.tax),
						notes: value.notes || undefined,
						items: toRequestItems(value.lines, moneyInput.parse),
					},
				}),
			),
		onSuccess: async (created) => {
			await refresh();
			await navigate({
				to: "/admin/purchases/$id",
				params: { id: created.id },
			});
		},
	});

	const form = useAppForm({
		defaultValues: {
			supplierId: supplierId === undefined ? "" : String(supplierId),
			reference: "",
			orderedOn: "",
			tax: "" as TaxChoice,
			notes: "",
			lines: [] as PurchaseLine[],
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await create.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});
	const lines = useStore(form.store, (state) => state.values.lines);

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<DetailColumns
					wideAside
					aside={
						<Panel>
							<div className="grid gap-3 p-admin-card">
								<form.AppField name="supplierId">
									{(field) => (
										<field.ComboboxField
											label={m.admin_purchase_supplier()}
											options={suppliers.map((supplier) => ({
												value: String(supplier.id),
												label: supplier.name,
												hint:
													supplier.leadTimeDays === null
														? undefined
														: m.admin_supplier_lead_days({
																count: supplier.leadTimeDays,
															}),
											}))}
										/>
									)}
								</form.AppField>
								<form.AppField name="reference">
									{(field) => (
										<field.TextField
											label={m.admin_purchase_reference()}
											maxLength={40}
										/>
									)}
								</form.AppField>
								<form.AppField name="orderedOn">
									{(field) => (
										<field.DateField
											label={m.admin_purchase_ordered_on_optional()}
										/>
									)}
								</form.AppField>
								<form.AppField name="tax">
									{(field) => (
										<field.SelectField
											label={m.admin_purchase_tax()}
											options={taxOptions()}
										/>
									)}
								</form.AppField>
								<form.AppField name="notes">
									{(field) => (
										<field.TextareaField
											label={m.admin_supplier_field_notes()}
											maxLength={1000}
										/>
									)}
								</form.AppField>
								<form.FormError />
								<div className="flex justify-end gap-2">
									<Button variant="outline" asChild>
										<Link to="/admin/purchases">{m.admin_cancel()}</Link>
									</Button>
									<form.SubmitButton>
										{m.admin_purchase_create()}
									</form.SubmitButton>
								</div>
							</div>
						</Panel>
					}
				>
					<Section title={m.admin_purchase_lines()}>
						<div className="border-b p-admin-card">
							<SizePicker
								picked={new Set(lines.map((line) => line.variantId))}
								placeholder={m.admin_purchase_find_size()}
								onPick={(size) =>
									form.pushFieldValue("lines", {
										id: null,
										variantId: size.variantId,
										sku: size.sku,
										label: size.label,
										quantity: "1",
										unitCost: "",
									})
								}
							/>
						</div>
						<form.AppField name="lines" mode="array">
							{(list) => (
								<ul>
									{list.state.value.map((line, index) => (
										<PurchaseLineRow
											key={line.variantId}
											label={line.label}
											sku={line.sku}
											total={money(linesTotal([line], moneyInput.parse))}
											onRemove={() => list.removeValue(index)}
											quantity={
												<form.AppField name={`lines[${index}].quantity`}>
													{(field) => (
														<field.TextField
															label={m.admin_quantity()}
															inputMode="numeric"
														/>
													)}
												</form.AppField>
											}
											unitCost={
												<form.AppField name={`lines[${index}].unitCost`}>
													{(field) => (
														<field.MoneyField
															label={m.admin_purchase_unit_cost()}
														/>
													)}
												</form.AppField>
											}
										/>
									))}
								</ul>
							)}
						</form.AppField>
						<p className="flex justify-between p-admin-card font-bold tabular-nums">
							<span>{m.admin_order_total()}</span>
							<span>{money(linesTotal(lines, moneyInput.parse))}</span>
						</p>
					</Section>
				</DetailColumns>
			</form.AppForm>
		</form>
	);
}
