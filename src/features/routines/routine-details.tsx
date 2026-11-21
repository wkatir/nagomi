import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Section } from "#/components/admin/section";
import { api, parseResponse } from "#/lib/api";
import { SLUG_REGEX } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { concernOptionsQuery } from "../concerns/queries";
import { useRefresh } from "../merchandising/status-change";
import { type RoutineDetail, routinesKeys } from "./queries";

const FIELDS = ["slug", "position", "isFeatured", "concernId"] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const schema = z.object({
	slug: z
		.string()
		.trim()
		.max(80)
		.regex(SLUG_REGEX, m.admin_merch_slug_invalid()),
	position: z
		.string()
		.trim()
		.regex(/^(?:0|[1-9]\d{0,2}|1000)$/, m.admin_merch_position_invalid()),
	isFeatured: z.boolean(),
	// Empty for none.
	concernId: z.string(),
});

// A published routine keeps its address.
export function RoutineDetails({ routine }: { routine: RoutineDetail }) {
	const refresh = useRefresh(routinesKeys.all);
	const locked = routine.status === "published";
	const { data: concerns = [] } = useQuery(concernOptionsQuery);
	// Active needs, and the routine's own even if it was archived since.
	const concernChoices = [
		{ value: "", label: m.admin_routine_concern_none() },
		...concerns
			.filter((c) => c.status === "active" || c.id === routine.concernId)
			.map((c) => ({ value: String(c.id), label: c.name })),
	];

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const position = Number(value.position);
			const concernId = value.concernId === "" ? null : Number(value.concernId);
			const fields = {
				...(value.slug === routine.slug ? {} : { slug: value.slug }),
				...(position === routine.position ? {} : { position }),
				...(value.isFeatured === routine.isFeatured
					? {}
					: { isFeatured: value.isFeatured }),
				...(concernId === routine.concernId ? {} : { concernId }),
			};
			return parseResponse(
				api().admin.routines[":id"].$patch({
					param: { id: String(routine.id) },
					json: fields,
				}),
			);
		},
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const form = useAppForm({
		defaultValues: {
			slug: routine.slug,
			position: String(routine.position),
			isFeatured: routine.isFeatured,
			concernId: routine.concernId === null ? "" : String(routine.concernId),
		},
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});

	return (
		<form
			noValidate
			onSubmit={(event) => {
				event.preventDefault();
				form.handleSubmit();
			}}
		>
			<form.AppForm>
				<Section
					title={m.admin_routine_details()}
					action={
						<form.Subscribe selector={(state) => state.isDefaultValue}>
							{(unchanged) => (
								<form.SubmitButton
									size="sm"
									variant="outline"
									disabled={unchanged}
								>
									{m.admin_save()}
								</form.SubmitButton>
							)}
						</form.Subscribe>
					}
				>
					<div className="grid gap-3 p-admin-card">
						<form.AppField name="slug">
							{(field) => (
								<field.TextField
									label={m.admin_merch_slug()}
									maxLength={80}
									disabled={locked}
								/>
							)}
						</form.AppField>
						{locked && (
							<p className="type-meta text-muted-foreground">
								{m.admin_routine_slug_locked()}
							</p>
						)}
						<form.AppField name="position">
							{(field) => (
								<field.TextField
									label={m.admin_routine_position()}
									inputMode="numeric"
									maxLength={4}
								/>
							)}
						</form.AppField>
						<form.AppField name="concernId">
							{(field) => (
								<field.SelectField
									label={m.admin_routine_concern()}
									options={concernChoices}
								/>
							)}
						</form.AppField>
						<p className="type-meta text-muted-foreground">
							{m.admin_routine_concern_help()}
						</p>
						<form.AppField name="isFeatured">
							{(field) => (
								<field.CheckboxField label={m.admin_routine_featured()} />
							)}
						</form.AppField>
						<form.FormError />
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
