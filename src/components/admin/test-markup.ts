export const textOf = (markup: string) =>
	markup
		.replace(/<[^>]+>/g, "\u0001")
		.split("\u0001")
		.filter(Boolean)
		.join(" | ");

export const rows = (html: string) =>
	[...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/g)].map(([, row]) =>
		[...row.matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/g)].map(([, cell]) =>
			textOf(cell),
		),
	);

export const stats = (html: string) =>
	[
		...html.matchAll(
			/<p class="type-small[^"]*">(.*?)<\/p><p class="type-stat[^"]*"[^>]*>(.*?)<\/p>(?:<p class="type-meta[^"]*">(.*?)<\/p>)?/g,
		),
	].map(([, label, value, note]) => [label, value, note ?? ""]);

export const linkedStats = (html: string) =>
	[
		...html.matchAll(
			/<a href="([^"]*)"[^>]*>(.*?)<\/a><\/p><p class="type-stat[^"]*"[^>]*>(.*?)<\/p>(?:<p class="type-meta[^"]*">(.*?)<\/p>)?/g,
		),
	].map(([, href, label, value, note]) => [
		href,
		textOf(label),
		textOf(value),
		textOf(note ?? ""),
	]);

export const facts = (html: string) =>
	[...html.matchAll(/<dt[^>]*>(.*?)<\/dt><dd[^>]*>(.*?)<\/dd>/g)].map(
		([, term, definition]) => [textOf(term), textOf(definition)],
	);
