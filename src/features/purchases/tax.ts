import { m } from "#/paraglide/messages";

// "" is not known yet: the supplier has not said.
export type TaxChoice = "" | "included" | "excluded";

export const taxOptions = () => [
	{ value: "", label: m.admin_po_tax_unknown() },
	{ value: "included", label: m.admin_po_tax_included() },
	{ value: "excluded", label: m.admin_po_tax_excluded() },
];

export const taxOfChoice = (choice: TaxChoice) =>
	choice === "" ? null : choice === "included";

export const taxLabel = (taxIncluded: boolean | null) =>
	taxIncluded === null
		? m.admin_po_tax_unknown()
		: taxIncluded
			? m.admin_po_tax_included()
			: m.admin_po_tax_excluded();

export const choiceOfTax = (taxIncluded: boolean | null): TaxChoice =>
	taxIncluded === null ? "" : taxIncluded ? "included" : "excluded";
