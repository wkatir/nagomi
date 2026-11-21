import { useStore } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Section } from "#/components/admin/section";
import { Badge } from "#/components/ui/badge";
import { api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { OrderedItem } from "../merchandising/ordered-item";
import { ProductSearch } from "../merchandising/product-search";
import { useRefresh } from "../merchandising/status-change";
import { type RoutineDetail, routinesKeys } from "./queries";
import { variantChoices } from "./variant-choices";

// The API's limit.
const MAX_STEPS = 12;

const step = z.object({
	variantId: z.number(),
	label: z.string(),
	sku: z.string(),
	archived: z.boolean(),
});

// Saved together: the API replaces the whole list.
export function RoutineSteps({ routine }: { routine: RoutineDetail }) {
	const refresh = useRefresh(routinesKeys.all);

	const schema = z
		.object({ items: z.array(step) })
		.superRefine((value, ctx) => {
			if (value.items.length > MAX_STEPS)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.admin_routine_steps_max({ max: MAX_STEPS }),
				});
			if (routine.status === "published" && value.items.length === 0)
				ctx.addIssue({
					code: "custom",
					path: [],
					message: m.error_routine_requires_items(),
				});
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.routines[":id"].items.$put({
					param: { id: String(routine.id) },
					json: { variantIds: value.items.map((item) => item.variantId) },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: {
			items: routine.items.map((item) => ({
				variantId: item.variantId,
				label: item.name ?? item.sku,
				sku: item.sku,
				archived: item.variantStatus !== "active",
			})),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, () => undefined);
				}
			},
		},
	});
	const items = useStore(form.store, (state) => state.values.items);

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
					title={m.admin_routine_steps()}
					action={
						<form.Subscribe selector={(state) => state.isDefaultValue}>
							{(unchanged) => (
								<form.SubmitButton
									size="sm"
									variant="outline"
									disabled={unchanged}
								>
									{m.admin_routine_save_steps()}
								</form.SubmitButton>
							)}
						</form.Subscribe>
					}
				>
					<div className="grid gap-4 p-admin-card">
						<ProductSearch
							choices={variantChoices}
							added={new Set(items.map((item) => item.variantId))}
							onPick={(choice) =>
								form.pushFieldValue("items", {
									variantId: choice.key,
									label: choice.label,
									sku: choice.hint,
									archived: false,
								})
							}
						/>
						<form.AppField name="items" mode="array">
							{(list) =>
								list.state.value.length === 0 ? (
									<p className="type-small text-muted-foreground">
										{m.admin_routine_steps_empty()}
									</p>
								) : (
									<ol className="rounded-md border">
										{list.state.value.map((item, index) => (
											<OrderedItem
												key={item.variantId}
												position={index + 1}
												name={item.label}
												hint={item.sku}
												note={
													item.archived && (
														<Badge variant="outline">
															{m.admin_routine_size_archived()}
														</Badge>
													)
												}
												first={index === 0}
												last={index === list.state.value.length - 1}
												onUp={() => list.moveValue(index, index - 1)}
												onDown={() => list.moveValue(index, index + 1)}
												onRemove={() => list.removeValue(index)}
											/>
										))}
									</ol>
								)
							}
						</form.AppField>
						<form.FormError />
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
