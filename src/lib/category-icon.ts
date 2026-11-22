import {
	Headphones,
	Keyboard,
	Lightbulb,
	type LucideIcon,
	Mouse,
	Package,
	Square,
} from "lucide-react";
import type { CategoryIcon } from "#/lib/enums";

export const categoryIcon: Record<CategoryIcon, LucideIcon> = {
	keyboard: Keyboard,
	mouse: Mouse,
	square: Square,
	headphones: Headphones,
	lightbulb: Lightbulb,
	package: Package,
};
