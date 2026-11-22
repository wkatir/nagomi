import {
	Banknote,
	Check,
	CreditCard,
	type LucideIcon,
	RotateCcw,
	ShieldCheck,
	Truck,
} from "lucide-react";

// Store promises are data; their slugs only pick an icon. A new promise gets a plain check.
const icons: Record<string, LucideIcon> = {
	warranty: ShieldCheck,
	"fast-shipping": Truck,
	returns: RotateCcw,
	"secure-payment": CreditCard,
	"pay-on-delivery": Banknote,
};

export const promiseIcon = (slug: string): LucideIcon => icons[slug] ?? Check;
