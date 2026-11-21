import { bodyLimit } from "hono/body-limit";

export const limitBody = (maxSize: number) =>
	bodyLimit({
		maxSize,
		onError: (c) => c.json({ error: "payload_too_large" }, 413),
	});
