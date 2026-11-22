import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PUBLISH_REQUIREMENTS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { PublishChecklist } from "./status-card";

const render = (missing: Parameters<typeof PublishChecklist>[0]["missing"]) =>
	renderToStaticMarkup(
		<PublishChecklist missing={missing} defaultLocale="es" />,
	);

describe("PublishChecklist", () => {
	test("lists every requirement, each once, in order", () => {
		const html = render([]);
		expect(html.match(/<li /g)).toHaveLength(PUBLISH_REQUIREMENTS.length);
		const positions = [
			m.admin_product_req_price(),
			m.admin_product_req_brand(),
			m.admin_product_req_category(),
		].map((label) => html.indexOf(label));
		expect(positions.every((p) => p > 0)).toBe(true);
		expect([...positions].sort((a, b) => a - b)).toEqual(positions);
	});

	test("names the store's language where the text must be in it", () => {
		const html = render([]);
		expect(html).toContain(m.admin_product_req_text({ language: "Español" }));
		expect(html).toContain(
			m.admin_product_req_photo_alt({ language: "Español" }),
		);
		expect(
			renderToStaticMarkup(
				<PublishChecklist missing={[]} defaultLocale="en" />,
			),
		).toContain(m.admin_product_req_text({ language: "English" }));
	});

	test("marks as missing only what the API says is missing", () => {
		const html = render(["price", "photo_alt"]);
		expect(html.match(/data-missing="true"/g)).toHaveLength(2);
		expect(html.match(/data-missing="false"/g)).toHaveLength(3);
		expect(
			html.match(new RegExp(m.admin_product_req_missing(), "g")),
		).toHaveLength(2);
		expect(
			html.match(new RegExp(m.admin_product_req_done(), "g")),
		).toHaveLength(3);
		const price = html.indexOf(m.admin_product_req_price());
		expect(html.slice(html.lastIndexOf("<li", price), price)).toContain(
			'data-missing="true"',
		);
		const brand = html.indexOf(m.admin_product_req_brand());
		expect(html.slice(html.lastIndexOf("<li", brand), brand)).toContain(
			'data-missing="false"',
		);
	});
});
