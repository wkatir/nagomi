import { z } from "zod";
import { m } from "#/paraglide/messages";

const isWhole = (text: string, min: number, max: number) =>
	/^\d+$/.test(text) && Number(text) >= min && Number(text) <= max;

export const wholeNumber = (min: number, max: number) =>
	z
		.string()
		.trim()
		.refine(
			(text) => isWhole(text, min, max),
			m.admin_settings_number_range({ min, max }),
		)
		.transform(Number);

export const optionalWholeNumber = (min: number, max: number) =>
	z
		.string()
		.trim()
		.refine(
			(text) => text === "" || isWhole(text, min, max),
			m.admin_settings_number_range({ min, max }),
		)
		.transform((text) => (text === "" ? null : Number(text)));

export const numberText = (value: number | null) =>
	value === null ? "" : String(value);
