import { createFileRoute } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import { PageHeader } from "#/components/admin/page-header";
import { Button } from "#/components/ui/button";
import { NewSlideDialog } from "#/features/slides/new-slide-dialog";
import { slidesQuery } from "#/features/slides/queries";
import { SlidesList } from "#/features/slides/slides-list";
import { slideListSearch } from "#/lib/schemas/slides";
import { m } from "#/paraglide/messages";

export const Route = createFileRoute("/admin/slides/")({
	validateSearch: slideListSearch,
	// Started, not awaited: the list has its own loading and error states.
	loader: ({ context }) => {
		void context.queryClient.prefetchQuery(slidesQuery);
	},
	component: Slides,
});

function Slides() {
	const { status } = Route.useSearch();
	const navigate = Route.useNavigate();
	const [creating, setCreating] = useState(false);
	return (
		<>
			<PageHeader
				title={m.admin_nav_slides()}
				action={
					<Button onClick={() => setCreating(true)}>
						<PlusIcon aria-hidden />
						{m.admin_slide_new()}
					</Button>
				}
			/>
			<SlidesList
				status={status}
				onStatusChange={(next) => navigate({ search: { status: next } })}
				onCreate={() => setCreating(true)}
			/>
			{creating && <NewSlideDialog onClose={() => setCreating(false)} />}
		</>
	);
}
