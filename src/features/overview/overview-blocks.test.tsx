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
		merchandise: 9000,
		shipping: 500,
		costOfGoodsSold: 3500,
		grossProfit: 5500,
		margin: 0.6111,
	},
	bookings: { orders: 5, value: 12000 },
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
		},
	],
	stock: {
		onHand: 40,
		value: 28000,
		lowStock: 2,
	},
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
	test("each figure links to the screen where it can be acted on, with the days it sums up", async () => {
		const days = "from=2026-10-23&amp;to=2026-10-24";
		expect(linkedStats(await render(dashboard))).toEqual([
			[
				`/admin/reports?${days}`,
				m.admin_kpi_revenue(),
				money(9500),
				m.admin_overview_sales_note({ count: 3 }),
			],
			[
				`/admin/reports/products?${days}`,
				m.admin_kpi_gross_profit(),
				money(5500),
				m.admin_report_margin_n({ percent: formatPercent(0.6111, locale) }),
			],
			[
				"/admin/orders?status=pending",
				m.admin_kpi_pending(),
				"4",
				m.admin_overview_pending_note(),
			],
			[
				"/admin/orders?status=pending&amp;sort=createdAt&amp;dir=asc",
				m.admin_overview_overdue(),
				"1",
				m.admin_overview_overdue_note(),
			],
			[
				"/admin/orders",
				m.admin_overview_booked(),
				"5",
				m.admin_overview_booked_note({ amount: money(12000) }),
			],
			[
				`/admin/reports/losses?${days}`,
				m.admin_overview_losses(),
				money(2800),
				m.admin_overview_losses_note(),
			],
			[
				"/admin/reports/reorder",
				m.admin_overview_below_reorder(),
				"2",
				m.admin_overview_below_reorder_note(),
			],
			[
				"/admin/reports/stock",
				m.admin_overview_stock(),
				money(28000),
				m.admin_overview_stock_note({ count: 40 }),
			],
		]);
	});

	test("charts the sales and the profit of each day, and tables them too", async () => {
		const html = await render(dashboard);
		const table = rows(html);
		const day = (date: string) => formatPeriod(date, "day", locale);
		// Sales first, then profit: the tables of the two charts.
		expect(table).toEqual([
			[m.admin_report_period(), m.admin_kpi_revenue()],
			[day("2026-10-23"), money(3000)],
			[day("2026-10-24"), money(6500)],
			[m.admin_report_period(), m.admin_kpi_gross_profit()],
			[day("2026-10-23"), money(1800)],
			[day("2026-10-24"), money(3700)],
		]);
	});

	test("lists the best sellers", async () => {
		const html = await render(dashboard);
		expect(html).toContain(`Akko Teclado Sakura`);
		expect(html).toContain(money(4500));
		expect(html).toContain(m.admin_units({ count: 3 }));
		expect(html).not.toContain(m.admin_no_sales());
	});

	test("says so when nothing sold", async () => {
		const html = await render({
			...dashboard,
			topProducts: [],
			sales: { ...dashboard.sales, margin: null },
			byDay: dashboard.byDay.map((x) => ({
				...x,
				revenue: 0,
				grossProfit: 0,
			})),
		});
		expect(html).toContain(m.admin_no_sales());
		expect(html).toContain(m.admin_kpi_no_fulfilled());
		expect(html.split(m.admin_report_chart_empty()).length - 1).toBe(2);
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
			m.admin_overview_profit_by_day(),
			m.admin_top_products(),
		])
			expect(html).toContain(title);
		expect(html.split("h-[5.5rem]").length - 1).toBe(8);
	});
});
