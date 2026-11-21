import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import { isCalendarDate, localDate } from "#/lib/dates";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { useRefreshAfterPurchaseChange } from "./mutations";
import type { Purchase } from "./queries";

const schema = z.object({
	orderedOn: z.string().refine(isCalendarDate, m.admin_required()),
});

export function PlacePurchaseDialog({
	purchase,
	onClose,
}: {
	purchase: Purchase;
	onClose: () => void;
}) {
	const refresh = useRefreshAfterPurchaseChange();
	const { data: store } = useSuspenseQuery(storeQuery);

	const place = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin["purchase-orders"][":id"].order.$post({
					param: { id: String(purchase.id) },
					json: { orderedOn: value.orderedOn },
				}),
			),
		onSuccess: async () => {
			await refresh();
			onClose();
		},
	});

	const form = useAppForm({
		defaultValues: { orderedOn: localDate(new Date(), store.timeZone) },
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await place.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, (path) =>
						path === "orderedOn" ? "orderedOn" : undefined,
					);
				}
			},
		},
	});

	return (
		<AdminDialog
			onClose={onClose}
			title={m.admin_purchase_place_title({ reference: purchase.reference })}
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
					<p className="type-small text-muted-foreground">
						{m.admin_purchase_place_help()}
					</p>
					<form.AppField name="orderedOn">
						{(field) => (
							<field.DateField label={m.admin_purchase_ordered_on()} />
						)}
					</form.AppField>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_purchase_place()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
