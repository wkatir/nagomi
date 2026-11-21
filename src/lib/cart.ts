import { useSuspenseQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { z } from "zod";
import { storeQuery } from "./queries";

// Also checked by the order API.
export const useMaxQuantity = () =>
	useSuspenseQuery(storeQuery).data.maxQuantityPerLine;

// Cart keeps only SKU and quantity; prices always come from the server.
const Lines = z.array(
	z.object({
		sku: z.string(),
		quantity: z.number().int().min(1),
	}),
);
export type CartLine = z.infer<typeof Lines>[number];
const KEY = "eclalune:cart:v1";
const listeners = new Set<() => void>();
let cache: CartLine[] | null = null;

function parse(raw: string): CartLine[] | null {
	let json: unknown;
	try {
		json = JSON.parse(raw);
	} catch {
		return null;
	}
	const result = Lines.safeParse(json);
	return result.success ? result.data : null;
}

function stored(): string | null {
	try {
		return localStorage.getItem(KEY);
	} catch {
		// Storage can be blocked by the browser; the cart then lives only in this tab.
		return null;
	}
}

function read(): CartLine[] {
	if (cache) return cache;
	const raw = stored();
	const lines = raw === null ? [] : parse(raw);
	if (lines) {
		cache = lines;
		return cache;
	}
	console.warn("Discarded an invalid cart from localStorage", raw);
	localStorage.removeItem(KEY);
	cache = [];
	return cache;
}

function write(lines: CartLine[]) {
	cache = lines;
	try {
		localStorage.setItem(KEY, JSON.stringify(lines));
	} catch {
		// Storage can be unavailable (private mode); the cart still works for this tab.
	}
	for (const l of listeners) l();
}

const EMPTY: CartLine[] = [];
const subscribe = (l: () => void) => {
	listeners.add(l);
	return () => {
		listeners.delete(l);
	};
};

// Another tab changed the bag: drop the cached copy, or this tab would overwrite it.
if (typeof window !== "undefined")
	window.addEventListener("storage", (e) => {
		if (e.key !== KEY && e.key !== null) return;
		cache = null;
		for (const l of listeners) l();
	});

export const useCart = () => useSyncExternalStore(subscribe, read, () => EMPTY);

type Addition = { sku: string; quantity: number; max: number };

// `max` is the size's maxQuantity in the catalogue: the units it has left, already capped
// at the store's limit per line.
function withAdded(lines: CartLine[], { sku, quantity, max }: Addition) {
	if (max <= 0) return lines;
	const existing = lines.find((l) => l.sku === sku);
	return existing
		? lines.map((l) =>
				l.sku === sku
					? { ...l, quantity: Math.min(max, l.quantity + quantity) }
					: l,
			)
		: [...lines, { sku, quantity: Math.min(max, quantity) }];
}

function addAll(additions: Addition[]) {
	const lines = read();
	const next = additions.reduce(withAdded, lines);
	if (next !== lines) write(next);
}

export const cart = {
	add: (sku: string, quantity: number, max: number) =>
		addAll([{ sku, quantity, max }]),
	addMany: addAll,
	set: (sku: string, quantity: number, max: number) =>
		write(
			read().map((l) =>
				l.sku === sku ? { ...l, quantity: Math.min(max, quantity) } : l,
			),
		),
	remove: (sku: string) => write(read().filter((l) => l.sku !== sku)),
	clear: () => write([]),
};
