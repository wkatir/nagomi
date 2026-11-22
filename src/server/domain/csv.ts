import { localDateTime } from "#/lib/dates";
import { minorDigits } from "#/lib/money";

// RFC 4180 with a BOM so Excel reads accents. Text starting with = + - @ tab or CR gets a
// leading ' so a spreadsheet never runs it as a formula (CSV injection).

// A decimal string, so money keeps its trailing zeros.
type Decimal = { decimal: string };
export type Cell = string | number | boolean | null | Decimal;

const BOM = String.fromCharCode(0xfeff);
const FORMULA_START = /^[=+\-@\t\r]/;
const NEEDS_QUOTES = /[",\r\n]/;
const DECIMAL = /^-?\d+(\.\d+)?$/;

export function csvCell(value: Cell): string {
	if (value === null) return "";
	if (typeof value === "number") {
		if (!Number.isFinite(value)) throw new Error(`Invalid CSV number ${value}`);
		return String(value);
	}
	if (typeof value === "boolean") return value ? "true" : "false";
	if (typeof value === "object") {
		if (!DECIMAL.test(value.decimal))
			throw new Error(`Invalid CSV decimal ${value.decimal}`);
		return value.decimal;
	}
	const text = FORMULA_START.test(value) ? `'${value}` : value;
	return NEEDS_QUOTES.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export const csvRow = (cells: readonly Cell[]) =>
	`${cells.map(csvCell).join(",")}\r\n`;

export function csvMoney(amount: number, currency: string): Decimal {
	if (!Number.isSafeInteger(amount))
		throw new Error(`Invalid money amount ${amount}`);
	const digits = minorDigits(currency);
	const sign = amount < 0 ? "-" : "";
	const abs = Math.abs(amount);
	if (digits === 0) return { decimal: `${sign}${abs}` };
	const scale = 10 ** digits;
	return {
		decimal: `${sign}${Math.floor(abs / scale)}.${String(abs % scale).padStart(digits, "0")}`,
	};
}

// Each page is sent as soon as it is read, so a long export never sits whole in memory.
export function csvStream(
	header: readonly string[],
	pages: AsyncIterable<readonly (readonly Cell[])[]>,
): ReadableStream<Uint8Array> {
	const encoder = new TextEncoder();
	const iterator = pages[Symbol.asyncIterator]();
	let started = false;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			if (!started) {
				started = true;
				controller.enqueue(encoder.encode(BOM + csvRow(header)));
				return;
			}
			// A pull must enqueue or close, so empty pages are skipped here.
			for (;;) {
				const next = await iterator.next();
				if (next.done) {
					controller.close();
					return;
				}
				if (next.value.length > 0) {
					controller.enqueue(encoder.encode(next.value.map(csvRow).join("")));
					return;
				}
			}
		},
		async cancel() {
			await iterator.return?.();
		},
	});
}

export const csvHeaders = (filename: string) => ({
	"Content-Type": "text/csv; charset=utf-8",
	"Content-Disposition": `attachment; filename="${filename}"`,
});

export const csvDateTime = (instant: string | null, timeZone: string) =>
	instant === null ? null : localDateTime(new Date(instant), timeZone);
