import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { DetailSkeleton, RecordNotFound } from "#/components/admin/skeletons";
import { routineQuery } from "#/features/routines/queries";
import { RoutineEditor } from "#/features/routines/routine-editor";
import { isNotFound } from "#/lib/api";
import { adminSettingsQuery } from "#/lib/queries";
import type { LoaderCrumb } from "#/lib/route-data";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/routines/$id")({
	params: {
		parse: ({ id }) => {
			const parsed = Number(id);
			if (!Number.isInteger(parsed) || parsed < 1) throw notFound();
			return { id: parsed };
		},
		stringify: ({ id }) => ({ id: String(id) }),
	},
	// The store's principal language is loaded with the routine: the editor needs it to open.
	loader: async ({ context, params }): Promise<LoaderCrumb> => {
		try {
			const [routine, settings] = await Promise.all([
				context.queryClient.ensureQueryData(routineQuery(params.id)),
				context.queryClient.ensureQueryData(adminSettingsQuery),
			]);
			const title = routine.translations.find(
				(t) => t.locale === settings.defaultLocale,
			);
			return { crumb: title?.title ?? routine.slug };
		} catch (error) {
			throw isNotFound(error) ? notFound() : error;
		}
	},
	pendingComponent: DetailSkeleton,
	notFoundComponent: () => (
		<RecordNotFound listLabel={m.admin_nav_routines()} />
	),
	component: Routine,
});

function Routine() {
	const { id } = Route.useParams();
	const { data } = useSuspenseQuery(routineQuery(id));
	return <RoutineEditor routine={data} />;
}
