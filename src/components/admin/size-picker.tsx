import {
	keepPreviousData,
	queryOptions,
	useQuery,
} from "@tanstack/react-query";
import { useState } from "react";
import { Badge } from "#/components/ui/badge";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import { api, parseResponse } from "#/lib/api";
import { variantLabel } from "#/lib/variant-label";
import { m } from "#/paraglide/messages";

export type PickedSize = { variantId: number; sku: string; label: string };

const MIN_CHARS = 2;
const MAX_RESULTS = 20;

// Whatever the status of their product: stock arrives before a product is published.
const sizesQuery = (q: string) =>
	queryOptions({
		queryKey: ["admin", "products", "sizes", q],
		queryFn: () => parseResponse(api().admin.products.$get({ query: { q } })),
	});

export function SizePicker({
	picked,
	onPick,
	placeholder,
}: {
	picked: ReadonlySet<number>;
	onPick: (size: PickedSize) => void;
	placeholder: string;
}) {
	const [text, setText] = useState("");
	const q = useDebouncedValue(text.trim(), 250);
	const search = useQuery({
		...sizesQuery(q),
		enabled: q.length >= MIN_CHARS,
		placeholderData: keepPreviousData,
	});
	const rows = (search.data ?? [])
		.filter((row) => row.variantStatus === "active")
		.slice(0, MAX_RESULTS);
	return (
		<Command shouldFilter={false} className="rounded-md border">
			<CommandInput
				value={text}
				onValueChange={setText}
				placeholder={placeholder}
			/>
			{q.length >= MIN_CHARS && (
				<CommandList>
					<CommandEmpty>
						{search.isPending ? m.loading() : m.admin_search_empty()}
					</CommandEmpty>
					<CommandGroup>
						{rows.map((row) => {
							const label = variantLabel(row);
							const there = picked.has(row.variantId);
							return (
								<CommandItem
									key={row.variantId}
									value={String(row.variantId)}
									disabled={there}
									onSelect={() => {
										onPick({
											variantId: row.variantId,
											sku: row.sku,
											label,
										});
										setText("");
									}}
								>
									<span className="flex-1">{label}</span>
									<span className="type-meta text-muted-foreground">
										{row.sku}
									</span>
									{there && (
										<Badge variant="secondary">
											{m.admin_purchase_size_picked()}
										</Badge>
									)}
								</CommandItem>
							);
						})}
					</CommandGroup>
				</CommandList>
			)}
		</Command>
	);
}
