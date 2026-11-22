// SQLite's lower() and LIKE fold ASCII only, so searchable rows keep a `search_key` written
// with searchKey() and terms are normalized the same way.
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
