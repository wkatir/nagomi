import { describe, expect, test } from "bun:test";
import {
	type Cell,
	csvCell,
	csvDateTime,
	csvMoney,
	csvRow,
	csvStream,
} from "./csv";

function parseCsv(text: string): string[][] {
	const rows: string[][] = [];
	let row: string[] = [];
	let field = "";
	let quoted = false;
	for (let i = 0; i < text.length; i++) {
		const ch = text[i];
		if (quoted) {
			if (ch === '"' && text[i + 1] === '"') {
				field += '"';
				i++;
			} else if (ch === '"') quoted = false;
			else field += ch;
		} else if (ch === '"') quoted = true;
		else if (ch === ",") {
			row.push(field);
			field = "";
		} else if (ch === "\r" && text[i + 1] === "\n") {
			rows.push([...row, field]);
			row = [];
			field = "";
			i++;
		} else field += ch;
	}
	if (field !== "" || row.length > 0) rows.push([...row, field]);
	return rows;
}

describe("csvCell", () => {
	test("quotes only what needs it and doubles inner quotes", () => {
		expect(csvCell("plain")).toBe("plain");
		expect(csvCell("a,b")).toBe('"a,b"');
		expect(csvCell('say "hi"')).toBe('"say ""hi"""');
		expect(csvCell("two\nlines")).toBe('"two\nlines"');
		expect(csvCell("cr\r")).toBe('"cr\r"');
		expect(csvCell(null)).toBe("");
		expect(csvCell(12)).toBe("12");
		expect(csvCell(-3)).toBe("-3");
		expect(csvCell(true)).toBe("true");
	});

	test("never lets a spreadsheet run a formula", () => {
		expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
		expect(csvCell("+50371234567")).toBe("'+50371234567");
		expect(csvCell("-1+1")).toBe("'-1+1");
		expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
		expect(csvCell("\t=1")).toBe("'\t=1");
		expect(csvCell('=A1,"x"')).toBe(`"'=A1,""x"""`);
		expect(csvCell("a=b")).toBe("a=b");
	});

	test("rejects numbers a spreadsheet cannot hold", () => {
		expect(() => csvCell(Number.NaN)).toThrow();
		expect(() => csvCell(Number.POSITIVE_INFINITY)).toThrow();
		expect(() => csvCell({ decimal: "1e3" })).toThrow();
	});
});

describe("csvMoney", () => {
	test("writes the currency's minor unit as decimals", () => {
		expect(csvCell(csvMoney(123450, "USD"))).toBe("1234.50");
		expect(csvCell(csvMoney(5, "USD"))).toBe("0.05");
		expect(csvCell(csvMoney(-5, "USD"))).toBe("-0.05");
		expect(csvCell(csvMoney(0, "USD"))).toBe("0.00");
		expect(csvCell(csvMoney(1234, "JPY"))).toBe("1234");
		expect(csvCell(csvMoney(1234, "KWD"))).toBe("1.234");
		expect(() => csvMoney(1.5, "USD")).toThrow();
	});
});

describe("csvStream", () => {
	test("streams a BOM, the header and every page, and reads back", async () => {
		async function* pages(): AsyncGenerator<Cell[][]> {
			yield [["NAG-1", 'María, "Mery"', csvMoney(2450, "USD")]];
			yield [];
			yield [
				["NAG-2", "=cmd|' /C calc'!A0", csvMoney(-100, "USD")],
				["NAG-3", "línea\nnueva", null],
			];
		}
		const text = await new Response(
			csvStream(["code", "name", "total"], pages()),
		).text();
		const bytes = new Uint8Array(
			await new Response(csvStream(["a"], pages())).arrayBuffer(),
		);
		expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		// Response.text() decodes UTF-8 and drops the BOM, as Excel does.
		expect(text.endsWith("\r\n")).toBe(true);
		expect(parseCsv(text)).toEqual([
			["code", "name", "total"],
			["NAG-1", 'María, "Mery"', "24.50"],
			["NAG-2", "'=cmd|' /C calc'!A0", "-1.00"],
			["NAG-3", "línea\nnueva", ""],
		]);
		expect(csvRow(["x", 1])).toBe("x,1\r\n");
	});
});

describe("csvDateTime", () => {
	test("writes instants in the store's zone", () => {
		expect(csvDateTime("2026-10-06T03:15:00Z", "America/El_Salvador")).toBe(
			"2026-10-05 21:15:00",
		);
		expect(csvDateTime("2026-03-08T10:30:00Z", "America/New_York")).toBe(
			"2026-03-08 06:30:00",
		);
		expect(csvDateTime(null, "UTC")).toBeNull();
	});
});
