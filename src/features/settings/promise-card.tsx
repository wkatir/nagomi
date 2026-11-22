import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Panel } from "#/components/admin/panel";
import { Label } from "#/components/ui/label";
import { Switch } from "#/components/ui/switch";
import { type AdminPromises, api, parseResponse } from "#/lib/api";
import type { Locale } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { useRefreshSettings } from "./mutations";

type StorePromise = AdminPromises[number];
type Text = StorePromise["translations"][number];

const FIELDS = ["title", "body"] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

function TextForm({
	promise,
	locale,
	text,
}: {
	promise: StorePromise;
	locale: Locale;
	text: Text | undefined;
}) {
	const refresh = useRefreshSettings();
	const schema = z.object({
		title: z.string().trim().min(1, m.admin_required()).max(80),
		body: z.string().trim().max(300),
	});
	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.settings.promises[":id"].translations[":locale"].$put({
					param: { id: String(promise.id), locale },
					json: { title: value.title, body: value.body || null },
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});
	const form = useAppForm({
		defaultValues: { title: text?.title ?? "", body: text?.body ?? "" },
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
		<form.AppForm>
			<form
				noValidate
				className="grid gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.AppField name="title">
					{(field) => (
						<field.TextField
							label={m.admin_field_promise_title()}
							maxLength={80}
						/>
					)}
				</form.AppField>
				<form.AppField name="body">
					{(field) => (
						<field.TextareaField
							label={m.admin_field_promise_body()}
							rows={2}
							maxLength={300}
						/>
					)}
				</form.AppField>
				<form.FormError />
				<div className="flex justify-end">
					<form.Subscribe selector={(state) => state.isDefaultValue}>
						{(unchanged) => (
							<form.SubmitButton disabled={unchanged}>
								{m.admin_save()}
							</form.SubmitButton>
						)}
					</form.Subscribe>
				</div>
			</form>
		</form.AppForm>
	);
}

// The switch asks the API, which checks the main-language text and the return window it quotes.
export function PromiseCard({
	promise,
	defaultLocale,
}: {
	promise: StorePromise;
	defaultLocale: Locale;
}) {
	const refresh = useRefreshSettings();
	const publish = useMutation({
		mutationFn: (isPublished: boolean) =>
			parseResponse(
				api().admin.settings.promises[":id"].$patch({
					param: { id: String(promise.id) },
					json: { isPublished },
				}),
			),
		onSettled: refresh,
		onError: (error) => toast.error(errorMessage(error)),
	});
	const title = promise.translations.find(
		(text) => text.locale === defaultLocale,
	)?.title;
	return (
		<Panel>
			<header className="flex flex-wrap items-center justify-between gap-3 border-b px-admin-card py-3">
				<div className="grid">
					<h2 className="type-ui font-bold">{title ?? promise.slug}</h2>
					{title && (
						<span className="type-meta text-muted-foreground">
							{promise.slug}
						</span>
					)}
				</div>
				<Label className="flex items-center gap-2">
					<Switch
						checked={promise.isPublished}
						disabled={publish.isPending}
						onCheckedChange={(on) => publish.mutate(on)}
					/>
					{m.admin_field_published()}
				</Label>
			</header>
			<div className="p-admin-card">
				<LocaleTabs defaultLocale={defaultLocale}>
					{(locale) => {
						const text = promise.translations.find((t) => t.locale === locale);
						return (
							<TextForm
								key={`${locale}-${JSON.stringify(text)}`}
								promise={promise}
								locale={locale}
								text={text}
							/>
						);
					}}
				</LocaleTabs>
			</div>
		</Panel>
	);
}
