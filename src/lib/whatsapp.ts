export const whatsappLink = (number: string, text: string) =>
	`https://wa.me/${number}?text=${encodeURIComponent(text)}`;
