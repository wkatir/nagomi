// The provider takes unit prices WITHOUT IVA (up to 4 decimals) and adds the IVA itself;
// catalogue prices include it, so each line's price is divided by 1.13 here. Discounts go
// into the line prices: the API's global discount is an amount net of IVA with 2
// decimals, which would put the total a cent off about half the time. The provider checks
// that `pagos` adds up to its total before emitting anything, so a price that rounds to
// another total is refused instead of invoiced.
import type {
	DteType,
	Locale,
	OrderStatus,
	PaymentMethod,
	TaxDocumentStatus,
} from "#/db/schema";
import { m } from "#/paraglide/messages";
import { amountOwed } from "./payments";

// Ley IVA Art. 54.
const IVA_PERCENT = 13n;
// Unit prices travel in ten-thousandths of a dollar (the API's 4 decimals).
const E4_PER_MINOR = 100n;

export type InvoiceLine = {
	sku: string;
	brandName: string;
	productName: string;
	sizeValue: number | null;
	sizeUnit: "ml" | "g" | "units" | null;
	quantity: number;
	unitPrice: number;
	returned: number;
};

export type InvoiceOrder = {
	status: OrderStatus;
	subtotal: number;
	discount: number;
	shipping: number;
	paymentMethod: PaymentMethod;
	lines: InvoiceLine[];
};

// Only when the customer asked for an invoice in their name (CT Art. 119-G: a person
// buying under US$25,000 cannot be asked for it).
export type Receptor = {
	nombre: string;
	tipoDocumento?: "13" | "36";
	numeroDocumento?: string;
	correo?: string;
};

// CAT-017. A payment link is a card whose kind (debit or credit) is not known: 99, other.
const PAYMENT_CODES: Record<PaymentMethod, string> = {
	bank_transfer: "05",
	cash_on_delivery: "01",
	cash: "01",
	payment_link: "99",
};

export type InvoiceRequest = {
	tipoDte: DteType;
	items: {
		codigo: string;
		descripcion: string;
		cantidad: number;
		precioUnitario: number;
		tipoVenta: "gravada";
	}[];
	condicionOperacion: 1;
	pagos: { codigo: string; monto: number }[];
	receptor?: Receptor;
	esperarSello?: number;
};

// `gross` minor units over `units`, net of IVA, rounded half up.
function netUnitE4(gross: bigint, units: bigint): bigint {
	const numerator = gross * E4_PER_MINOR * 100n;
	const denominator = (100n + IVA_PERCENT) * units;
	return (numerator * 2n + denominator) / (denominator * 2n);
}

// Largest remainder first (ties to the earlier line), so the parts add up exactly.
function split(total: bigint, weights: bigint[]): bigint[] {
	const sum = weights.reduce((a, b) => a + b, 0n);
	const parts = weights.map((w, index) => ({
		index,
		base: (total * w) / sum,
		remainder: (total * w) % sum,
	}));
	let left = total - parts.reduce((a, p) => a + p.base, 0n);
	for (const p of [...parts].sort((a, b) =>
		a.remainder === b.remainder
			? a.index - b.index
			: a.remainder > b.remainder
				? -1
				: 1,
	)) {
		if (left === 0n) break;
		p.base += 1n;
		left -= 1n;
	}
	return parts.map((p) => p.base);
}

const describe = (line: InvoiceLine, locale: Locale) => {
	const size =
		line.sizeValue === null
			? null
			: line.sizeUnit === "units"
				? m.size_units({ value: String(line.sizeValue) }, { locale })
				: `${line.sizeValue} ${line.sizeUnit}`;
	return [line.brandName, line.productName, size].filter(Boolean).join(" ");
};

export function invoiceRequest(
	order: InvoiceOrder,
	options: { locale: Locale; receptor?: Receptor; waitForSeal?: number },
): { body: InvoiceRequest; expectedTotal: number } {
	const owed = amountOwed(order);
	if (owed <= 0) throw new Error(`Nothing to invoice: the order owes ${owed}`);
	const kept = order.lines
		.map((line) => ({ line, units: line.quantity - line.returned }))
		.filter((k) => k.units > 0);
	const values = kept.map((k) => BigInt(k.units * k.line.unitPrice));
	const keptValue = values.reduce((a, b) => a + b, 0n);
	const discount = keptValue + BigInt(order.shipping) - BigInt(owed);
	const shares = split(discount, values);
	const items: InvoiceRequest["items"] = kept.map((k, i) => ({
		codigo: k.line.sku,
		descripcion: describe(k.line, options.locale),
		cantidad: k.units,
		precioUnitario:
			Number(netUnitE4(values[i] - shares[i], BigInt(k.units))) / 10_000,
		tipoVenta: "gravada",
	}));
	if (order.shipping > 0)
		items.push({
			codigo: "ENVIO",
			descripcion: m.invoice_line_shipping({}, { locale: options.locale }),
			cantidad: 1,
			precioUnitario: Number(netUnitE4(BigInt(order.shipping), 1n)) / 10_000,
			tipoVenta: "gravada",
		});
	return {
		body: {
			tipoDte: "01",
			items,
			condicionOperacion: 1,
			pagos: [
				{ codigo: PAYMENT_CODES[order.paymentMethod], monto: owed / 100 },
			],
			...(options.receptor ? { receptor: options.receptor } : {}),
			...(options.waitForSeal ? { esperarSello: options.waitForSeal } : {}),
		},
		expectedTotal: owed,
	};
}

// The provider's `estado`. BORRADOR never comes out of its public API: a document it
// answers with is emitted.
const STATUSES: Record<string, TaxDocumentStatus> = {
	PROCESANDO: "processing",
	CONTINGENCIA: "contingency",
	SELLADO: "sealed",
	RECHAZADO: "rejected",
	ANULADO: "voided",
};

export function statusFromProvider(estado: string): TaxDocumentStatus {
	const status = STATUSES[estado];
	if (!status)
		throw new Error(`Unknown DTE estado from the provider: ${estado}`);
	return status;
}

// The provider answers amounts in dollars with 2 decimals.
export function minorUnits(amount: number): number {
	const minor = Math.round(amount * 100);
	if (Math.abs(amount * 100 - minor) > 1e-6)
		throw new Error(
			`Amount with more than 2 decimals from the provider: ${amount}`,
		);
	return minor;
}

// The last day a sealed Factura can be invalidated: 3 months after its seal (Normativa de
// Cumplimiento DTE v2.0, Cuadro 6; the provider refuses later voids). The day is kept, or
// the month's last day when the target month is shorter.
export function voidDeadline(issuedOn: string): string {
	const [year, month, day] = issuedOn.split("-").map(Number);
	const target = new Date(Date.UTC(year, month - 1 + 3, 1));
	const lastDay = new Date(
		Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
	).getUTCDate();
	target.setUTCDate(Math.min(day, lastDay));
	return target.toISOString().slice(0, 10);
}

// One key per attempt: a resend of the same row reuses it, a new Factura for the order
// (after a rejection, failure or void) gets the next number.
export const invoiceKey = (orderCode: string, attempt: number) =>
	`${orderCode}-01-${attempt}`;
