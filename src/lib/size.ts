import { m } from "#/paraglide/messages";

export function formatSize(
	size: { value: number; unit: "ml" | "g" | "units" } | null,
) {
	if (!size) return null;
	return size.unit === "units"
		? m.size_units({ value: String(size.value) })
		: `${size.value} ${size.unit}`;
}
