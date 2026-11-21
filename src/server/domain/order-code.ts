// Unambiguous alphabet: no 0/O, 1/I/L.
const ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";

export function newOrderCode(
	prefix: string,
	random: (n: number) => Uint8Array = (n) =>
		crypto.getRandomValues(new Uint8Array(n)),
): string {
	return `${prefix}-${Array.from(random(6), (b) => ALPHABET[b % ALPHABET.length]).join("")}`;
}
