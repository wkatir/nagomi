import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { HeaderActions, PageHeader } from "#/components/admin/page-header";
import { Section } from "#/components/admin/section";
import { Button } from "#/components/ui/button";
import { useStoreDate } from "#/hooks/use-store-date";
import { m } from "#/paraglide/messages";
import { moveLabel, primaryMove, slideMoves } from "./moves";
import { useSlideStatus } from "./mutations";
import type { Slide } from "./queries";
import { SlideDisplayForm } from "./slide-display-form";
import { SlideMenu } from "./slide-menu";
import {
	SlideStatusBadge,
	stateNote,
	useSlideSpan,
	useSlideState,
} from "./slide-status";
import { SlideTextsForm } from "./slide-texts-form";
import { useSlideTitle } from "./use-slide-title";

export function SlideDetail({ slide }: { slide: Slide }) {
	const title = useSlideTitle();
	const span = useSlideSpan();
	const state = useSlideState();
	const formatDate = useStoreDate();
	const status = useSlideStatus();
	const primary = primaryMove(slide.status);
	const dates = span(slide);
	return (
		<DetailPage>
			<PageHeader
				title={title(slide)}
				badges={<SlideStatusBadge slide={slide} />}
				action={
					<HeaderActions>
						{primary && (
							<Button
								className="max-sm:flex-1"
								disabled={status.isPending}
								onClick={() => status.mutate({ id: slide.id, status: primary })}
							>
								{moveLabel(slide.status, primary)}
							</Button>
						)}
						<SlideMenu
							slide={slide}
							moves={slideMoves(slide.status).filter((to) => to !== primary)}
							size="icon"
						/>
					</HeaderActions>
				}
			/>
			<DetailColumns
				aside={
					<Section title={m.admin_slide_status()}>
						<div className="type-small grid gap-2 p-admin-card">
							<p>{stateNote[state(slide)]()}</p>
							{dates && <p className="text-muted-foreground">{dates}</p>}
							<p className="type-meta text-muted-foreground">
								{m.admin_slide_updated({
									date: formatDate(slide.updatedAt, {
										dateStyle: "medium",
										timeStyle: "short",
									}),
								})}
							</p>
						</div>
					</Section>
				}
			>
				<SlideDisplayForm slide={slide} />
				<SlideTextsForm slide={slide} />
			</DetailColumns>
		</DetailPage>
	);
}
