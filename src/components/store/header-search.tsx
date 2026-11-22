import { useNavigate } from "@tanstack/react-router";
import { cn } from "cn";
import { Search } from "lucide-react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "#/components/ui/input-group";
import { m } from "#/paraglide/messages";
import { localizeHref } from "#/paraglide/runtime";

export function HeaderSearch({ className }: { className?: string }) {
	const navigate = useNavigate();
	return (
		<search className={className}>
			<form
				method="get"
				action={localizeHref("/products")}
				onSubmit={(event) => {
					event.preventDefault();
					const q = String(new FormData(event.currentTarget).get("q") ?? "");
					navigate({ to: "/products", search: { q: q.trim() || undefined } });
				}}
			>
				<InputGroup
					className={cn(
						"h-10 rounded-full border-input bg-card pl-2 lg:h-9",
						"has-[[data-slot=input-group-control]:focus-visible]:border-input",
					)}
				>
					<InputGroupInput
						name="q"
						type="search"
						maxLength={80}
						autoComplete="off"
						aria-label={m.search_label()}
						placeholder={m.store_search_placeholder()}
						className="type-small placeholder:text-muted-foreground"
					/>
					<InputGroupAddon align="inline-end" className="pr-1.5">
						<InputGroupButton
							type="submit"
							size="icon-sm"
							aria-label={m.search_submit()}
							className="rounded-full text-foreground hover:bg-accent"
						>
							<Search aria-hidden className="size-[1.125rem]" />
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</form>
		</search>
	);
}
