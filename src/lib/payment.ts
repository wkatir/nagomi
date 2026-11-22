import { m } from "#/paraglide/messages";

export const paymentLabel = {
	card: m.payment_method_card,
	bank_transfer: m.payment_method_bank_transfer,
	cash_on_delivery: m.payment_method_cash_on_delivery,
	payment_link: m.payment_method_payment_link,
	cash: m.payment_method_cash,
} as const;

export const paymentMethodList = (
	methods: readonly (keyof typeof paymentLabel)[],
	locale: string,
) =>
	new Intl.ListFormat(locale, { type: "disjunction" }).format(
		methods.map((method) => paymentLabel[method]().toLowerCase()),
	);
