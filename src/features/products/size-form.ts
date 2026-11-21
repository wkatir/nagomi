import type { SizeUnit } from "#/lib/enums";
import { PRODUCT_LIMITS } from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
// The same check the API runs on a barcode, whose check digit a person can get wrong.
import { InvalidGtinError, normalizeGtin } from "#/server/domain/gtin";

export type SizeValues = {
	sku: string;
	sizeValue: string;
	sizeUnit: "" | SizeUnit;
	price: string;
	compareAtPrice: string;
	gtin: string;
	reorderPoint: string;
};

export const emptySize: SizeValues = {
	sku: "",
	sizeValue: "",
	sizeUnit: "",
	price: "",
	compareAtPrice: "",
	gtin: "",
	reorderPoint: "",
};

// Largest price, size and reorder point the API takes.
const MAX_AMOUNT = 100_000_000;
const MAX_SIZE = 100_000;
const MAX_REORDER = 100_000;

// Either case: the API puts the SKU in capitals.
const SKU_SHAPE = /^[A-Za-z0-9]+(?:[-_.][A-Za-z0-9]+)*$/;

type Rules = {
	// Text to minor units.
	parseAmount: (text: string) => number | null;
	// An active size of a published product always has a price.
	priceRequired: boolean;
};

export type SizeIssue = { field: keyof SizeValues; message: string };

const isCount = (text: string, max: number) =>
	/^\d+$/.test(text) && Number(text) <= max;

// What a person can be told without asking the API, which checks the same and more (a SKU
// already taken).
export function sizeIssues(value: SizeValues, rules: Rules): SizeIssue[] {
	const issues: SizeIssue[] = [];
	const add = (field: keyof SizeValues, message: string) =>
		issues.push({ field, message });
	const sku = value.sku.trim();
	if (sku === "") add("sku", m.admin_required());
	else if (!SKU_SHAPE.test(sku) || sku.length > PRODUCT_LIMITS.sku)
		add("sku", m.admin_product_sku_invalid());

	const sizeValue = value.sizeValue.trim();
	if (sizeValue !== "" && !(isCount(sizeValue, MAX_SIZE) && +sizeValue > 0))
		add("sizeValue", m.admin_product_size_invalid());
	else if (sizeValue !== "" && value.sizeUnit === "")
		add("sizeUnit", m.admin_required());
	else if (sizeValue === "" && value.sizeUnit !== "")
		add("sizeValue", m.admin_required());

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

// Only once `sizeIssues` found nothing.
export function sizePayload(
	value: SizeValues,
	parseAmount: Rules["parseAmount"],
) {
	const amount = (text: string) =>
		text.trim() === "" ? null : parseAmount(text);
	const count = (text: string) => (text.trim() === "" ? null : Number(text));
	return {
		sku: value.sku.trim(),
		price: amount(value.price),
		compareAtPrice: amount(value.compareAtPrice),
		sizeValue: count(value.sizeValue),
		sizeUnit: value.sizeUnit === "" ? null : value.sizeUnit,
		gtin: orNull(value.gtin),
		reorderPoint: count(value.reorderPoint),
	};
}

export function sizeValues(
	size: {
		sku: string;
		sizeValue: number | null;
		sizeUnit: SizeUnit | null;
		price: number | null;
		compareAtPrice: number | null;
		gtin: string | null;
		reorderPoint: number | null;
	},
	toInput: (amount: number) => string,
): SizeValues {
	return {
		sku: size.sku,
		sizeValue: size.sizeValue === null ? "" : String(size.sizeValue),
		sizeUnit: size.sizeUnit ?? "",
		price: size.price === null ? "" : toInput(size.price),
		compareAtPrice:
			size.compareAtPrice === null ? "" : toInput(size.compareAtPrice),
		gtin: size.gtin ?? "",
		reorderPoint: size.reorderPoint === null ? "" : String(size.reorderPoint),
	};
}
