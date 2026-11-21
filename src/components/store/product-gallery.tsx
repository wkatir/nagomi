import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useRef, useState } from "react";
import type { CatalogProduct } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { StoreIconButton } from "./ui/store-button";

type GalleryImage = CatalogProduct["images"][number];

// Thumbnails are buttons labelled by position, so their images are decorative.
export function ProductGallery({
	images,
	label,
}: {
	images: GalleryImage[];
	label: string;
}) {
	const id = useId();
	const track = useRef<HTMLDivElement>(null);
	// Slide a button asked for; scroll positions passed on the way there are ignored.
	const target = useRef<number | null>(null);
	const [active, setActive] = useState(0);
	const count = images.length;

	useEffect(() => {
		const el = track.current;
		if (!el) return;
		const sync = () => {
			const i = Math.min(
				count - 1,
				Math.max(0, Math.round(el.scrollLeft / el.clientWidth)),
			);
			if (target.current !== null) {
				if (i !== target.current) return;
				target.current = null;
			}
			setActive(i);
		};
		// A swipe or wheel during a button scroll takes over from the button.
		const release = () => {
			target.current = null;
		};
		el.addEventListener("scroll", sync, { passive: true });
		el.addEventListener("touchstart", release, { passive: true });
		el.addEventListener("wheel", release, { passive: true });
		return () => {
			el.removeEventListener("scroll", sync);
			el.removeEventListener("touchstart", release);
			el.removeEventListener("wheel", release);
		};
	}, [count]);

	if (count === 0) return <div className="aspect-square bg-photo" />;
	if (count === 1) return <Photo image={images[0]} eager />;

	const go = (i: number) => {
		const el = track.current;
		if (!el || i < 0 || i >= count) return;
		const reduce = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
		target.current = i;
		setActive(i);
		el.scrollTo({
			left: i * el.clientWidth,
			behavior: reduce ? "auto" : "smooth",
		});
	};

	const onKeyDown = (e: KeyboardEvent) => {
		if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			e.preventDefault();
			go(active + (e.key === "ArrowRight" ? 1 : -1));
		}
	};

	const arrow =
		"absolute top-1/2 -translate-y-1/2 disabled:opacity-0 max-md:hidden";

	return (
		<div>
			<div className="relative">
				<section
					ref={track}
					id={id}
					aria-roledescription={m.ui_carousel_role()}
					aria-label={m.gallery_label({ name: label })}
					// biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
					tabIndex={0}
					onKeyDown={onKeyDown}
					className="flex snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
				>
					{images.map((image, i) => (
						<figure
							key={image.url}
							aria-label={m.gallery_slide({
								n: i + 1,
								total: count,
							})}
							className="w-full shrink-0 snap-start snap-always"
						>
							<Photo image={image} eager={i === 0} />
						</figure>
					))}
				</section>
				<StoreIconButton
					variant="outline"
					aria-label={m.gallery_previous()}
					aria-controls={id}
					disabled={active === 0}
					onClick={() => go(active - 1)}
					className={cn(arrow, "left-4")}
				>
					<ChevronLeft aria-hidden className="size-5" />
				</StoreIconButton>
				<StoreIconButton
					variant="outline"
					aria-label={m.gallery_next()}
					aria-controls={id}
					disabled={active === count - 1}
					onClick={() => go(active + 1)}
					className={cn(arrow, "right-4")}
				>
					<ChevronRight aria-hidden className="size-5" />
				</StoreIconButton>
				<p
					aria-hidden
					className="pointer-events-none absolute right-3 bottom-3 type-meta text-muted-foreground tabular-nums md:hidden"
				>
					{active + 1} / {count}
				</p>
			</div>
			<div className="-mx-1 mt-2 -mb-1 flex scroll-px-1.5 gap-3 overflow-x-auto p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
				{images.map((image, i) => (
					<StoreIconButton
						key={image.url}
						onClick={() => go(i)}
						aria-label={m.product_image_n({ n: i + 1 })}
						aria-current={i === active ? "true" : undefined}
						aria-controls={id}
						className={cn(
							"size-20 shrink-0 overflow-hidden rounded-none bg-photo hover:bg-photo max-md:size-16",
							i === active && "outline-2 outline-offset-0 outline-foreground",
						)}
					>
						<img
							src={image.url}
							alt=""
							width={image.width}
							height={image.height}
							loading="lazy"
							decoding="async"
							className={
								image.kind === "packshot"
									? "h-4/5 w-4/5 object-contain"
									: "h-full w-full object-cover"
							}
						/>
					</StoreIconButton>
				))}
			</div>
		</div>
	);
}

function Photo({
	image,
	eager = false,
}: {
	image: GalleryImage;
	eager?: boolean;
}) {
	const packshot = image.kind === "packshot";
	return (
		<div
			className={cn(
				"flex aspect-square items-center justify-center overflow-hidden bg-photo",
				packshot && "p-[14%]",
			)}
		>
			<img
				src={image.url}
				alt={image.alt}
				width={image.width}
				height={image.height}
				loading={eager ? "eager" : "lazy"}
				fetchPriority={eager ? "high" : undefined}
				decoding={eager ? undefined : "async"}
				draggable={false}
				className={cn(
					"h-full w-full",
					packshot ? "object-contain" : "object-cover",
				)}
			/>
		</div>
	);
}
