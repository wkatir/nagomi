import { SKU_REGEX } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
// The same check the API runs on a barcode, whose check digit a person can get wrong.
import { InvalidGtinError, normalizeGtin } from "#/server/domain/gtin";

export type VariantValues = {
	sku: string;
	optionLabel: string;
	price: string;
	compareAtPrice: string;
	gtin: string;
	reorderPoint: string;
};

export const emptyVariant: VariantValues = {
	sku: "",
	optionLabel: "",
	price: "",
	compareAtPrice: "",
	gtin: "",
	reorderPoint: "",
};

// Largest price and reorder point the API takes.
const MAX_AMOUNT = 100_000_000;
const MAX_REORDER = 100_000;

type Rules = {
	// Text to minor units.
	parseAmount: (text: string) => number | null;
	// An active variant of a published product always has a price.
	priceRequired: boolean;
};

export type VariantIssue = { field: keyof VariantValues; message: string };

const isCount = (text: string, max: number) =>
	/^\d+$/.test(text) && Number(text) <= max;

// What a person can be told without asking the API, which checks the same and more (a SKU
// already taken).
export function variantIssues(
	value: VariantValues,
	rules: Rules,
): VariantIssue[] {
	const issues: VariantIssue[] = [];
	const add = (field: keyof VariantValues, message: string) =>
		issues.push({ field, message });
	const sku = value.sku.trim();
	if (sku === "") add("sku", m.admin_required());
	else if (!SKU_REGEX.test(sku.toUpperCase()))
		add("sku", m.admin_product_sku_invalid());

	if (value.optionLabel.trim().length > PRODUCT_LIMITS.optionLabel)
		add("optionLabel", m.admin_product_option_too_long());

	const price =
		value.price.trim() === "" ? null : rules.parseAmount(value.price);
	if (
		value.price.trim() !== "" &&
		(price === null || price < 1 || price > MAX_AMOUNT)
	)
		add("price", m.admin_invalid_amount());
	else if (value.price.trim() === "" && rules.priceRequired)
		add("price", m.admin_required());

	if (value.compareAtPrice.trim() !== "") {
		const compareAt = rules.parseAmount(value.compareAtPrice);
		if (compareAt === null || compareAt < 1 || compareAt > MAX_AMOUNT)
			add("compareAtPrice", m.admin_invalid_amount());
		else if (price === null || compareAt <= price)
			add("compareAtPrice", m.admin_product_compare_over_price());
	}

	if (value.gtin.trim() !== "") {
		try {
			normalizeGtin(value.gtin);
		} catch (error) {
			if (!(error instanceof InvalidGtinError)) throw error;
			add("gtin", m.admin_product_gtin_invalid());
		}
	}

	if (
		value.reorderPoint.trim() !== "" &&
		!isCount(value.reorderPoint.trim(), MAX_REORDER)
	)
		add("reorderPoint", m.admin_product_reorder_invalid());
	return issues;
}

const orNull = (text: string) => text.trim() || null;

// Only once `variantIssues` found nothing.
export function variantPayload(
	value: VariantValues,
	parseAmount: Rules["parseAmount"],
) {
	const amount = (text: string) =>
		text.trim() === "" ? null : parseAmount(text);
	const count = (text: string) => (text.trim() === "" ? null : Number(text));
	return {
		sku: value.sku.trim().toUpperCase(),
		price: amount(value.price),
		compareAtPrice: amount(value.compareAtPrice),
		optionLabel: orNull(value.optionLabel),
		gtin: orNull(value.gtin),
		reorderPoint: count(value.reorderPoint),
	};
}

export function variantValues(
	size: {
		sku: string;
		optionLabel: string | null;
		price: number | null;
		compareAtPrice: number | null;
		gtin: string | null;
		reorderPoint: number | null;
	},
	toInput: (amount: number) => string,
): VariantValues {
	return {
		sku: size.sku,
		optionLabel: size.optionLabel ?? "",
		price: size.price === null ? "" : toInput(size.price),
		compareAtPrice:
			size.compareAtPrice === null ? "" : toInput(size.compareAtPrice),
		gtin: size.gtin ?? "",
		reorderPoint: size.reorderPoint === null ? "" : String(size.reorderPoint),
	};
}
