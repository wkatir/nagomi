import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import {
	BadgePercent,
	ClipboardList,
	Layers,
	type LucideIcon,
	Package,
	SearchIcon,
	ShoppingCart,
	Tag,
	Target,
	Truck,
	Users,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import {
	CommandDialog,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "#/components/ui/command";
import { Kbd } from "#/components/ui/kbd";
import { adminSearchQuery } from "#/features/search/queries";
import { useDebouncedValue } from "#/hooks/use-debounced-value";
import { m } from "#/paraglide/messages";
import { navGroups } from "./nav";

const MIN_CHARS = 2;

type Hit = { id: number; label: string; hint: string | null };
type Navigate = ReturnType<typeof useNavigate>;

export function CommandSearch() {
	const [open, setOpen] = useState(false);
	const [text, setText] = useState("");
	const navigate = useNavigate();
	const q = useDebouncedValue(text.trim(), 250);
	const found = useQuery({
		...adminSearchQuery(q),
		enabled: open && q.length >= MIN_CHARS,
		placeholderData: keepPreviousData,
	});

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
				event.preventDefault();
				setOpen((current) => !current);
			}
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, []);

	const close = (change: boolean) => {
		setOpen(change);
		if (!change) setText("");
	};
	const go = (action: () => unknown) => {
		close(false);
		action();
	};
	const groups =
		q.length >= MIN_CHARS ? recordGroups(found.data, navigate) : [];

	return (
		<>
			<Button
				variant="outline"
				className="ml-auto h-8 w-56 justify-start gap-2 px-2.5 font-normal text-muted-foreground max-md:hidden"
				onClick={() => setOpen(true)}
			>
				<SearchIcon aria-hidden />
				<span className="flex-1 text-left">{m.admin_search_open()}</span>
				<Kbd>Ctrl K</Kbd>
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="ml-auto md:hidden"
				aria-label={m.admin_search_open()}
				onClick={() => setOpen(true)}
			>
				<SearchIcon aria-hidden />
			</Button>
			<CommandDialog
				open={open}
				onOpenChange={close}
				title={m.admin_search_open()}
				description={m.admin_search_description()}
				showCloseButton={false}
			>
				<CommandInput
					value={text}
					onValueChange={setText}
					placeholder={m.admin_search_placeholder()}
				/>
				<CommandList className="max-h-[min(24rem,60svh)]">
					<CommandEmpty>{m.admin_search_empty()}</CommandEmpty>
					<CommandGroup heading={m.admin_search_go_to()}>
						{navGroups
							.flatMap((group) => group.items)
							.map((item) => (
								<CommandItem
									key={item.to}
									value={item.label()}
									onSelect={() => go(() => navigate({ to: item.to }))}
								>
									<item.icon aria-hidden />
									{item.label()}
								</CommandItem>
							))}
					</CommandGroup>
					{groups.map((group) => (
						<CommandGroup key={group.key} heading={group.heading}>
							{group.hits.map((hit) => (
								// The server already matched these: the text typed goes with each as a
								// keyword so cmdk's own filter keeps them (and selects the first one)
								// instead of matching them again by their value.
								<CommandItem
									key={hit.id}
									value={`${group.key}-${hit.id}`}
									keywords={[text]}
									onSelect={() => go(() => group.open(hit))}
								>
									<group.icon aria-hidden />
									<span className="font-bold">{hit.label}</span>
									{hit.hint && (
										<span className="flex-1 truncate text-muted-foreground">
											{hit.hint}
										</span>
									)}
								</CommandItem>
							))}
						</CommandGroup>
					))}
				</CommandList>
			</CommandDialog>
		</>
	);
}

function recordGroups(
	found:
		| {
				orders: Hit[];
				products: Hit[];
				customers: Hit[];
				suppliers: Hit[];
				purchases: Hit[];
				brands: Hit[];
				categories: Hit[];
				concerns: Hit[];
				routines: Hit[];
				collections: Hit[];
				promotions: Hit[];
		  }
		| undefined,
	navigate: Navigate,
) {
	if (!found) return [];
	const group = (
		key: string,
		heading: string,
		icon: LucideIcon,
		hits: Hit[],
		open: (hit: Hit) => unknown,
	) => ({ key, heading, icon, hits, open });
	return [
		group("orders", m.admin_nav_orders(), ShoppingCart, found.orders, (hit) =>
			navigate({ to: "/admin/orders/$id", params: { id: hit.id } }),
		),
		group("products", m.admin_nav_products(), Package, found.products, (hit) =>
			navigate({ to: "/admin/products/$id", params: { id: hit.id } }),
		),
		group("customers", m.admin_nav_customers(), Users, found.customers, (hit) =>
			navigate({ to: "/admin/customers/$id", params: { id: hit.id } }),
		),
		group("suppliers", m.admin_nav_suppliers(), Truck, found.suppliers, (hit) =>
			navigate({ to: "/admin/suppliers/$id", params: { id: hit.id } }),
		),
		group(
			"purchases",
			m.admin_nav_purchases(),
			ClipboardList,
			found.purchases,
			(hit) => navigate({ to: "/admin/purchases/$id", params: { id: hit.id } }),
		),
		group("brands", m.admin_nav_brands(), Tag, found.brands, (hit) =>
			navigate({ to: "/admin/brands", search: { q: hit.label } }),
		),
		group(
			"categories",
			m.admin_nav_categories(),
			Layers,
			found.categories,
			(hit) => navigate({ to: "/admin/categories", search: { q: hit.label } }),
		),
		group("concerns", m.admin_nav_concerns(), Target, found.concerns, (hit) =>
			navigate({ to: "/admin/concerns", search: { q: hit.label } }),
		),
		group("routines", m.admin_nav_routines(), Layers, found.routines, (hit) =>
			navigate({ to: "/admin/routines/$id", params: { id: hit.id } }),
		),
		group(
			"collections",
			m.admin_nav_collections(),
			Layers,
			found.collections,
			(hit) =>
				navigate({ to: "/admin/collections/$id", params: { id: hit.id } }),
		),
		group(
			"promotions",
			m.admin_nav_promotions(),
			BadgePercent,
			found.promotions,
			(hit) => navigate({ to: "/admin/promotions", search: { q: hit.label } }),
		),
	].filter((g) => g.hits.length > 0);
}
