// A slug has at most 80 characters.
export const slugify = (name: string) =>
	name
		.normalize("NFD")
		.replace(/\p{M}/gu, "")
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "-")
		.slice(0, 80)
		.replace(/^-+|-+$/g, "");
