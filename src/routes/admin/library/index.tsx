import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { LibraryGrid } from "#/features/library/library-grid";
import { mediaFilesQuery } from "#/features/media/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/library/")({
	// Started, not awaited: the grid has its own loading and error states.
	loader: ({ context }) => {
		void context.queryClient.prefetchInfiniteQuery(mediaFilesQuery);
	},
	component: Library,
});

function Library() {
	return (
		<>
			<PageHeader title={m.admin_library_title()} />
			<LibraryGrid />
		</>
	);
}
