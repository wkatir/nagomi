import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowDownIcon, ArrowUpIcon, PlusIcon } from "lucide-react";
import { StatusTabs } from "#/components/admin/data-table/status-tabs";
import { Panel } from "#/components/admin/panel";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Skeleton } from "#/components/ui/skeleton";
import { PRODUCT_STATUSES, type ProductStatus } from "#/lib/enums";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { slideMoves } from "./moves";
import { useReorderSlides } from "./mutations";
import { carouselOrder, moveSlide } from "./order";
import { type Slide, slidesQuery } from "./queries";
import { SlideMenu } from "./slide-menu";
import {
	SlideStatusBadge,
	slideStatusLabel,
	useSlideSpan,
} from "./slide-status";
import { useSlideTitle } from "./use-slide-title";

function SlidesSkeleton() {
	return (
		<Panel aria-busy>
			{["a", "b", "c"].map((key) => (
				<div key={key} className="flex gap-3 border-b p-3 last:border-b-0">
					<Skeleton className="aspect-video w-32 shrink-0" />
					<div className="grid flex-1 content-center gap-2">
						<Skeleton className="h-4 w-48 max-w-full" />
						<Skeleton className="h-3 w-32" />
					</div>
				</div>
			))}
		</Panel>
	);
}

function SlideRow({
	slide,
	position,
	moveUp,
	moveDown,
}: {
	slide: Slide;
	position: number | undefined;
	moveUp: (() => void) | undefined;
	moveDown: (() => void) | undefined;
}) {
	const title = useSlideTitle();
	const span = useSlideSpan();
	const { desktopImage } = slide;
	if (!desktopImage) throw new Error(`Slide ${slide.id} has no desktop image`);
	const name = title(slide);
	const dates = span(slide);
	return (
		<li className="grid grid-cols-[1.25rem_7rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 border-b p-3 last:border-b-0 sm:grid-cols-[1.25rem_9rem_minmax(0,1fr)_auto]">
			<span className="type-meta text-center text-muted-foreground tabular-nums">
				{position}
			</span>
			<img
				src={desktopImage.url}
				alt=""
				loading="lazy"
				width={desktopImage.width}
				height={desktopImage.height}
				className="aspect-video w-full rounded-sm bg-muted object-cover"
			/>
			<div className="grid min-w-0 gap-1">
				<Link
					to="/admin/slides/$id"
					params={{ id: slide.id }}
					className="type-small truncate font-bold underline-offset-4 hover:underline"
				>
					{name}
				</Link>
				<span className="type-meta truncate text-muted-foreground">
					{slide.linkPath}
				</span>
				<span className="flex flex-wrap items-center gap-x-2 gap-y-1">
					<SlideStatusBadge slide={slide} />
					{dates && (
						<span className="type-meta text-muted-foreground">{dates}</span>
					)}
				</span>
			</div>
			<div className="flex items-center justify-end gap-1 max-sm:col-span-full">
				{position !== undefined && (
					<>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={m.admin_slide_move_up({ title: name })}
							disabled={!moveUp}
							onClick={moveUp}
						>
							<ArrowUpIcon aria-hidden />
						</Button>
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={m.admin_slide_move_down({ title: name })}
							disabled={!moveDown}
							onClick={moveDown}
						>
							<ArrowDownIcon aria-hidden />
						</Button>
					</>
				)}
				<SlideMenu slide={slide} moves={slideMoves(slide.status)} />
			</div>
		</li>
	);
}

export function SlidesList({
	status,
	onStatusChange,
	onCreate,
}: {
	status: ProductStatus | undefined;
	onStatusChange: (status: ProductStatus | undefined) => void;
	onCreate: () => void;
}) {
	const query = useQuery(slidesQuery);
	const reorder = useReorderSlides();

	const tabs = (
		<StatusTabs
			values={PRODUCT_STATUSES}
			label={slideStatusLabel}
			allLabel={m.admin_slide_all()}
			value={status}
			onChange={onStatusChange}
		/>
	);

	if (query.isPending)
		return (
			<>
				{tabs}
				<SlidesSkeleton />
			</>
		);
	if (query.isError)
		return (
			<>
				{tabs}
				<Alert variant="destructive">
					<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
						{errorMessage(query.error)}
						<Button variant="outline" size="sm" onClick={() => query.refetch()}>
							{m.admin_table_retry()}
						</Button>
					</AlertDescription>
				</Alert>
			</>
		);

	const slides = carouselOrder(query.data);
	if (slides.length === 0)
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>{m.admin_slide_empty()}</EmptyTitle>
					<EmptyDescription>{m.admin_slide_empty_hint()}</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={onCreate}>
						<PlusIcon aria-hidden />
						{m.admin_slide_new()}
					</Button>
				</EmptyContent>
			</Empty>
		);

	const inUse = slides.filter((slide) => slide.status !== "archived");
	const order = inUse.map((slide) => slide.id);
	const shown = status
		? slides.filter((slide) => slide.status === status)
		: slides;
	const shownInUse = shown.filter((slide) => slide.status !== "archived");

	return (
		<>
			{tabs}
			{shown.length === 0 ? (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{m.admin_slide_empty_status()}</EmptyTitle>
					</EmptyHeader>
				</Empty>
			) : (
				<Panel aria-busy={reorder.isPending}>
					<ul>
						{shown.map((slide) => {
							const at = shownInUse.indexOf(slide);
							const goTo = (neighbour: Slide | undefined) =>
								neighbour === undefined || reorder.isPending
									? undefined
									: () =>
											reorder.mutate(moveSlide(order, slide.id, neighbour.id));
							return (
								<SlideRow
									key={slide.id}
									slide={slide}
									position={
										slide.status === "archived"
											? undefined
											: order.indexOf(slide.id) + 1
									}
									moveUp={goTo(shownInUse[at - 1])}
									moveDown={goTo(shownInUse[at + 1])}
								/>
							);
						})}
					</ul>
				</Panel>
			)}
		</>
	);
}
