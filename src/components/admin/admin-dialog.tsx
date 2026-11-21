import { cn } from "cn";
import { X } from "lucide-react";
import type * as React from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "#/components/ui/dialog";
import { m } from "#/paraglide/messages";

// The generated close button says "Close" in English, so it is off and this one reads from
// Paraglide.
export function AdminDialog({
	title,
	onClose,
	className,
	children,
}: {
	title: React.ReactNode;
	onClose: () => void;
	className?: string;
	children: React.ReactNode;
}) {
	return (
		<Dialog open onOpenChange={(open) => !open && onClose()}>
			<DialogContent
				aria-describedby={undefined}
				showCloseButton={false}
				className={cn("max-h-[calc(100svh-2rem)] overflow-y-auto", className)}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
				</DialogHeader>
				<DialogClose asChild>
					<Button
						variant="ghost"
						size="icon-sm"
						aria-label={m.close()}
						className="absolute top-4 right-4"
					>
						<X aria-hidden />
					</Button>
				</DialogClose>
				{children}
			</DialogContent>
		</Dialog>
	);
}
