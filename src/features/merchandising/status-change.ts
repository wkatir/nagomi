import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { ArchivableStatus, ProductStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { invalidateCatalog } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const archiveMessage = (status: ArchivableStatus) =>
	status === "archived" ? m.admin_merch_archived() : m.admin_merch_restored();

export const lifecycleMessage = (status: ProductStatus) =>
	status === "published"
		? m.admin_merch_published()
		: status === "draft"
			? m.admin_merch_drafted()
			: m.admin_merch_archived();

// `root` starts every query key of the module, so one invalidation refreshes its lists and
// details.
export function useRefresh(root: readonly string[]) {
	const queryClient = useQueryClient();
	return () =>
		Promise.all([
			queryClient.invalidateQueries({ queryKey: root }),
			invalidateCatalog(queryClient),
		]);
}

export function useStatusChange<Status extends string>({
	root,
	change,
	message,
}: {
	root: readonly string[];
	change: (id: number, status: Status) => Promise<unknown>;
	message: (status: Status) => string;
}) {
	const refresh = useRefresh(root);
	return useMutation({
		mutationFn: ({ id, status }: { id: number; status: Status }) =>
			change(id, status),
		onSuccess: async (_, { status }) => {
			await refresh();
			toast.success(message(status));
		},
		onError: (error) => toast.error(errorMessage(error)),
	});
}
