import type { Locale, PaymentMethod, ShippingMethod } from "#/db/schema";
import { formatCalendarDate } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { paymentLabel } from "#/lib/payment";
import { m } from "#/paraglide/messages";

export type ConfirmationInput = {
	storeName: string;
	code: string;
	locale: Locale;
	countryCode: string;
	currency: string;
	lines: {
		quantity: number;
		unitPrice: number;
		brandName: string;
		productName: string;
		sizeValue: number | null;
		sizeUnit: "ml" | "g" | "units" | null;
	}[];
	subtotal: number;
	discount: number;
	discountReason: string | null;
	shipping: number;
	shippingMethod: ShippingMethod;
	zoneName: string | null;
	total: number;
	paymentMethod: PaymentMethod;
	delivery: { from: string; to: string };
};

const methodLabel = {
	pickup: m.shipping_method_pickup,
	own_delivery: m.shipping_method_own_delivery,
	courier: m.shipping_method_courier,
} as const;

// Consumer law: sent by the next calendar day, with every price, shipping, total and the
// delivery time. Stored on the order exactly as sent.
export function confirmationMessage(input: ConfirmationInput): string {
	if (input.discount > 0 && !input.discountReason)
		throw new Error("A discount needs its reason");
	const opts = { locale: input.locale };
	const intl = intlLocale(input.locale, input.countryCode);
	const money = (n: number) => formatMoney(n, input.currency, intl);
	const date = (d: string) => formatCalendarDate(d, intl);
	const size = (l: ConfirmationInput["lines"][number]) =>
		l.sizeValue === null || l.sizeUnit === null
			? null
			: l.sizeUnit === "units"
				? m.size_units({ value: String(l.sizeValue) }, opts)
				: `${l.sizeValue} ${l.sizeUnit}`;
	const method = [methodLabel[input.shippingMethod]({}, opts), input.zoneName]
		.filter(Boolean)
		.join(", ");
	const { from, to } = input.delivery;
	const pickup = input.shippingMethod === "pickup";
	const delivery =
		from === to
			? (pickup
					? m.order_confirmation_pickup_day
					: m.order_confirmation_delivery_day)({ date: date(from) }, opts)
			: (pickup
					? m.order_confirmation_pickup_range
					: m.order_confirmation_delivery_range)(
					{ from: date(from), to: date(to) },
					opts,
				);
	return [
		m.order_confirmation_intro(
			{ store: input.storeName, code: input.code },
			opts,
		),
		...input.lines.map((l) =>
			[
				`• ${l.quantity} × ${[l.brandName, l.productName, size(l)].filter(Boolean).join(" ")}`,
				money(l.quantity * l.unitPrice),
			].join(": "),
		),
		m.order_confirmation_subtotal({ amount: money(input.subtotal) }, opts),
		input.discount > 0
			? m.order_confirmation_discount(
					{
						reason: String(input.discountReason),
						amount: money(input.discount),
					},
					opts,
				)
			: null,
		input.shipping > 0
			? m.order_confirmation_shipping(
					{ method, amount: money(input.shipping) },
					opts,
				)
			: m.order_confirmation_shipping_free({ method }, opts),
		m.order_confirmation_total({ amount: money(input.total) }, opts),
		m.order_confirmation_payment(
			{ method: paymentLabel[input.paymentMethod]({}, opts) },
			opts,
		),
		delivery,
	]
		.filter((x): x is string => x !== null)
		.join("\n");
}
