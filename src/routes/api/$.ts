import { createFileRoute } from "@tanstack/react-router";
import { api } from "#/server/app";

const handle = ({ request }: { request: Request }) => api.fetch(request);

export const Route = createFileRoute("/api/$")({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
			PATCH: handle,
			PUT: handle,
			DELETE: handle,
		},
	},
});
