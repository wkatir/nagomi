// SQLite's lower() and LIKE fold ASCII only, so "Crème" and "ÁNGELA" would not match
// "creme" or "angela". Searchable rows keep a `search_key` column written by the API with
// searchKey(), and a search term is normalized the same way (searchPatterns).

// Phone numbers are added as their digits (phoneDigits) so "7123-4567" and
// "+503 7123 4567" both find them.
export function searchKey(...parts: (string | null | undefined)[]): string {
	return parts
		.filter((p): p is string => typeof p === "string" && p.trim() !== "")
		.map(normalize)
		.join(" ");
}

const normalize = (text: string) =>
	text
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();

export const phoneDigits = (phone: string | null | undefined) =>
	phone ? phone.replace(/\D/g, "") : null;

// The digits alone match phones typed with spaces or dashes. LIKE wildcards are escaped:
// use ESCAPE '\'.
export function searchPatterns(term: string): string[] {
	const text = normalize(term);
	const digits = term.replace(/\D/g, "");
	return [
		...(text ? [text] : []),
		...(digits.length >= 3 && digits !== text ? [digits] : []),
	].map((p) => `%${p.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
}

export const withoutSearchKey = <T extends { searchKey: string }>({
	searchKey: _,
	...row
}: T): Omit<T, "searchKey"> => row;
