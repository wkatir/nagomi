import { m } from "#/paraglide/messages";
import type { ProductOption } from "./options";

// An archived option the product still points at stays, so its select can show it.
export const choosable = (options: ProductOption[], current: string[]) =>
	options
		.filter((option) => !option.archived || current.includes(option.value))
		.map((option) => ({
			value: option.value,
			label: option.archived
				? m.admin_product_option_archived({ name: option.label })
				: option.label,
		}));
