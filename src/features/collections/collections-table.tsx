import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { PRODUCT_STATUSES, type ProductStatus } from "#/lib/enums";
import {
	COLLECTION_SORTS,
	type CollectionListSearch,
} from "#/lib/schemas/collections";
import { m } from "#/paraglide/messages";
import { lifecycleStatusLabel } from "../merchandising/status-labels";
import {
	StatusList,
	type StatusListChange,
} from "../merchandising/status-list";
import { collectionColumns } from "./columns";
import { useCollectionStatus } from "./mutations";
import { collectionsQuery } from "./queries";

export function CollectionsTable({
	search,
	onSearchChange,
}: {
	search: CollectionListSearch;
	onSearchChange: (
		change: StatusListChange<CollectionListSearch["sort"], ProductStatus>,
	) => void;
}) {
	const query = useQuery({
		...collectionsQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useCollectionStatus();
	return (
		<StatusList
			query={query}
			columns={collectionColumns({
				onStatus: (id, next) => status.mutate({ id, status: next }),
			})}
			sorts={COLLECTION_SORTS}
			search={search}
			onSearchChange={onSearchChange}
			statuses={PRODUCT_STATUSES}
			statusLabel={lifecycleStatusLabel}
			allLabel={m.admin_merch_all()}
			searchLabel={m.admin_collection_search()}
			getRowId={(collection) => String(collection.id)}
			action={
				<Button size="sm" asChild>
					<Link to="/admin/collections/new">
						<PlusIcon aria-hidden />
						{m.admin_collection_new()}
					</Link>
				</Button>
			}
			emptyTitle={m.admin_collection_empty()}
			emptyHint={m.admin_collection_empty_hint()}
		/>
	);
}
