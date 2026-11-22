import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPeriod } from "#/components/admin/chart-format";
import {
	movementReasonLabel,
	returnReasonLabel,
} from "#/components/admin/labels";
import { facts, rows, stats } from "#/components/admin/test-markup";
import { formatCalendarDate } from "#/lib/dates";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { reorderSuggestion } from "#/server/domain/reorder";
import { BrandsReportView, ProductsReportView } from "./breakdown-reports";
import { formatPercent } from "./format";
import { LossesReportView } from "./losses-report";
import type {
	BrandsReport,
	LossesReport,
	ProductsReport,
	ReorderReport,
	SalesReport,
	StockReport,
} from "./queries";
import { reorderReasonLabel } from "./reorder-labels";
import { ReorderReportView } from "./reorder-report";
import { SalesReportView } from "./sales-report";
import { StockReportView } from "./stock-report";

const locale = intlLocale(getLocale(), "SV");
const money = (amount: number) => formatMoney(amount, "USD", locale);
const percent = (ratio: number) => formatPercent(ratio, locale);
const day = (date: string) => formatPeriod(date, "day", locale);

const client = new QueryClient();
client.setQueryData(["store"], {
	currency: "USD",
	countryCode: "SV",
	timeZone: "America/El_Salvador",
});
const render = (node: ReactNode) =>
	renderToStaticMarkup(
		<QueryClientProvider client={client}>{node}</QueryClientProvider>,
	);

const figures = (
	own: Partial<SalesReport["totals"]> = {},
): SalesReport["totals"] => ({
	orders: 0,
	units: 0,
	revenue: 0,
	tax: 0,
	netRevenue: 0,
	averageTicket: null,
	merchandise: 0,
	shipping: 0,
	costOfGoodsSold: 0,
	grossProfit: 0,
	margin: null,
	...own,
});

describe("SalesReportView", () => {
	const report: SalesReport = {
		from: "2026-10-01",
		to: "2026-10-10",
		granularity: "week",
		totals: figures({
			orders: 3,
			units: 5,
			revenue: 9500,
			tax: 1093,
			netRevenue: 8407,
			averageTicket: 3167,
			merchandise: 9000,
			shipping: 500,
			costOfGoodsSold: 3500,
			grossProfit: 5500,
			margin: 0.6111,
		}),
		periods: [
			{
				period: "2026-09-28",
				from: "2026-10-01",
				to: "2026-10-04",
				partial: true,
				...figures({
					orders: 1,
					units: 2,
					revenue: 3200,
					tax: 368,
					netRevenue: 2832,
					averageTicket: 3200,
					costOfGoodsSold: 1300,
					grossProfit: 1900,
					margin: 0.5938,
				}),
			},
			{
				period: "2026-10-05",
				from: "2026-10-05",
				to: "2026-10-10",
				partial: true,
				...figures(),
			},
		],
	};
	const html = render(<SalesReportView report={report} granularity="week" />);

	test("shows the totals as figures", () => {
		expect(stats(html)).toEqual([
			[
				m.admin_kpi_sales_with_tax(),
				money(9500),
				m.admin_report_orders_n({ count: 3 }),
			],
			[
				m.admin_kpi_sales_net(),
				money(8407),
				m.admin_kpi_tax_note({ amount: money(1093) }),
			],
			[m.admin_kpi_avg_ticket(), money(3167), m.admin_kpi_avg_ticket_note()],
			[
				m.admin_kpi_gross_profit(),
				money(5500),
				m.admin_report_margin_n({ percent: percent(0.6111) }),
			],
			[m.admin_report_units(), "5", m.admin_report_kept_units()],
		]);
	});

	test("tables each period by its days, cut by the range and marked, and closes with the totals", () => {
		const table = rows(html).filter((row) => row.length === 9);
		expect(table).toEqual([
			[
				m.admin_report_period(),
				m.admin_report_orders(),
				m.admin_report_units(),
				m.admin_kpi_sales_with_tax(),
				m.admin_kpi_sales_net(),
				m.admin_kpi_avg_ticket(),
				m.admin_kpi_cogs(),
				m.admin_kpi_gross_profit(),
				m.admin_report_margin(),
			],
			[
				`${day("2026-10-01")} - ${day("2026-10-04")} | ${m.admin_report_partial()}`,
				"1",
				"2",
				money(3200),
				money(2832),
				money(3200),
				money(1300),
				money(1900),
				percent(0.5938),
			],
			[
				`${day("2026-10-05")} - ${day("2026-10-10")} | ${m.admin_report_partial()}`,
				"0",
				"0",
				money(0),
				money(0),
				"",
				money(0),
				money(0),
				m.admin_report_na(),
			],
			[
				m.admin_report_total(),
				"3",
				"5",
				money(9500),
				money(8407),
				money(3167),
				money(3500),
				money(5500),
				percent(0.6111),
			],
		]);
	});

	test("charts the sales and the profit of each period, starting on the first day of the week", () => {
		const chart = rows(html).filter((row) => row.length === 2);
		const week = (date: string) => formatPeriod(date, "week", locale);
		expect(chart).toEqual([
			[m.admin_report_period(), m.admin_kpi_revenue()],
			[week("2026-09-28"), money(3200)],
			[week("2026-10-05"), money(0)],
			[m.admin_report_period(), m.admin_kpi_gross_profit()],
			[week("2026-09-28"), money(1900)],
			[week("2026-10-05"), money(0)],
		]);
	});

	test("a day is its date, and a full period is not marked partial", () => {
		const days = render(
			<SalesReportView
				report={{
					...report,
					granularity: "day",
					periods: [
						{
							period: "2026-10-05",
							from: "2026-10-05",
							to: "2026-10-05",
							partial: false,
							...figures({
								orders: 1,
								revenue: 1500,
								netRevenue: 1327,
								averageTicket: 1500,
							}),
						},
					],
				}}
				granularity="day"
			/>,
		);
		expect(rows(days)).toContainEqual([
			day("2026-10-05"),
			"1",
			"0",
			money(1500),
			money(1327),
			money(1500),
			money(0),
			money(0),
			m.admin_report_na(),
		]);
		expect(days).not.toContain(m.admin_report_partial());
	});
});

describe("ProductsReportView and BrandsReportView", () => {
	const row = {
		orders: 2,
		unitsSold: 4,
		unitsReturned: 1,
		units: 3,
		merchandise: 4500,
		costOfGoodsSold: 1500,
		grossProfit: 3000,
		margin: 0.6667,
	};
	const sale = {
		firstSoldOn: "2026-10-01",
		daysOnSale: 31,
		unitsPerDay: 0.1,
	};
	const totals = figures({
		orders: 3,
		units: 5,
		merchandise: 6000,
		costOfGoodsSold: 2000,
		grossProfit: 4000,
		margin: 0.5,
	});
	const products: ProductsReport = {
		from: "2026-10-01",
		to: "2026-10-31",
		totals,
		products: [
			{
				variantId: 1,
				sku: "OIL",
				brand: "SKIN1004",
				name: "Aceite",
				...row,
				...sale,
			},
			{
				variantId: 2,
				sku: "TONER",
				brand: "COSRX",
				name: "Tónico",
				...row,
				firstSoldOn: "2026-10-22",
				daysOnSale: 10,
				unitsPerDay: 0.1,
				unitsSold: 3,
				unitsReturned: 2,
				merchandise: 1500,
				costOfGoodsSold: 500,
				grossProfit: 1000,
				margin: 0.1,
			},
		],
	};

	test("shows the totals as figures", () => {
		expect(
			stats(
				render(<ProductsReportView report={products} rank="merchandise" />),
			),
		).toEqual([
			[
				m.admin_report_merchandise(),
				money(6000),
				m.admin_report_merchandise_note(),
			],
			[
				m.admin_kpi_gross_profit(),
				money(4000),
				m.admin_report_margin_n({ percent: percent(0.5) }),
			],
			[m.admin_report_units(), "5", m.admin_report_kept_units()],
			[m.admin_report_orders(), "3", ""],
		]);
	});

	test("tables the products by their figures and closes with the sums of the rows", () => {
		const table = rows(
			render(<ProductsReportView report={products} rank="merchandise" />),
		).filter((r) => r.length === 10);
		expect(table.slice(1)).toEqual([
			[
				"SKIN1004 Aceite | OIL",
				"2",
				"4",
				"1",
				money(4500),
				money(1500),
				money(3000),
				percent(0.6667),
				"0.1",
				`${formatCalendarDate("2026-10-01", locale)} | ${m.admin_report_days_on_sale({ count: 31 })}`,
			],
			[
				"COSRX Tónico | TONER",
				"2",
				"3",
				"2",
				money(1500),
				money(500),
				money(1000),
				percent(0.1),
				"0.1",
				`${formatCalendarDate("2026-10-22", locale)} | ${m.admin_report_days_on_sale({ count: 10 })}`,
			],
			[
				m.admin_report_total(),
				"3",
				"7",
				"3",
				money(6000),
				money(2000),
				money(4000),
				percent(0.5),
				"",
				"",
			],
		]);
	});

	test("ranks by units per day, so a product that started late is not buried", () => {
		const [first, second] = products.products;
		if (!first || !second) throw new Error("fixture");
		const ranked = rows(
			render(
				<ProductsReportView
					report={{
						...products,
						products: [
							{ ...first, unitsPerDay: 0.1 },
							{ ...second, unitsPerDay: 0.3 },
						],
					}}
					rank="unitsPerDay"
				/>,
			),
		).filter((r) => r.length === 2);
		expect(ranked.slice(1)).toEqual([
			["TONER", "0.3"],
			["OIL", "0.1"],
		]);
	});

	test("charts the ten best sellers by SKU and no more", () => {
		const many: ProductsReport = {
			...products,
			products: Array.from({ length: 12 }, (_, n) => ({
				variantId: n + 1,
				sku: `SKU-${n + 1}`,
				brand: "B",
				name: "P",
				...row,
				...sale,
				merchandise: 1000 - n,
			})),
		};
		const chart = rows(
			render(<ProductsReportView report={many} rank="merchandise" />),
		).filter((r) => r.length === 2);
		expect(chart.slice(1).map(([sku]) => sku)).toEqual(
			Array.from({ length: 10 }, (_, n) => `SKU-${n + 1}`),
		);
		expect(chart[1]).toEqual(["SKU-1", money(1000)]);
	});

	test("without sales it says so and has no closing row", () => {
		const html = render(
			<ProductsReportView
				report={{ ...products, totals: figures(), products: [] }}
				rank="merchandise"
			/>,
		);
		expect(html).toContain(m.admin_report_no_sales());
		expect(html).not.toContain("<tfoot");
	});

	test("tables the brands with the number of their products", () => {
		const brands: BrandsReport = {
			from: products.from,
			to: products.to,
			totals,
			brands: [{ brand: "SKIN1004", products: 3, ...row }],
		};
		const table = rows(render(<BrandsReportView report={brands} />)).filter(
			(r) => r.length === 8,
		);
		expect(table.slice(1)).toEqual([
			[
				`SKIN1004 | ${m.admin_report_products_n({ count: 3 })}`,
				"2",
				"4",
				"1",
				money(4500),
				money(1500),
				money(3000),
				percent(0.6667),
			],
			[
				m.admin_report_total(),
				"3",
				"4",
				"1",
				money(6000),
				money(2000),
				money(4000),
				percent(0.5),
			],
		]);
		const empty = render(
			<BrandsReportView report={{ ...brands, brands: [] }} />,
		);
		expect(empty).toContain(m.admin_report_no_sales());
		expect(empty).not.toContain("<tfoot");
	});
});

describe("LossesReportView", () => {
	const report: LossesReport = {
		from: "2026-10-01",
		to: "2026-10-31",
		returns: {
			returns: 2,
			units: 3,
			value: 4500,
			restocked: { units: 2, cost: 1400 },
			writtenOff: { units: 1, cost: 700 },
			byReason: [
				{ reason: "defective", returns: 1, units: 2, value: 3000 },
				{ reason: "withdrawal", returns: 1, units: 1, value: 1500 },
			],
		},
		refunds: { count: 2, amount: 2500 },
		writeOffs: {
			units: 5,
			cost: 3500,
			byReason: [{ reason: "damaged", units: 5, cost: 3500 }],
		},
		adjustments: { units: -2, value: -1400 },
		totalLoss: 4900,
	};
	const html = render(<LossesReportView report={report} />);

	test("shows the losses as figures", () => {
		expect(stats(html)).toEqual([
			[
				m.admin_report_total_loss(),
				money(4900),
				m.admin_report_total_loss_note(),
			],
			[m.admin_report_write_offs(), money(3500), m.admin_units({ count: 5 })],
			[
				m.admin_report_returns(),
				"2",
				`${m.admin_units({ count: 3 })} · ${money(4500)}`,
			],
			[
				m.admin_report_refunds(),
				money(2500),
				m.admin_report_refunds_n({ count: 2 }),
			],
		]);
	});

	test("charts and tables each loss by reason", () => {
		const table = rows(html);
		const expired = movementReasonLabel.damaged();
		const defective = returnReasonLabel.defective();
		const withdrawal = returnReasonLabel.withdrawal();
		// The charts' tables: write-offs at cost, returns at the order's price.
		expect(table).toContainEqual([expired, money(3500)]);
		expect(table).toContainEqual([defective, money(3000)]);
		expect(table).toContainEqual([withdrawal, money(1500)]);
		// The visible tables, each closed by its totals.
		expect(table).toContainEqual([expired, "5", money(3500)]);
		expect(table).toContainEqual([m.admin_report_total(), "5", money(3500)]);
		expect(table).toContainEqual([defective, "1", "2", money(3000)]);
		expect(table).toContainEqual([withdrawal, "1", "1", money(1500)]);
		expect(table).toContainEqual([
			m.admin_report_total(),
			"2",
			"3",
			money(4500),
		]);
	});

	test("gives the returns put back and written off, and the count adjustments", () => {
		expect(facts(html)).toEqual([
			[
				m.admin_report_returns_restocked(),
				`${m.admin_units({ count: 2 })} · ${money(1400)}`,
			],
			[
				m.admin_report_returns_written_off(),
				`${m.admin_units({ count: 1 })} · ${money(700)}`,
			],
			[
				m.admin_report_adjustments(),
				`${m.admin_units({ count: -2 })} · ${money(-1400)}`,
			],
		]);
	});

	test("a range with nothing says so in both tables", () => {
		const empty = render(
			<LossesReportView
				report={{
					...report,
					returns: { ...report.returns, byReason: [] },
					writeOffs: { ...report.writeOffs, byReason: [] },
				}}
			/>,
		);
		expect(empty.split(m.admin_report_nothing_in_range()).length - 1).toBe(2);
		expect(html).not.toContain(m.admin_report_nothing_in_range());
	});
});

describe("StockReportView", () => {
	const variant = {
		variantStatus: "active" as const,
		productStatus: "published" as const,
		outOfStock: false,
		unitsSold: 5,
		averageOnHand: 10,
		rotation: 0.5,
		daysOfCover: 40,
	};
	const report: StockReport = {
		from: "2026-10-01",
		to: "2026-10-24",
		asOf: "2026-10-24",
		lowStockThreshold: 5,
		totals: {
			onHand: 10,
			value: 7000,
			unitsSold: 11,
			rotation: 0.8,
			daysOfCover: 21,
			outOfStock: 1,
			lowStock: 2,
		},
		variants: [
			{
				...variant,
				variantId: 2,
				sku: "RAT-003",
				brand: "Pulsar",
				name: "Tate",
				reorderPoint: null,
				lowStock: true,
				outOfStock: true,
				onHand: 0,
				value: 0,
				unitsSold: 6,
				rotation: null,
				daysOfCover: null,
			},
			{
				...variant,
				variantId: 1,
				sku: "TEC-001",
				brand: "Royal Kludge",
				name: "RK75",
				reorderPoint: 10,
				lowStock: true,
				onHand: 2,
				value: 1400,
				daysOfCover: 9,
			},
			{
				...variant,
				variantId: 3,
				sku: "ALF-001",
				brand: "Nagomi",
				name: "Sakura XL",
				reorderPoint: 1,
				lowStock: false,
				onHand: 8,
				value: 5600,
			},
		],
	};
	const html = render(<StockReportView report={report} />);

	test("answers what to restock: sold out, low and the pace of sales", () => {
		expect(stats(html).map(([label, value]) => [label, value])).toEqual([
			[m.admin_report_on_hand(), "10"],
			[m.admin_report_stock_value(), money(7000)],
			[m.admin_stock_out_title(), "1"],
			[m.admin_overview_below_reorder(), "2"],
			[m.admin_report_rotation(), "0.8"],
		]);
		expect(html).toContain(
			m.admin_report_as_of({ date: formatCalendarDate("2026-10-24", locale) }),
		);
	});

	test("tables each variant with its state, sales, turnover and days of cover", () => {
		const sizes = rows(html).filter((r) => r.length === 8);
		expect(sizes.slice(1)).toEqual([
			[
				"Pulsar Tate | RAT-003",
				m.admin_stock_out(),
				"0",
				"5",
				"6",
				"—",
				"—",
				money(0),
			],
			[
				"Royal Kludge RK75 | TEC-001",
				m.admin_stock_low(),
				"2",
				"10",
				"5",
				"0.5",
				"9",
				money(1400),
			],
			[
				"Nagomi Sakura XL | ALF-001",
				m.admin_stock_ok(),
				"8",
				"1",
				"5",
				"0.5",
				"40",
				money(5600),
			],
		]);
	});

	test("charts the days of cover of what still has stock", () => {
		const chart = rows(html).filter((r) => r.length === 2);
		expect(chart.slice(1)).toEqual([
			["TEC-001", m.admin_report_days_n({ count: 9 })],
			["ALF-001", m.admin_report_days_n({ count: 40 })],
		]);
	});

	test("with nothing on the shelves it says so", () => {
		const empty = render(
			<StockReportView report={{ ...report, variants: [] }} />,
		);
		expect(empty).toContain(m.admin_report_no_stock());
		expect(html).not.toContain(m.admin_report_no_stock());
	});
});

describe("ReorderReportView", () => {
	const suggestion = (
		variantId: number,
		onHand: number,
		packSize: number | null,
	) =>
		reorderSuggestion(
			{
				variantId,
				price: 1500,
				reorderPoint: 10,
				sales: [],
				firstReceivedOn: null,
				lots: [{ available: onHand }],
				committed: 0,
				latestUnitCostE4: null,
				leadTimeDays: null,
				packSize,
				minOrderQuantity: null,
			},
			{
				today: "2026-10-24",
				lookbackWeeks: 8,
				targetWeeks: 4,
			},
		);
	const entry = (
		variantId: number,
		sku: string,
		onHand: number,
		supplier: ReorderReport["variants"][number]["supplier"],
	) => ({
		sku,
		brand: "COSRX",
		name: sku,
		productStatus: "published" as const,
		supplier,
		leadTimeSource: null,
		...suggestion(variantId, onHand, supplier?.packSize ?? null),
	});
	const report: ReorderReport = {
		asOf: "2026-10-24",
		lookbackFrom: "2026-08-30",
		today: "2026-10-24",
		lookbackWeeks: 8,
		targetWeeks: 4,
		leadTimeOverride: null,
		variants: [
			// 7 are suggested; the supplier sells in packs of 12.
			entry(1, "OIL", 3, {
				supplierId: 1,
				supplier: "Acme",
				supplierItemId: 1,
				supplierSku: null,
				leadTimeDays: null,
				packSize: 12,
				minOrderQuantity: null,
				source: "only_supplier",
			}),
			entry(2, "TONER", 40, null),
		],
	};
	const html = render(<ReorderReportView report={report} />);
	const [oil, toner] = report.variants;
	if (!oil || !toner) throw new Error("The fixture has two sizes");

	test("counts the sizes to order and says what the suggestion is based on", () => {
		expect(oil.suggestedQuantity).toBe(7);
		expect(oil.orderQuantity).toBe(12);
		expect(toner.orderQuantity).toBe(0);
		expect(html).toContain(m.admin_report_to_order({ count: 1 }));
		expect(html).toContain(
			m.admin_report_reorder_basis({
				lookback: 8,
				target: 4,
				date: formatCalendarDate("2026-10-24", locale),
			}),
		);
	});

	test("tables each size with what to order and from whom", () => {
		const table = rows(html).filter((r) => r.length === 6);
		const reasons = (own: typeof oil.reasons) =>
			own.map((reason) => reorderReasonLabel[reason]());
		expect(table.slice(1)).toEqual([
			[
				`COSRX OIL | ${["OIL", ...reasons(oil.reasons)].join(" · ")}`,
				"3",
				String(oil.ratePerWeek),
				m.admin_report_na(),
				"12",
				"Acme",
			],
			[
				`COSRX TONER | ${["TONER", ...reasons(toner.reasons)].join(" · ")}`,
				"40",
				String(toner.ratePerWeek),
				m.admin_report_na(),
				"0",
				m.admin_report_na(),
			],
		]);
		expect(oil.reasons).toContain("below_reorder_point");
	});
});
