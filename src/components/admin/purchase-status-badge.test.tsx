import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PURCHASE_ORDER_STATUSES } from "#/lib/enums";
import { purchaseStatusLabel } from "./labels";
import { PurchaseStatusBadge } from "./purchase-status-badge";

const html = (status: (typeof PURCHASE_ORDER_STATUSES)[number]) =>
	renderToStaticMarkup(<PurchaseStatusBadge status={status} />);

test("names every state of a purchase order", () => {
	for (const status of PURCHASE_ORDER_STATUSES)
		expect(html(status)).toContain(purchaseStatusLabel[status]());
});

test("a draft stands back, a cancelled one is outlined and the rest stand out", () => {
	expect(html("draft")).toContain('data-variant="secondary"');
	expect(html("cancelled")).toContain('data-variant="outline"');
	for (const status of ["ordered", "partially_received", "received"] as const)
		expect(html(status)).toContain('data-variant="default"');
});
