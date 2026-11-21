import { useInfiniteQuery } from "@tanstack/react-query";
import { UploadIcon } from "lucide-react";
import { useRef, useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import { Skeleton } from "#/components/ui/skeleton";
import { Spinner } from "#/components/ui/spinner";
import { type MediaFile, mediaFilesQuery } from "#/features/media/queries";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { ImageDetailsDialog } from "./image-details-dialog";
import { useUploadImages } from "./use-upload-images";

const GRID =
	"grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6";

function GridSkeleton() {
	return (
		<div aria-busy className={GRID}>
			{["a", "b", "c", "d", "e", "f", "g", "h"].map((key) => (
				<Skeleton key={key} className="aspect-square w-full" />
			))}
		</div>
	);
}

export function LibraryGrid() {
	const files = useInfiniteQuery(mediaFilesQuery);
	const upload = useUploadImages();
	const input = useRef<HTMLInputElement>(null);
	const [selected, setSelected] = useState<MediaFile | null>(null);
	const items = files.data?.pages.flatMap((page) => page.items) ?? [];

	const choose = () => input.current?.click();
	const uploadButton = (variant: "default" | "outline") => (
		<Button variant={variant} disabled={upload.isPending} onClick={choose}>
			{upload.isPending ? <Spinner aria-hidden /> : <UploadIcon aria-hidden />}
			{m.admin_library_upload()}
		</Button>
	);

	return (
		<>
			<Input
				ref={input}
				type="file"
				multiple
				accept="image/jpeg,image/png,image/webp,image/avif"
				className="hidden"
				onChange={(event) => {
					const chosen = Array.from(event.target.files ?? []);
					event.target.value = "";
					if (chosen.length > 0) upload.mutate(chosen);
				}}
			/>
			{files.isPending && <GridSkeleton />}
			{files.isError && (
				<Alert variant="destructive">
					<AlertDescription className="flex flex-wrap items-center justify-between gap-3">
						{errorMessage(files.error)}
						<Button variant="outline" size="sm" onClick={() => files.refetch()}>
							{m.admin_table_retry()}
						</Button>
					</AlertDescription>
				</Alert>
			)}
			{files.isSuccess && items.length === 0 && (
				<Empty>
					<EmptyHeader>
						<EmptyTitle>{m.admin_library_empty()}</EmptyTitle>
						<EmptyDescription>{m.admin_library_empty_hint()}</EmptyDescription>
					</EmptyHeader>
					<EmptyContent>
						{uploadButton("default")}
						<p className="type-meta text-muted-foreground">
							{m.admin_library_hint()}
						</p>
					</EmptyContent>
				</Empty>
			)}
			{items.length > 0 && (
				<div className="grid gap-4">
					<div className="flex flex-wrap items-center justify-between gap-2">
						<p className="type-small text-muted-foreground">
							{m.admin_library_hint()}
						</p>
						{uploadButton("outline")}
					</div>
					<ul className={GRID}>
						{items.map((file) => (
							<li key={file.id}>
								<Button
									variant="outline"
									className="aspect-square h-auto w-full overflow-hidden p-0"
									aria-label={m.admin_media_image_n({ id: file.id })}
									onClick={() => setSelected(file)}
								>
									<img
										src={file.url}
										alt=""
										loading="lazy"
										width={file.width}
										height={file.height}
										className="size-full object-cover"
									/>
								</Button>
							</li>
						))}
					</ul>
					{files.hasNextPage && (
						<Button
							variant="outline"
							className="mx-auto"
							disabled={files.isFetchingNextPage}
							onClick={() => files.fetchNextPage()}
						>
							{files.isFetchingNextPage && <Spinner aria-hidden />}
							{m.admin_media_more()}
						</Button>
					)}
				</div>
			)}
			{selected && (
				<ImageDetailsDialog file={selected} onClose={() => setSelected(null)} />
			)}
		</>
	);
}
