import { z } from "zod";
import { sha256Hex } from "./hash";

export const idempotencyKey = z.string().trim().toLowerCase().pipe(z.uuid());

export function canonicalJson(value: unknown): string {
	if (value === undefined) throw new Error("undefined cannot be hashed");
	if (value === null || typeof value !== "object") {
		if (typeof value === "number" && !Number.isFinite(value))
			throw new Error(`Non-finite number ${value}`);
		return JSON.stringify(value);
	}
	if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
	const entries = Object.entries(value)
		.filter(([, v]) => v !== undefined)
		.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
	return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

export const requestHash = (value: unknown) =>
	sha256Hex(new TextEncoder().encode(canonicalJson(value)));
