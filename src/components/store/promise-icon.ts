import {
	BadgeCheck,
	Banknote,
	CalendarCheck,
	Check,
	type LucideIcon,
	MessageCircle,
	RotateCcw,
	ShieldCheck,
} from "lucide-react";

// Store promises are data; their slugs only pick an icon. A new promise gets a plain check.
const icons: Record<string, LucideIcon> = {
	"pay-on-delivery": Banknote,
	"authorized-supplier": BadgeCheck,
	"batch-and-expiry": CalendarCheck,
	returns: RotateCcw,
	"whatsapp-orders": MessageCircle,
	"sanitary-registration": ShieldCheck,
};

export const promiseIcon = (slug: string): LucideIcon => icons[slug] ?? Check;
