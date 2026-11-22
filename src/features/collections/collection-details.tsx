import { useMutation } from "@tanstack/react-query";
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
import { useRefresh } from "../merchandising/status-change";
import { type CollectionDetail, collectionsKeys } from "./queries";

const FIELDS = ["slug", "position", "showOnHome", "coverMediaId"] as const;
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
	showOnHome: z.boolean(),
	coverMediaId: z.number().nullable(),
});

export function CollectionDetails({
	collection,
}: {
	collection: CollectionDetail;
}) {
	const refresh = useRefresh(collectionsKeys.all);
	const locked = collection.status === "published";

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const position = Number(value.position);
			const fields = {
				...(value.slug === collection.slug ? {} : { slug: value.slug }),
				...(position === collection.position ? {} : { position }),
				...(value.showOnHome === collection.showOnHome
					? {}
					: { showOnHome: value.showOnHome }),
				...(value.coverMediaId === collection.coverMediaId
					? {}
					: { coverMediaId: value.coverMediaId }),
			};
			return parseResponse(
				api().admin.collections[":id"].$patch({
					param: { id: String(collection.id) },
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
			slug: collection.slug,
			position: String(collection.position),
			showOnHome: collection.showOnHome,
			coverMediaId: collection.coverMediaId,
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
					title={m.admin_collection_details()}
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
						<form.AppField name="coverMediaId">
							{(field) => (
								<field.MediaField label={m.admin_collection_cover()} />
							)}
						</form.AppField>
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
								{m.admin_collection_slug_locked()}
							</p>
						)}
						<form.AppField name="showOnHome">
							{(field) => (
								<field.CheckboxField
									label={m.admin_collection_show_on_home()}
								/>
							)}
						</form.AppField>
						<form.AppField name="position">
							{(field) => (
								<field.TextField
									label={m.admin_collection_position()}
									inputMode="numeric"
									maxLength={4}
								/>
							)}
						</form.AppField>
						<form.FormError />
					</div>
				</Section>
			</form.AppForm>
		</form>
	);
}
