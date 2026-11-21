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
import { type AdminProducts, api, parseResponse } from "#/lib/api";
import { m } from "#/paraglide/messages";

export type ProductRow = AdminProducts[number];

export type ProductChoice = {
	key: number;
	label: string;
	hint: string;
	draft: boolean;
};

const productSearchQuery = (q: string) =>
	queryOptions({
		queryKey: ["admin", "products", "search", q],
		queryFn: () => parseResponse(api().admin.products.$get({ query: { q } })),
	});

const MIN_CHARS = 2;
const MAX_RESULTS = 20;

// The products list has a row per size: `choices` picks the rows that can be added and what
// each stands for (a size, or a product).
export function ProductSearch({
	choices,
	added,
	onPick,
}: {
	choices: (rows: ProductRow[]) => ProductChoice[];
	added: ReadonlySet<number>;
	onPick: (choice: ProductChoice) => void;
}) {
	const [text, setText] = useState("");
	const q = useDebouncedValue(text.trim(), 250);
	const search = useQuery({
		...productSearchQuery(q),
		enabled: q.length >= MIN_CHARS,
		placeholderData: keepPreviousData,
	});
	const found = choices(search.data ?? []).slice(0, MAX_RESULTS);
	return (
		<Command shouldFilter={false} className="rounded-md border">
			<CommandInput
				value={text}
				onValueChange={setText}
				placeholder={m.admin_merch_find_product()}
			/>
			{q.length >= MIN_CHARS && (
				<CommandList>
					<CommandEmpty>
						{search.isPending ? m.loading() : m.admin_search_empty()}
					</CommandEmpty>
					<CommandGroup>
						{found.map((choice) => (
							<CommandItem
								key={choice.key}
								value={String(choice.key)}
								disabled={added.has(choice.key)}
								onSelect={() => {
									onPick(choice);
									setText("");
								}}
							>
								<span className="flex-1">{choice.label}</span>
								<span className="type-meta text-muted-foreground">
									{choice.hint}
								</span>
								{choice.draft && (
									<Badge variant="outline">
										{m.admin_merch_status_draft()}
									</Badge>
								)}
								{added.has(choice.key) && (
									<Badge variant="secondary">
										{m.admin_merch_already_added()}
									</Badge>
								)}
							</CommandItem>
						))}
					</CommandGroup>
				</CommandList>
			)}
		</Command>
	);
}
