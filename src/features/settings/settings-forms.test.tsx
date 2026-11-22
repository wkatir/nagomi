import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AdminPages, AdminPromises, AdminSettings } from "#/lib/api";
import { formatInstant } from "#/lib/dates";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { activeZonesQuery } from "../shipping/queries";
import { CustomersCard } from "./customers-form";
import { IdentityCard } from "./identity-form";
import { LegalCard } from "./legal-form";
import { OperationsCard } from "./operations-form";
import { PageCard } from "./page-card";
import { PaymentsCard } from "./payments-form";
import { PromiseCard } from "./promise-card";
import { SocialCard } from "./social-form";

const settings: AdminSettings = {
	id: 1,
	name: "Nagomi",
	currency: "USD",
	defaultLocale: "es",
	whatsappNumber: "50371234567",
	legalName: "Nagomi, S.A. de C.V.",
	taxIdLabel: "NIT",
	taxId: "0614-010101-101-0",
	address: "San Salvador",
	phone: null,
	email: null,
	timeZone: "America/El_Salvador",
	countryCode: "SV",
	orderCodePrefix: "NAG",
	maxQuantityPerLine: 10,
	returnWindowDays: 30,
	foundingYear: 2026,
	freeShippingFrom: 5000,
	lowStockThreshold: 5,
	frequentCustomerMinOrders: 3,
	inactiveCustomerDays: 90,
	followupPendingPaymentHours: 48,
	followupPaidUnshippedHours: 24,
	followupShippedUndeliveredHours: null,
	discordUrl: "https://discord.gg/nagomi",
	instagramUrl: null,
	tiktokUrl: null,
	youtubeUrl: null,
	updatedAt: "2026-10-24T00:00:00Z",
	paymentOptions: [
		{
			method: "bank_transfer",
			position: 0,
			maxTotal: null,
			shippingZoneId: null,
			shippingZoneSlug: null,
		},
		{
			method: "cash_on_delivery",
			position: 1,
			maxTotal: 15000,
			shippingZoneId: 1,
			shippingZoneSlug: "metro",
		},
	],
};

function render(node: ReactNode) {
	const client = new QueryClient();
	client.setQueryData<unknown>(activeZonesQuery.queryKey, [
		{
			id: 1,
			slug: "metro",
			translations: [{ locale: "es", name: "San Salvador y alrededores" }],
		},
	]);
	client.setQueryData<unknown>(storeQuery.queryKey, {
		currency: "USD",
		countryCode: "SV",
		timeZone: "America/El_Salvador",
		defaultLocale: "es",
	});
	return renderToStaticMarkup(
		<QueryClientProvider client={client}>{node}</QueryClientProvider>,
	);
}

const control = (html: string, name: string) => {
	const at = html.indexOf(`name="${name}"`);
	if (at === -1) throw new Error(`No control named ${name}`);
	return html.slice(html.lastIndexOf("<", at), html.indexOf(">", at));
};

describe("IdentityCard", () => {
	test("shows what is stored, and a save that waits for a change", () => {
		const html = render(<IdentityCard settings={settings} />);
		expect(control(html, "name")).toContain('value="Nagomi"');
		expect(control(html, "currency")).toContain('value="USD"');
		expect(control(html, "whatsappNumber")).toContain('value="50371234567"');
		expect(html).toContain(m.admin_save());
		expect(html).toContain("disabled");
	});

	test("explains in the field why the currency and the main language are locked", () => {
		const html = render(<IdentityCard settings={settings} />);
		expect(html).toContain(m.admin_settings_currency_help());
		expect(html).toContain(m.admin_settings_locale_help());
	});

	test("an empty WhatsApp number is an empty field", () => {
		const html = render(
			<IdentityCard settings={{ ...settings, whatsappNumber: null }} />,
		);
		expect(control(html, "whatsappNumber")).toContain('value=""');
	});
});

describe("OperationsCard", () => {
	test("shows the numbers as text and a number that is not set as an empty field", () => {
		const html = render(<OperationsCard settings={settings} />);
		expect(control(html, "maxQuantityPerLine")).toContain('value="10"');
		expect(control(html, "returnWindowDays")).toContain('value="30"');
		expect(control(html, "lowStockThreshold")).toContain('value="5"');
		expect(control(html, "freeShippingFrom")).toContain('value="50.00"');
		expect(control(html, "timeZone")).toContain('value="America/El_Salvador"');
		expect(html).toContain(m.admin_settings_return_window_help());
	});

	test("a store that is not configured yet opens with empty fields", () => {
		const html = render(
			<OperationsCard
				settings={{
					...settings,
					timeZone: null,
					countryCode: null,
					orderCodePrefix: null,
					maxQuantityPerLine: null,
					freeShippingFrom: null,
				}}
			/>,
		);
		for (const name of [
			"timeZone",
			"countryCode",
			"orderCodePrefix",
			"maxQuantityPerLine",
			"freeShippingFrom",
		])
			expect(control(html, name)).toContain('value=""');
	});
});

describe("LegalCard", () => {
	test("shows the seller details and leaves empty the ones that are not set", () => {
		const html = render(<LegalCard settings={settings} />);
		expect(control(html, "legalName")).toContain(
			'value="Nagomi, S.A. de C.V."',
		);
		expect(control(html, "taxIdLabel")).toContain('value="NIT"');
		expect(control(html, "foundingYear")).toContain('value="2026"');
		expect(control(html, "phone")).toContain('value=""');
		expect(control(html, "email")).toContain('value=""');
		expect(html).toContain(m.admin_settings_business_help());
	});
});

describe("PaymentsCard", () => {
	const html = render(<PaymentsCard settings={settings} />);
	const checked = (method: string) =>
		html
			.slice(html.indexOf(`id="payment-${method}"`) - 200)
			.match(/aria-checked="(true|false)"/)?.[1];

	test("lists the accepted methods first, in their order, then the others unchecked", () => {
		expect(html.indexOf('id="payment-bank_transfer"')).toBeLessThan(
			html.indexOf('id="payment-cash_on_delivery"'),
		);
		expect(html.indexOf('id="payment-cash_on_delivery"')).toBeLessThan(
			html.indexOf('id="payment-card"'),
		);
		expect(checked("bank_transfer")).toBe("true");
		expect(checked("card")).toBe("false");
	});

	test("shows a method's limit and zone", () => {
		expect(html).toContain('value="150.00"');
		expect(html).toContain("San Salvador y alrededores");
		expect(html).toMatch(/<option[^>]*value="1"[^>]*selected/);
	});
});

describe("CustomersCard", () => {
	test("shows the thresholds, and an unset one as an empty field", () => {
		const html = render(<CustomersCard settings={settings} />);
		expect(control(html, "frequentCustomerMinOrders")).toContain('value="3"');
		expect(control(html, "inactiveCustomerDays")).toContain('value="90"');
		expect(control(html, "followupPendingPaymentHours")).toContain(
			'value="48"',
		);
		expect(control(html, "followupShippedUndeliveredHours")).toContain(
			'value=""',
		);
	});
});

describe("SocialCard", () => {
	test("shows the stored links and the empty ones", () => {
		const html = render(<SocialCard settings={settings} />);
		expect(control(html, "discordUrl")).toContain(
			'value="https://discord.gg/nagomi"',
		);
		expect(control(html, "instagramUrl")).toContain('value=""');
	});
});

const promise: AdminPromises[number] = {
	id: 1,
	slug: "free-shipping",
	position: 0,
	isPublished: true,
	translations: [
		{ promiseId: 1, locale: "es", title: "Envío gratis", body: "Desde $50" },
	],
};

describe("PromiseCard", () => {
	test("is headed by its title in the main language, with its identifier under it", () => {
		const html = render(<PromiseCard promise={promise} defaultLocale="es" />);
		expect(html).toContain("Envío gratis");
		expect(html).toContain("free-shipping");
		expect(control(html, "title")).toContain('value="Envío gratis"');
	});

	test("shows its publish switch on", () => {
		expect(
			render(<PromiseCard promise={promise} defaultLocale="es" />),
		).toContain('aria-checked="true"');
		expect(
			render(
				<PromiseCard
					promise={{ ...promise, isPublished: false }}
					defaultLocale="es"
				/>,
			),
		).not.toContain('aria-checked="true"');
	});

	test("is headed by its identifier when it has no text in the main language", () => {
		const html = render(
			<PromiseCard
				promise={{ ...promise, translations: [] }}
				defaultLocale="es"
			/>,
		);
		expect(html).toContain("free-shipping");
		expect(html).not.toContain("Envío gratis");
	});
});

const page: AdminPages[number] = {
	id: 1,
	slug: "privacy",
	isPublished: true,
	footerPosition: null,
	updatedAt: "2026-10-24T00:00:00Z",
	translations: [
		{
			pageId: 1,
			locale: "es",
			version: 3,
			title: "Privacidad",
			bodyMarkdown: "# Texto",
			createdAt: "2026-10-20T15:00:00Z",
		},
	],
};

describe("PageCard", () => {
	test("says which version is current and offers the earlier ones", () => {
		const html = render(<PageCard page={page} defaultLocale="es" />);
		expect(html).toContain("/privacy");
		expect(html).toContain(
			m.admin_settings_page_current({
				version: 3,
				date: formatInstant(
					"2026-10-20T15:00:00Z",
					"es-SV",
					"America/El_Salvador",
					{ dateStyle: "medium", timeStyle: "short" },
				),
			}),
		);
		expect(html).toContain(m.admin_settings_versions());
		expect(control(html, "title")).toContain('value="Privacidad"');
		expect(html).toContain("# Texto");
	});

	test("a language without a text has no versions to show", () => {
		const html = render(
			<PageCard page={{ ...page, translations: [] }} defaultLocale="es" />,
		);
		expect(html).toContain(m.admin_settings_page_none());
		expect(html).not.toContain(m.admin_settings_versions());
	});
});
