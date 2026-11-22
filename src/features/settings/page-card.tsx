import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { LocaleTabs } from "#/components/admin/form/locale-tabs";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { Panel } from "#/components/admin/panel";
import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "#/components/ui/accordion";
import { useStoreDate } from "#/hooks/use-store-date";
import { type AdminPages, api, parseResponse } from "#/lib/api";
import type { Locale } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { PageVersions } from "./page-versions";

type Page = AdminPages[number];
type Text = Page["translations"][number];

const FIELDS = ["title", "bodyMarkdown"] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

function TextForm({
	page,
	locale,
	text,
}: {
	page: Page;
	locale: Locale;
	text: Text | undefined;
}) {
	const queryClient = useQueryClient();
	const formatDate = useStoreDate();
	const schema = z.object({
		title: z.string().trim().min(1, m.admin_required()).max(120),
		bodyMarkdown: z.string().trim().min(1, m.admin_required()).max(20000),
	});
	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin.settings.pages[":id"].translations[":locale"].$put({
					param: { id: String(page.id), locale },
					json: value,
				}),
			),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["admin", "settings"] }),
				queryClient.invalidateQueries({ queryKey: ["page"] }),
			]);
			toast.success(m.admin_saved());
		},
	});
	const form = useAppForm({
		defaultValues: {
			title: text?.title ?? "",
			bodyMarkdown: text?.bodyMarkdown ?? "",
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
		<form.AppForm>
			<form
				noValidate
				className="grid gap-3"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<p className="type-small text-muted-foreground">
					{text
						? m.admin_settings_page_current({
								version: text.version,
								date: formatDate(text.createdAt, {
									dateStyle: "medium",
									timeStyle: "short",
								}),
							})
						: m.admin_settings_page_none()}
				</p>
				<form.AppField name="title">
					{(field) => (
						<field.TextField label={m.admin_field_title()} maxLength={120} />
					)}
				</form.AppField>
				<form.AppField name="bodyMarkdown">
					{(field) => (
						<field.TextareaField
							label={m.admin_field_body()}
							rows={14}
							maxLength={20000}
							className="font-mono type-small"
						/>
					)}
				</form.AppField>
				<form.FormError />
				<div className="flex justify-end">
					<form.SaveButton>{m.admin_save()}</form.SaveButton>
				</div>
			</form>
			{text && (
				<Accordion type="single" collapsible className="mt-3">
					<AccordionItem value="versions">
						<AccordionTrigger>{m.admin_settings_versions()}</AccordionTrigger>
						<AccordionContent>
							<PageVersions
								pageId={page.id}
								locale={locale}
								currentVersion={text.version}
								onUse={(version) => {
									form.setFieldValue("title", version.title);
									form.setFieldValue("bodyMarkdown", version.bodyMarkdown);
									toast(
										m.admin_settings_version_loaded({
											version: version.version,
										}),
									);
								}}
							/>
						</AccordionContent>
					</AccordionItem>
				</Accordion>
			)}
		</form.AppForm>
	);
}

export function PageCard({
	page,
	defaultLocale,
}: {
	page: Page;
	defaultLocale: Locale;
}) {
	return (
		<Panel>
			<header className="border-b px-admin-card py-3">
				<h2 className="type-ui font-bold">/{page.slug}</h2>
			</header>
			<div className="p-admin-card">
				<LocaleTabs defaultLocale={defaultLocale}>
					{(locale) => {
						const text = page.translations.find((t) => t.locale === locale);
						return (
							<TextForm
								key={`${locale}-${text?.version}`}
								page={page}
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
