import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { moveLabel } from "./moves";
import { useSlideStatus } from "./mutations";
import type { Slide } from "./queries";
import { useSlideTitle } from "./use-slide-title";

export function SlideMenu({
	slide,
	moves,
	size = "icon-sm",
}: {
	slide: Slide;
	moves: readonly ProductStatus[];
	size?: "icon-sm" | "icon";
}) {
	const title = useSlideTitle();
	const status = useSlideStatus();
	if (moves.length === 0) return null;
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="outline"
					size={size}
					aria-label={m.admin_slide_actions({ title: title(slide) })}
				>
					<MoreHorizontalIcon aria-hidden />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{moves.map((to) => (
					<DropdownMenuItem
						key={to}
						disabled={status.isPending}
						onSelect={() => status.mutate({ id: slide.id, status: to })}
					>
						{moveLabel(slide.status, to)}
					</DropdownMenuItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
