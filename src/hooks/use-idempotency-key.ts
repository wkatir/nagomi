import { useState } from "react";

// One key per distinct request: a retry of the same request (a network error, a second
// click) sends the same key and gets the order already stored, while changing the request
// starts a new one.
export function useIdempotencyKey(request: unknown) {
	const signature = JSON.stringify(request);
	const [current, setCurrent] = useState(() => ({
		signature,
		key: crypto.randomUUID(),
	}));
	if (current.signature === signature) return current.key;
	const next = { signature, key: crypto.randomUUID() };
	setCurrent(next);
	return next.key;
}
