import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { z } from "zod";
import { serverErrors } from "#/components/admin/form/server-errors";
import {
	useAppForm,
	validationLogic,
} from "#/components/admin/form/use-app-form";
import { FormCard } from "#/components/admin/form-card";
import { api, parseResponse } from "#/lib/api";
import { isStorePath } from "#/lib/store-path";
import { m } from "#/paraglide/messages";
import { useRefreshSlides } from "./mutations";
import type { Slide } from "./queries";

const FIELDS = [
	"desktopMediaId",
	"mobileMediaId",
	"linkPath",
	"startsOn",
	"endsOn",
] as const;
const fieldOf = (path: string) => FIELDS.find((field) => field === path);

function DisplayForm({ slide }: { slide: Slide }) {
	const refresh = useRefreshSlides();

	const schema = z
		.object({
			desktopMediaId: z.number(m.admin_slide_image_required()),
			mobileMediaId: z.number().nullable(),
			linkPath: z
				.string()
				.trim()
				.refine(isStorePath, m.admin_slide_link_invalid()),
			startsOn: z.string(),
			endsOn: z.string(),
		})
		.superRefine((value, ctx) => {
			if (value.startsOn && value.endsOn && value.startsOn > value.endsOn)
				ctx.addIssue({
					code: "custom",
					path: ["endsOn"],
					message: m.admin_slide_dates_order(),
				});
		});

	const save = useMutation({
		mutationFn: (value: z.output<typeof schema>) =>
			parseResponse(
				api().admin["home-slides"][":id"].$patch({
					param: { id: String(slide.id) },
					json: {
						desktopMediaId: value.desktopMediaId,
						mobileMediaId: value.mobileMediaId,
						linkPath: value.linkPath,
						startsOn: value.startsOn || null,
						endsOn: value.endsOn || null,
					},
				}),
			),
		onSuccess: async () => {
			await refresh();
			toast.success(m.admin_saved());
		},
	});

	const defaultValues: {
		desktopMediaId: number | null;
		mobileMediaId: number | null;
		linkPath: string;
		startsOn: string;
		endsOn: string;
	} = {
		desktopMediaId: slide.desktopMediaId,
		mobileMediaId: slide.mobileMediaId,
		linkPath: slide.linkPath,
		startsOn: slide.startsOn ?? "",
		endsOn: slide.endsOn ?? "",
	};
	const form = useAppForm({
		defaultValues,
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
			<FormCard
				title={m.admin_slide_display()}
				description={m.admin_slide_display_help()}
				onSubmit={(event) => {
					event.preventDefault();
					form.handleSubmit();
				}}
				footer={<form.SaveButton>{m.admin_save()}</form.SaveButton>}
			>
				<div className="grid gap-4 sm:grid-cols-2">
					<form.AppField name="desktopMediaId">
						{(field) => (
							<field.MediaField label={m.admin_slide_image_desktop()} />
						)}
					</form.AppField>
					<form.AppField name="mobileMediaId">
						{(field) => (
							<field.MediaField label={m.admin_slide_image_mobile()} />
						)}
					</form.AppField>
				</div>
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
				<p className="type-small -mb-2 text-muted-foreground">
					{m.admin_slide_link_help()}
				</p>
				<div className="grid gap-4 sm:grid-cols-2">
					<form.AppField name="startsOn">
						{(field) => <field.DateField label={m.admin_slide_starts()} />}
					</form.AppField>
					<form.AppField name="endsOn">
						{(field) => <field.DateField label={m.admin_slide_ends()} />}
					</form.AppField>
				</div>
				<p className="type-small -mt-2 text-muted-foreground">
					{m.admin_slide_dates_help()}
				</p>
				<form.FormError />
			</FormCard>
		</form.AppForm>
	);
}

// Keyed by what is stored, so a save remounts the form clean.
export function SlideDisplayForm({ slide }: { slide: Slide }) {
	const stored = [
		slide.desktopMediaId,
		slide.mobileMediaId,
		slide.linkPath,
		slide.startsOn,
		slide.endsOn,
	];
	return <DisplayForm key={JSON.stringify(stored)} slide={slide} />;
}
