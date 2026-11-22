import { z } from "zod";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import type { AdminSettings } from "#/lib/api";
import { m } from "#/paraglide/messages";
import { useSaveSettings } from "./mutations";
import { settingsErrors } from "./server-errors";

const FIELDS = [
	"discordUrl",
	"instagramUrl",
	"tiktokUrl",
	"youtubeUrl",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

const url = z
	.string()
	.trim()
	.max(300)
	.refine(
		(text) => text === "" || /^https:\/\/[^\s]+$/.test(text),
		m.admin_settings_url_invalid(),
	)
	.transform((text) => text || null);

const schema = z.object({
	discordUrl: url,
	instagramUrl: url,
	tiktokUrl: url,
	youtubeUrl: url,
});

const label = {
	discordUrl: m.admin_field_discord,
	instagramUrl: m.admin_field_instagram,
	tiktokUrl: m.admin_field_tiktok,
	youtubeUrl: m.admin_field_youtube,
} as const satisfies Record<(typeof FIELDS)[number], () => string>;

function SocialForm({ settings }: { settings: AdminSettings }) {
	const save = useSaveSettings();
	const form = useAppForm({
		defaultValues: Object.fromEntries(
			FIELDS.map((field) => [field, settings[field] ?? ""]),
		) as Record<(typeof FIELDS)[number], string>,
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await save.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return settingsErrors(error, fieldOf, {});
				}
			},
		},
	});

	return (
		<form.AppForm>
			<FormCard
				title={m.admin_settings_social()}
				description={m.admin_settings_social_help()}
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
				footer={<form.SaveButton>{m.admin_save()}</form.SaveButton>}
			>
				<div className="grid items-start gap-4 sm:grid-cols-2">
					{FIELDS.map((name) => (
						<form.AppField key={name} name={name}>
							{(field) => (
								<field.TextField
									label={label[name]()}
									type="url"
									placeholder="https://"
									autoComplete="off"
								/>
							)}
						</form.AppField>
					))}
				</div>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

export function SocialCard({ settings }: { settings: AdminSettings }) {
	return (
		<SocialForm
			key={JSON.stringify(FIELDS.map((field) => settings[field]))}
			settings={settings}
		/>
	);
}
