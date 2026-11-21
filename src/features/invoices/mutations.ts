import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { z } from "zod";
import { orderQuery } from "#/features/orders/queries";
import { api, parseResponse } from "#/lib/api";
import type {
	issueInvoiceInput,
	voidInvoiceInput,
} from "#/lib/schemas/invoices";
import { m } from "#/paraglide/messages";
import { invoicesKeys } from "./queries";

type Document = { id: number; orderId: number };

// A document change also refreshes its order's card and trail.
export function useRefreshInvoices(orderId: number) {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: invoicesKeys.all }),
			queryClient.invalidateQueries({ queryKey: orderQuery(orderId).queryKey }),
		]);
}

// The dialog shows a refusal on its form.
export function useIssueInvoice(orderId: number) {
	const refresh = useRefreshInvoices(orderId);
	return useMutation({
		mutationFn: (json: z.input<typeof issueInvoiceInput>) =>
			parseResponse(
				api().admin.invoices.orders[":id"].$post({
					param: { id: String(orderId) },
					json,
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_invoice_sent());
		},
	});
}

// The caller decides whether a failure is said (the button) or not (the automatic
// follow-up).
export function useCheckInvoice(doc: Document) {
	const refresh = useRefreshInvoices(doc.orderId);
	return useMutation({
		mutationFn: () =>
			parseResponse(
				api().admin.invoices[":id"].refresh.$post({
					param: { id: String(doc.id) },
				}),
			),
		onSettled: refresh,
	});
}

export function useVoidInvoice(doc: Document) {
	const refresh = useRefreshInvoices(doc.orderId);
	return useMutation({
		mutationFn: (json: z.input<typeof voidInvoiceInput>) =>
			parseResponse(
				api().admin.invoices[":id"].void.$post({
					param: { id: String(doc.id) },
					json,
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_invoice_voided());
		},
	});
}
