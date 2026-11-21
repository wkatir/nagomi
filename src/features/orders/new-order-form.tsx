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
import { channelLabel } from "#/components/admin/labels";
import { Panel } from "#/components/admin/panel";
import { Section } from "#/components/admin/section";
import { Button } from "#/components/ui/button";
import { useIdempotencyKey } from "#/hooks/use-idempotency-key";
import { useMoney } from "#/hooks/use-money";
import { api, parseResponse } from "#/lib/api";
import { ORDER_CHANNELS } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { useRefreshAfterOrderChange } from "./mutations";
import { OrderLineRow } from "./order-line-row";
import { type PickedVariant, VariantPicker } from "./variant-picker";

type Line = PickedVariant & { quantity: string };

const FIELD_OF = {
	channel: "channel",
	notes: "notes",
	"customer.name": "customerName",
	"customer.phone": "phone",
} as const;
type Field = (typeof FIELD_OF)[keyof typeof FIELD_OF];
const fieldOf = (path: string): Field | undefined =>
	Object.hasOwn(FIELD_OF, path)
		? FIELD_OF[path as keyof typeof FIELD_OF]
		: undefined;

// The sale is created pending, like the store's own orders, and confirmed from its page.
export function NewOrderForm() {
	const navigate = useNavigate();
	const refresh = useRefreshAfterOrderChange();
	const money = useMoney();
	const { data: store } = useSuspenseQuery(storeQuery);

	const schema = z
		.object({
			lines: z.array(
				z.object({
					variantId: z.number(),
					label: z.string(),
					price: z.number(),
					available: z.number(),
					quantity: z.string(),
				}),
			),
			channel: z.enum(ORDER_CHANNELS),
			customerName: z.string().trim().max(80),
			phone: z.string().trim().max(30),
			notes: z.string().trim().max(500),
		})
		.superRefine((value, ctx) => {
			if (value.lines.length === 0)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.admin_order_needs_lines(),
				});
			value.lines.forEach((line, index) => {
				const max = Math.min(line.available, store.maxQuantityPerLine);
				const quantity = Number(line.quantity);
				if (!/^\d+$/.test(line.quantity) || quantity < 1 || quantity > max)
					ctx.addIssue({
						code: "custom",
						path: ["lines", index, "quantity"],
						message: m.admin_order_quantity_invalid({ max }),
					});
			});
			if (value.phone !== "" && value.customerName === "")
				ctx.addIssue({
					code: "custom",
					path: ["customerName"],
					message: m.admin_phone_needs_name(),
				});
		});

	const request = (value: z.output<typeof schema>) => ({
		channel: value.channel,
		items: value.lines.map((line) => ({
			variantId: line.variantId,
			quantity: Number(line.quantity),
		})),
		customer: value.customerName
			? { name: value.customerName, phone: value.phone || undefined }
			: undefined,
		notes: value.notes || undefined,
	});

	const form = useAppForm({
		defaultValues: {
			lines: [] as Line[],
			channel: "in_person" as (typeof ORDER_CHANNELS)[number],
			customerName: "",
			phone: "",
			notes: "",
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await create.mutateAsync(request(schema.parse(value)));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});
	const values = useStore(form.store, (state) => state.values);
	// A retry of the same sale (a second click, a dropped connection) is the same order.
	const idempotencyKey = useIdempotencyKey(values);

	const create = useMutation({
		mutationFn: (body: ReturnType<typeof request>) =>
			parseResponse(
				api().admin.orders.$post({ json: { ...body, idempotencyKey } }),
			),
		onSuccess: async (order) => {
			await refresh();
			await navigate({ to: "/admin/orders/$id", params: { id: order.id } });
		},
	});

	const total = values.lines.reduce(
		(sum, line) => sum + line.price * (Number(line.quantity) || 0),
		0,
	);

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
								<form.AppField name="channel">
									{(field) => (
										<field.SelectField
											label={m.admin_order_channel()}
											options={ORDER_CHANNELS.map((channel) => ({
												value: channel,
												label: channelLabel[channel](),
											}))}
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
								<form.AppField name="notes">
									{(field) => (
										<field.TextareaField
											label={m.admin_order_notes()}
											maxLength={500}
										/>
									)}
								</form.AppField>
								<form.FormError />
								<div className="flex justify-end gap-2">
									<Button variant="outline" asChild>
										<Link to="/admin/orders">{m.admin_cancel()}</Link>
									</Button>
									<form.SubmitButton>
										{m.admin_order_create()}
									</form.SubmitButton>
								</div>
							</div>
						</Panel>
					}
				>
					<Section title={m.admin_order_lines()}>
						<div className="grid gap-4 p-admin-card">
							<VariantPicker
								picked={new Set(values.lines.map((line) => line.variantId))}
								onPick={(variant) =>
									form.pushFieldValue("lines", { ...variant, quantity: "1" })
								}
							/>
							<form.AppField name="lines" mode="array">
								{(list) => (
									<>
										{list.state.value.map((line, index) => (
											<OrderLineRow
												key={line.variantId}
												label={line.label}
												hint={`${money(line.price)} · ${m.admin_stock_n({ count: line.available })}`}
												onRemove={() => list.removeValue(index)}
												quantity={
													<form.AppField name={`lines[${index}].quantity`}>
														{(quantity) => (
															<quantity.TextField
																label={m.admin_quantity()}
																inputMode="numeric"
															/>
														)}
													</form.AppField>
												}
											/>
										))}
									</>
								)}
							</form.AppField>
						</div>
						<p className="flex justify-between border-t p-admin-card font-bold tabular-nums">
							<span>{m.admin_order_total()}</span>
							<span>{money(total)}</span>
						</p>
					</Section>
				</DetailColumns>
			</form.AppForm>
		</form>
	);
}
