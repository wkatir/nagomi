const KB = 1024;
const MB = KB * 1024;

export function formatFileSize(bytes: number, locale: string): string {
	if (bytes < KB) return `${new Intl.NumberFormat(locale).format(bytes)} B`;
	const [unit, divisor] =
		bytes < MB ? (["kilobyte", KB] as const) : (["megabyte", MB] as const);
	return new Intl.NumberFormat(locale, {
		style: "unit",
		unit,
		maximumFractionDigits: 1,
	}).format(bytes / divisor);
}
