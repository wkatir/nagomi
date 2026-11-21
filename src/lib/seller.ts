// Consumer law (LPC Art. 21-A) asks for the registered legal name (the trade name is not a
// substitute), tax ID, address, phone and email.
export const sellerDetails = (business: {
	legalName: string | null;
	taxIdLabel: string | null;
	taxId: string | null;
	address: string | null;
	phone: string | null;
	email: string | null;
}) =>
	[
		business.legalName,
		// The settings API only accepts a tax ID together with its label.
		business.taxId && `${business.taxIdLabel} ${business.taxId}`,
		business.address,
		business.phone,
		business.email,
	].filter((x): x is string => Boolean(x));
