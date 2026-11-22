import { m } from "#/paraglide/messages";

// Consumer law (LPC Art. 21-A) asks for the registered legal name (the trade name is not a
// substitute), tax ID, address, phone and email.
export const sellerDetails = (store: {
	demoStore: boolean;
	business: {
		legalName: string | null;
		taxIdLabel: string | null;
		taxId: string | null;
		address: string | null;
		phone: string | null;
		email: string | null;
	};
}) =>
	store.demoStore
		? [m.store_demo_seller(), m.store_demo_notice()]
		: [
				store.business.legalName,
				// The settings API only accepts a tax ID together with its label.
				store.business.taxId &&
					`${store.business.taxIdLabel} ${store.business.taxId}`,
				store.business.address,
				store.business.phone,
				store.business.email,
			].filter((x): x is string => Boolean(x));
