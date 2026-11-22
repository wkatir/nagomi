import { useMutation, useSuspenseQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { z } from "zod";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { languageName } from "#/components/admin/labels";
import { Button } from "#/components/ui/button";
import { DialogFooter } from "#/components/ui/dialog";
import { api, parseResponse } from "#/lib/api";
import type { Locale } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import { isStorePath } from "#/lib/store-path";
import { m } from "#/paraglide/messages";
import { useRefreshSlides } from "./mutations";
import type { SlideText } from "./texts";

export function NewSlideDialog({ onClose }: { onClose: () => void }) {
	const navigate = useNavigate();
	const refresh = useRefreshSlides();
	const { data: store } = useSuspenseQuery(storeQuery);
	const { defaultLocale } = store;

	const schema = z.object({
		desktopMediaId: z.number(m.admin_slide_image_required()),
		linkPath: z
			.string()
			.trim()
			.refine(isStorePath, m.admin_slide_link_invalid()),
		title: z.string().trim().min(1, m.admin_required()).max(120),
		imageAlt: z.string().trim().min(1, m.admin_required()).max(250),
	});

	const fieldOf = (path: string) => {
		if (path === "desktopMediaId" || path === "linkPath") return path;
		if (path === `translations.${defaultLocale}.title`) return "title";
		if (path === `translations.${defaultLocale}.imageAlt`) return "imageAlt";
		return undefined;
	};

	const create = useMutation({
		mutationFn: (value: z.output<typeof schema>) => {
			const text: Pick<SlideText, "title" | "imageAlt"> = {
				title: value.title,
				imageAlt: value.imageAlt,
			};
			const translations: Partial<Record<Locale, typeof text>> = {};
			translations[defaultLocale] = text;
			return parseResponse(
				api().admin["home-slides"].$post({
					json: {
						desktopMediaId: value.desktopMediaId,
						linkPath: value.linkPath,
						translations,
					},
				}),
			);
		},
		onSuccess: async (slide) => {
			await refresh();
			toast.success(m.admin_slide_created());
			onClose();
			await navigate({ to: "/admin/slides/$id", params: { id: slide.id } });
		},
	});

	const defaultValues: {
		desktopMediaId: number | null;
		linkPath: string;
		title: string;
		imageAlt: string;
	} = { desktopMediaId: null, linkPath: "", title: "", imageAlt: "" };
	const form = useAppForm({
		defaultValues,
		validationLogic,
		validators: {
			onDynamic: schema,
			onSubmitAsync: async ({ value }) => {
				try {
					await create.mutateAsync(schema.parse(value));
					return null;
				} catch (error) {
					return serverErrors(error, fieldOf);
				}
			},
		},
	});

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-lg"
			title={m.admin_slide_new_title()}
		>
			<p className="type-small text-muted-foreground">
				{m.admin_slide_new_help({ language: languageName[defaultLocale]() })}
			</p>
			<form
				noValidate
				className="grid gap-4"
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
			>
				<form.AppForm>
					<form.AppField name="desktopMediaId">
						{(field) => (
							<field.MediaField label={m.admin_slide_image_desktop()} />
						)}
					</form.AppField>
					<form.AppField name="linkPath">
						{(field) => (
							<field.TextField
								label={m.admin_slide_link()}
								placeholder="/products"
								autoComplete="off"
								maxLength={300}
							/>
						)}
					</form.AppField>
					<form.AppField name="title">
						{(field) => (
							<field.TextField label={m.admin_field_title()} maxLength={120} />
						)}
					</form.AppField>
					<form.AppField name="imageAlt">
						{(field) => (
							<field.TextField
								label={m.admin_slide_image_alt()}
								maxLength={250}
							/>
						)}
					</form.AppField>
					<form.FormError />
					<DialogFooter>
						<Button type="button" variant="outline" onClick={onClose}>
							{m.admin_cancel()}
						</Button>
						<form.SubmitButton>{m.admin_slide_new()}</form.SubmitButton>
					</DialogFooter>
				</form.AppForm>
			</form>
		</AdminDialog>
	);
}
