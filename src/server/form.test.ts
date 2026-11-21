import { describe, expect, test } from "bun:test";
import { Hono } from "hono";
import { multipartForm } from "./form";

const app = new Hono().post("/", async (c) => {
	const form = await multipartForm(c);
	if (form instanceof Response) return form;
	return c.json({ name: form.get("name") });
});

const post = (body: BodyInit, headers?: Record<string, string>) =>
	app.request("/", { method: "POST", body, headers });
const json = async (res: Response): Promise<unknown> => res.json();

describe("multipartForm", () => {
	test("reads a multipart form", async () => {
		const form = new FormData();
		form.set("name", "photo");
		const res = await post(form);
		expect(res.status).toBe(200);
		expect(await json(res)).toEqual({ name: "photo" });
	});

	test("answers 400 for another content type", async () => {
		const res = await post('{"file":"x"}', {
			"content-type": "application/json",
		});
		expect(res.status).toBe(400);
		expect(await json(res)).toEqual({ error: "invalid_form" });
		expect((await post("")).status).toBe(400);
	});

	test("answers 400 for a broken multipart body", async () => {
		const res = await post("garbage", {
			"content-type": "multipart/form-data; boundary=abc",
		});
		expect(res.status).toBe(400);
		expect(await json(res)).toEqual({ error: "invalid_form" });
	});
});
