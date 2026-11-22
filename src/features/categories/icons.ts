import {
	Headphones,
	Keyboard,
	Lightbulb,
	type LucideIcon,
	Mouse,
	Package,
	Square,
} from "lucide-react";
import { CATEGORY_ICONS, type CategoryIcon } from "#/lib/enums";
import { m } from "#/paraglide/messages";

export const categoryIcon: Record<CategoryIcon, LucideIcon> = {
	keyboard: Keyboard,
	mouse: Mouse,
	square: Square,
	headphones: Headphones,
	lightbulb: Lightbulb,
	package: Package,
};

export const categoryIconLabel: Record<CategoryIcon, () => string> = {
	keyboard: m.admin_category_icon_keyboard,
	mouse: m.admin_category_icon_mouse,
	square: m.admin_category_icon_square,
	headphones: m.admin_category_icon_headphones,
	lightbulb: m.admin_category_icon_lightbulb,
	package: m.admin_category_icon_package,
};

export const isCategoryIcon = (value: string): value is CategoryIcon =>
	(CATEGORY_ICONS as readonly string[]).includes(value);
