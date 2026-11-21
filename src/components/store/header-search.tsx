import { useNavigate } from "@tanstack/react-router";
import { Search } from "lucide-react";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupInput,
} from "#/components/ui/input-group";
import { m } from "#/paraglide/messages";
import { localizeHref } from "#/paraglide/runtime";

// A plain GET form too, so it works before hydration; after it, the router takes the submit.
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
				<InputGroup className="h-(--control-lg) rounded-sm">
					<InputGroupInput
						name="q"
						type="search"
						maxLength={80}
						autoComplete="off"
						aria-label={m.search_label()}
						placeholder={m.search_label()}
						className="type-body"
					/>
					<InputGroupAddon align="inline-end">
						<InputGroupButton
							type="submit"
							size="icon-xs"
							aria-label={m.search_submit()}
						>
							<Search aria-hidden strokeWidth={1.5} />
						</InputGroupButton>
					</InputGroupAddon>
				</InputGroup>
			</form>
		</search>
	);
}
