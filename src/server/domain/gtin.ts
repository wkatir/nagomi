export class InvalidGtinError extends Error {
	constructor(readonly input: string) {
		super(`Invalid GTIN ${input}`);
	}
}

// GS1 check digit.
function checkDigit(data: string) {
	let sum = 0;
	for (let i = 0; i < data.length; i++) {
		const digit = Number(data[data.length - 1 - i]);
		sum += digit * (i % 2 === 0 ? 3 : 1);
	}
	return (10 - (sum % 10)) % 10;
}

// Stored as GTIN-14: left-padding with zeros keeps the check digit valid.
export function normalizeGtin(input: string): string {
	const digits = input.replace(/[\s-]/g, "");
	if (!/^\d+$/.test(digits) || ![8, 12, 13, 14].includes(digits.length))
		throw new InvalidGtinError(input);
	const gtin = digits.padStart(14, "0");
	if (checkDigit(gtin.slice(0, 13)) !== Number(gtin[13]))
		throw new InvalidGtinError(input);
	return gtin;
}
