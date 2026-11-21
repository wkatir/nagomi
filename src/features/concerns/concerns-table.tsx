import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CONCERN_SORTS, type ConcernListSearch } from "#/lib/schemas/concerns";
import { m } from "#/paraglide/messages";
import {
	type ArchivableChange,
	ArchivableTable,
} from "../merchandising/archivable-table";
import { concernColumns } from "./columns";
import { ConcernDialog } from "./concern-dialog";
import { useConcernStatus } from "./mutations";
import { concernsQuery } from "./queries";

export function ConcernsTable({
	search,
	onSearchChange,
}: {
	search: ConcernListSearch;
	onSearchChange: (change: ArchivableChange<ConcernListSearch["sort"]>) => void;
}) {
	const query = useQuery({
		...concernsQuery(search),
		placeholderData: keepPreviousData,
	});
	const status = useConcernStatus();
	return (
		<ArchivableTable
			query={query}
			search={search}
			onSearchChange={onSearchChange}
			sorts={CONCERN_SORTS}
			columns={concernColumns}
			onStatus={(id, next) => status.mutate({ id, status: next })}
			Dialog={ConcernDialog}
			newLabel={m.admin_concern_new()}
			searchLabel={m.admin_concern_search()}
			emptyTitle={m.admin_concern_empty()}
			emptyHint={m.admin_concern_empty_hint()}
		/>
	);
}
