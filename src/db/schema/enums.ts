import { ORDER_CHANNELS } from "#/lib/enums";

// Lists shared with the browser live in #/lib/enums; the tables get them from here.
export {
	ARCHIVABLE_STATUSES,
	IMAGE_KINDS,
	MOVEMENT_KINDS,
	PRODUCT_STATUSES,
	type ProductStatus,
	PURCHASE_ORDER_STATUSES,
} from "#/lib/enums";

export const IMAGE_TYPES = [
	"image/jpeg",
	"image/png",
	"image/webp",
	"image/avif",
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

export const CONSENT_CHANNELS = ORDER_CHANNELS;
export type ConsentChannel = (typeof CONSENT_CHANNELS)[number];

// privacy_notice and terms are acknowledgements required to order; the marketing one is an
// optional permission explained in the privacy notice.
export const CONSENT_PURPOSES = [
	"privacy_notice",
	"terms",
	"marketing_email",
	"marketing_whatsapp",
] as const;
export type ConsentPurpose = (typeof CONSENT_PURPOSES)[number];

export const PAYMENT_KINDS = ["payment", "refund"] as const;

export const PAYMENT_STATUSES = ["pending", "confirmed", "failed"] as const;
