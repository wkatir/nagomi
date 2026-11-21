import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "#/components/admin/page-header";
import { NewRoutineForm } from "#/features/routines/new-routine-form";
import { adminSettingsQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/routines/new")({
	staticData: { crumb: m.admin_routine_new },
	// The form reads the store's principal language: it is small and kept.
	loader: ({ context }) =>
		context.queryClient.ensureQueryData(adminSettingsQuery),
	component: NewRoutine,
});

function NewRoutine() {
	return (
		<>
			<PageHeader title={m.admin_routine_new()} />
			<NewRoutineForm />
		</>
	);
}
