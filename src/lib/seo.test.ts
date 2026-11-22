import { describe, expect, test } from "bun:test";
import {
	alternateLinks,
	breadcrumbJsonLd,
	collectionPageJsonLd,
	isNoindex,
	type JsonLd,
	listPageMeta,
	localizedUrl,
	organizationJsonLd,
	pageMeta,
	pagePath,
	productJsonLd,
	type StoreIdentity,
	shareImage,
	stockAvailability,
	storeHead,
	webSiteJsonLd,
} from "./seo";

const origin = "https://shop.example";
const store: StoreIdentity = {
	name: "Nagomi",
	countryCode: "SV",
	whatsappNumber: "50362862515",
	business: {
		legalName: "Nagomi, S.A. de C.V.",
		email: "contact@shop.example",
		phone: null,
	},
};

// What a crawler reads: undefined members disappear.
const serialized = (data: JsonLd) => JSON.parse(JSON.stringify(data));

// The shape every JSON-LD block must have, and the fields Google needs per type
// (https://developers.google.com/search/docs/appearance/structured-data/search-gallery).
function expectValidJsonLd(data: JsonLd) {
	const json = serialized(data);
	expect(json["@context"]).toBe("https://schema.org");
	expect(typeof json["@type"]).toBe("string");
	const absolute = (url: string) =>
		expect(new URL(url).origin).toBe(new URL(origin).origin);
	switch (json["@type"]) {
		case "OnlineStore":
			expect(json.name).toBeString();
			absolute(json.url);
			absolute(json.logo);
			break;
		case "WebSite":
			expect(json.name).toBeString();
			expect(json.url).toBe(`${origin}/`);
			break;
		case "Product":
			expect(json.name).toBeString();
			expect(json.image.length).toBeGreaterThan(0);
			for (const image of json.image) absolute(image);
			expect(json.offers.price).toMatch(/^\d+(\.\d+)?$/);
			expect(json.offers.priceCurrency).toMatch(/^[A-Z]{3}$/);
			expect(json.offers.availability).toStartWith("https://schema.org/");
			break;
		case "CollectionPage":
			absolute(json.url);
			expect(json.mainEntity["@type"]).toBe("ItemList");
			expect(json.mainEntity.numberOfItems).toBe(
				json.mainEntity.itemListElement.length,
			);
			for (const [i, item] of json.mainEntity.itemListElement.entries()) {
				expect(item.position).toBe(i + 1);
				absolute(item.url);
			}
			break;
		case "BreadcrumbList":
			for (const [i, item] of json.itemListElement.entries()) {
				expect(item.position).toBe(i + 1);
				absolute(item.item);
			}
			break;
		default:
			throw new Error(`Unexpected @type ${json["@type"]}`);
	}
	return json;
}

describe("URLs", () => {
	test("Spanish has no prefix and English lives under /en", () => {
		expect(localizedUrl(origin, "/products/keyboard", "es")).toBe(
			`${origin}/products/keyboard`,
		);
		expect(localizedUrl(origin, "/products/keyboard", "en")).toBe(
			`${origin}/en/products/keyboard`,
		);
		// The English home is /en/, where /en redirects.
		expect(localizedUrl(origin, "/", "en")).toBe(`${origin}/en/`);
		expect(localizedUrl(origin, "/", "es")).toBe(`${origin}/`);
	});

	test("the page path is the leaf route's, without a trailing slash", () => {
		const match = (pathname: string, noindex?: boolean) => ({
			pathname,
			staticData: { noindex },
		});
		expect(pagePath([match("/"), match("/products/")])).toBe("/products");
		expect(pagePath([match("/"), match("/")])).toBe("/");
		expect(() => pagePath([])).toThrow();
		expect(isNoindex([match("/"), match("/cart", true)])).toBe(true);
		expect(isNoindex([match("/"), match("/products")])).toBe(false);
	});

	test("canonical is the page's own locale; x-default is Spanish", () => {
		expect(alternateLinks(origin, "/products", "en")).toEqual([
			{ rel: "canonical", href: `${origin}/en/products` },
			{ rel: "alternate", hrefLang: "es", href: `${origin}/products` },
			{ rel: "alternate", hrefLang: "en", href: `${origin}/en/products` },
			{ rel: "alternate", hrefLang: "x-default", href: `${origin}/products` },
		]);
	});
});

describe("store head", () => {
	const head = (path: string, noindex = false, locale: "es" | "en" = "es") =>
		storeHead({
			origin,
			locale,
			path,
			noindex,
			store,
			title: "Nagomi | Periféricos",
			description: "Periféricos y setups.",
		});
	const content = (meta: Record<string, unknown>[], key: string) =>
		meta
			.filter((m) => m.property === key || m.name === key)
			.map((m) => m.content);
	const jsonLd = (meta: Record<string, unknown>[]) =>
		meta.flatMap((m) => ("script:ld+json" in m ? [m["script:ld+json"]] : []));

	test("the home page carries the store and site name for Google", () => {
		const { meta, links } = head("/");
		const blocks = jsonLd(meta).map((d) => expectValidJsonLd(d as JsonLd));
		expect(blocks.map((b) => b["@type"])).toEqual(["OnlineStore", "WebSite"]);
		expect(links.find((l) => l.rel === "canonical")?.href).toBe(`${origin}/`);
		expect(content(meta, "og:url")).toEqual([`${origin}/`]);
	});

	test("Open Graph follows the locale and the store's country", () => {
		const { meta } = head("/products", false, "en");
		expect(content(meta, "og:locale")).toEqual(["en_SV"]);
		expect(content(meta, "og:locale:alternate")).toEqual(["es_SV"]);
		expect(content(meta, "og:image")).toEqual([`${origin}/og-default-en.png`]);
		expect(content(meta, "og:image:width")).toEqual(["1200"]);
		expect(content(meta, "og:image:height")).toEqual(["630"]);
		expect(content(meta, "og:site_name")).toEqual(["Nagomi"]);
		expect(content(meta, "twitter:card")).toEqual(["summary_large_image"]);
		expect(content(meta, "og:url")).toEqual([`${origin}/en/products`]);
		expect(jsonLd(meta)).toEqual([]);
	});

	test("a noindex page has no canonical, alternates or structured data", () => {
		const { meta, links } = head("/", true);
		expect(links).toEqual([]);
		expect(jsonLd(meta)).toEqual([]);
	});

	test("link previews use the largest photo that is at least 200px", () => {
		const photo = (width: number, height: number) => ({
			url: `${origin}/media/${width}x${height}.webp`,
			width,
			height,
			alt: "Keyboard",
		});
		expect(
			shareImage([photo(175, 529), photo(1600, 2000), photo(800, 800)]),
		).toEqual(photo(1600, 2000));
		expect(shareImage([photo(175, 529)])).toBeUndefined();
	});

	test("page meta overrides title and description", () => {
		expect(
			pageMeta({
				title: "Keyboard",
				storeName: "Nagomi",
				description: "Mechanical.",
			}),
		).toEqual([
			{ title: "Keyboard | Nagomi" },
			{ property: "og:title", content: "Keyboard" },
			{ name: "description", content: "Mechanical." },
			{ property: "og:description", content: "Mechanical." },
		]);
		expect(
			pageMeta({ title: "Keyboard", storeName: "Nagomi", description: null }),
		).toHaveLength(2);
	});
});

describe("JSON-LD", () => {
	test("organization contact comes from the store; empty fields are left out", () => {
		const json = expectValidJsonLd(
			organizationJsonLd(origin, store, "Computer peripherals."),
		);
		expect(json.description).toBe("Computer peripherals.");
		expect(json.legalName).toBe("Nagomi, S.A. de C.V.");
		expect(json.logo).toBe(`${origin}/logo.png`);
		expect(json.contactPoint.telephone).toBe("+50362862515");
		expect(json.contactPoint.email).toBe("contact@shop.example");
		expect(json.areaServed).toBe("SV");
		expect("telephone" in json).toBe(false);

		const bare = serialized(
			organizationJsonLd(
				origin,
				{
					...store,
					whatsappNumber: null,
					business: { legalName: null, email: null, phone: "+503 2222-3333" },
				},
				"Computer peripherals.",
			),
		);
		expect("legalName" in bare).toBe(false);
		expect("contactPoint" in bare).toBe(false);
		expect(bare.telephone).toBe("+50322223333");
	});

	test("the site search points at the product listing in the page's locale", () => {
		const json = expectValidJsonLd(webSiteJsonLd(origin, store, "en"));
		expect(json.name).toBe("Nagomi");
		expect(json.publisher["@id"]).toBe(`${origin}/#organization`);
		expect(json.potentialAction.target.urlTemplate).toBe(
			`${origin}/en/products?q={search_term_string}`,
		);
	});

	test("product offers carry the decimal price and our stock meaning", () => {
		const product = (
			price: number,
			currency: string,
			availability: "in_stock" | "sold_out",
		) =>
			expectValidJsonLd(
				productJsonLd({
					url: `${origin}/products/keyboard`,
					name: "Keychron K2 Keyboard",
					brand: "Keychron",
					description: null,
					images: [`${origin}/media/a.webp`],
					sku: "KEY-K2-RGB",
					price,
					currency,
					availability: stockAvailability(availability),
					seller: "Nagomi",
				}),
			);
		const inStock = product(1551, "USD", "in_stock");
		expect(inStock.offers.price).toBe("15.51");
		expect(inStock.offers.priceCurrency).toBe("USD");
		expect(inStock.offers.availability).toBe("https://schema.org/InStock");
		expect(inStock.brand).toEqual({ "@type": "Brand", name: "Keychron" });
		expect("description" in inStock).toBe(false);

		const soldOut = product(1500, "JPY", "sold_out");
		expect(soldOut.offers.price).toBe("1500");
		expect(soldOut.offers.availability).toBe("https://schema.org/OutOfStock");
	});

	test("a list page names its products in order, and leaves out an empty description", () => {
		const json = expectValidJsonLd(
			collectionPageJsonLd({
				origin,
				url: `${origin}/needs/gaming`,
				name: "Gaming",
				description: null,
				items: [
					{ name: "Keychron Keyboard", url: `${origin}/products/keyboard` },
					{ name: "Logitech Mouse", url: `${origin}/products/mouse` },
				],
			}),
		);
		expect(json.isPartOf["@id"]).toBe(`${origin}/#website`);
		expect(json.mainEntity.numberOfItems).toBe(2);
		expect("description" in json).toBe(false);
	});

	test("the head of a list page has its text, the collection and the same trail as the page", () => {
		const meta = listPageMeta({
			origin,
			locale: "en",
			storeName: "Nagomi",
			title: "Products for gaming",
			description: "Keyboards and mice.",
			trail: {
				ancestors: ["home", "shop"],
				current: { name: "Gaming", path: "/needs/gaming" },
			},
			items: [{ name: "Keychron Keyboard", path: "/products/keyboard" }],
		});
		expect(meta).toContainEqual({ title: "Products for gaming | Nagomi" });
		expect(meta).toContainEqual({
			name: "description",
			content: "Keyboards and mice.",
		});
		const blocks = meta
			.filter((m) => "script:ld+json" in m)
			.map((m) => expectValidJsonLd(m["script:ld+json"] as JsonLd));
		expect(blocks.map((b) => b["@type"])).toEqual([
			"CollectionPage",
			"BreadcrumbList",
		]);
		expect(blocks[0].url).toBe(`${origin}/en/needs/gaming`);
		expect(blocks[0].mainEntity.itemListElement[0].url).toBe(
			`${origin}/en/products/keyboard`,
		);
		expect(
			blocks[1].itemListElement.map((i: { item: string }) => i.item),
		).toEqual([
			`${origin}/en/`,
			`${origin}/en/products`,
			`${origin}/en/needs/gaming`,
		]);
	});

	test("breadcrumbs are numbered from 1", () => {
		const json = expectValidJsonLd(
			breadcrumbJsonLd([
				{ name: "Inicio", url: `${origin}/` },
				{ name: "Productos", url: `${origin}/products` },
			]),
		);
		expect(json.itemListElement.map((i: { name: string }) => i.name)).toEqual([
			"Inicio",
			"Productos",
		]);
	});
});
