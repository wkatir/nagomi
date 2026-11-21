import { createFileRoute } from "@tanstack/react-router";
import { authApi } from "#/server/auth-api";

const handle = ({ request }: { request: Request }) => authApi.fetch(request);

export const Route = createFileRoute("/api/auth/$")({
	server: {
		handlers: {
			GET: handle,
			POST: handle,
		},
	},
});
