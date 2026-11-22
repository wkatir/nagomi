import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPeriod } from "#/components/admin/chart-format";
import { linkedStats, rows } from "#/components/admin/test-markup";
import { formatPercent } from "#/features/reports/format";
import { intlLocale } from "#/lib/intl";
import { formatMoney } from "#/lib/money";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { OverviewBlocks, OverviewSkeleton } from "./overview-blocks";
import type { AdminDashboard } from "./queries";

const locale = intlLocale(getLocale(), "SV");
const money = (amount: number) => formatMoney(amount, "USD", locale);

const dashboard: AdminDashboard = {
	from: "2026-10-23",
	to: "2026-10-24",
	days: 2,
	sales: {
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
	},
	bookings: { orders: 5, value: 12000 },
	newCustomers: 2,
	losses: {
		returns: {
			returns: 0,
			units: 0,
			value: 0,
			restocked: { units: 0, cost: 0 },
			writtenOff: { units: 0, cost: 0 },
			byReason: [],
		},
		refunds: { count: 0, amount: 0 },
		writeOffs: { units: 0, cost: 0, byReason: [] },
		adjustments: { units: 0, value: 0 },
		totalLoss: 2800,
	},
	pendingOrders: 4,
	overduePendingOrders: 1,
	byDay: [
		{ day: "2026-10-23", orders: 1, revenue: 3000, grossProfit: 1800 },
		{ day: "2026-10-24", orders: 2, revenue: 6500, grossProfit: 3700 },
	],
	topProducts: [
		{
			variantId: 1,
			sku: "TEC-002",
			brand: "Akko",
			name: "Teclado Sakura",
			orders: 2,
			unitsSold: 4,
			unitsReturned: 1,
			units: 3,
			merchandise: 4500,
			costOfGoodsSold: 1500,
			grossProfit: 3000,
			margin: 0.6667,
			unitsPerDay: 1.5,
		},
	],
	stock: {
		onHand: 40,
		value: 28000,
		lowStock: 2,
		outOfStock: 1,
		threshold: 5,
	},
	lowStock: [
		{
			variantId: 7,
			sku: "RAT-003",
			brand: "Pulsar",
			name: "Mouse Tate",
			onHand: 0,
			reorderPoint: 5,
			daysOfCover: null,
		},
		{
			variantId: 8,
			sku: "ACC-003",
			brand: "Nagomi",
			name: "Cable",
			onHand: 2,
			reorderPoint: 5,
			daysOfCover: 12,
		},
	],
	followups: {
		counts: { collect_payment: 1, ship: 0, confirm_delivery: 0 },
		items: [
			{
				orderId: 9,
				code: "NAG-AAA111",
				customerId: 1,
				customerName: "Ana Pérez",
				customerEmail: "ana@example.com",
				customerPhone: "+50371234567",
				paymentMethod: "bank_transfer",
				total: 3000,
				status: "pending",
				action: "collect_payment",
				since: "2026-10-20T12:00:00Z",
				deadlineHours: 48,
				dueAt: "2026-10-22T12:00:00Z",
				hoursOverdue: 30,
			},
		],
	},
	pendingReviews: 3,
	pendingStockAlerts: 2,
};

const client = new QueryClient();
client.setQueryData(["store"], {
	currency: "USD",
	countryCode: "SV",
	timeZone: "America/El_Salvador",
});

// Its links need a router.
async function render(d: AdminDashboard, queryClient = client) {
	const router = createRouter({
		routeTree: createRootRoute({
			component: () => <OverviewBlocks d={d} />,
		}),
		history: createMemoryHistory({ initialEntries: ["/"] }),
	});
	await router.load();
	return renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			<RouterProvider router={router} />
		</QueryClientProvider>,
	);
}

describe("OverviewBlocks", () => {
	test("each figure links to the report that explains it, with the days it sums up", async () => {
		const days = "from=2026-10-23&amp;to=2026-10-24";
		expect(linkedStats(await render(dashboard))).toEqual([
			[
				`/admin/reports?${days}`,
				m.admin_kpi_sales_with_tax(),
				money(9500),
				m.admin_kpi_net_note({ amount: money(8407) }),
			],
			[
				`/admin/reports/fulfillment?${days}`,
				m.admin_report_orders(),
				"3",
				m.admin_kpi_orders_note({ count: 5 }),
			],
			[
				`/admin/reports?${days}`,
				m.admin_kpi_avg_ticket(),
				money(3167),
				m.admin_kpi_avg_ticket_note(),
			],
			[
				`/admin/reports/customers?${days}`,
				m.admin_kpi_new_customers(),
				"2",
				m.admin_kpi_new_customers_note(),
			],
			[
				`/admin/reports/products?${days}`,
				m.admin_kpi_gross_margin(),
				formatPercent(0.6111, locale),
				m.admin_kpi_gross_margin_note({ amount: money(5500) }),
			],
		]);
	});

	test("charts the sales of each day and tables the figures", async () => {
		const table = rows(await render(dashboard));
		const day = (date: string) => formatPeriod(date, "day", locale);
		expect(table.slice(0, 3)).toEqual([
			[m.admin_report_period(), m.admin_kpi_sales_with_tax()],
			[day("2026-10-23"), money(3000)],
			[day("2026-10-24"), money(6500)],
		]);
		expect(table).toContainEqual([
			"Akko Teclado Sakura | TEC-002",
			"3",
			money(4500),
			"1.5",
		]);
		expect(table).toContainEqual([
			"Pulsar Mouse Tate | RAT-003",
			m.admin_stock_out(),
			"5",
			"—",
		]);
		expect(table).toContainEqual(["Nagomi Cable | ACC-003", "2", "5", "12"]);
	});

	test("lists what waits for the team and the orders past their deadline", async () => {
		const html = await render(dashboard);
		for (const label of [
			m.admin_overview_pending_payment(),
			m.admin_overview_pending_reviews(),
			m.admin_overview_stock_alerts(),
			m.admin_stock_out_title(),
		])
			expect(html).toContain(label);
		expect(html).toContain('href="/admin/reviews"');
		expect(html).toContain('href="/admin/stock-alerts"');
		expect(html).toContain("NAG-AAA111");
		expect(html).toContain(m.admin_followup_digest_note({ count: 1 }));
	});

	test("says so when nothing sold", async () => {
		const html = await render({
			...dashboard,
			topProducts: [],
			lowStock: [],
			sales: { ...dashboard.sales, margin: null, averageTicket: null },
			byDay: dashboard.byDay.map((x) => ({
				...x,
				revenue: 0,
				grossProfit: 0,
			})),
		});
		expect(html).toContain(m.admin_no_sales());
		expect(html).toContain(m.admin_overview_low_stock_none());
		expect(html).toContain(m.admin_report_chart_empty());
	});
});

describe("OverviewSkeleton", () => {
	test("has a place for every block, with the titles that do not depend on the data", () => {
		const html = renderToStaticMarkup(
			<QueryClientProvider client={client}>
				<OverviewSkeleton />
			</QueryClientProvider>,
		);
		expect(html).toContain("aria-busy");
		for (const title of [
			m.admin_sales_by_day(),
			m.admin_overview_attention(),
			m.admin_top_products(),
			m.admin_overview_low_stock(),
		])
			expect(html).toContain(title);
		expect(html.split("h-[5.5rem]").length - 1).toBe(5);
	});
});
