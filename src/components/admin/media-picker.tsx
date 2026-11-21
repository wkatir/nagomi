import {
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query";
import { ImageIcon, UploadIcon } from "lucide-react";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import { Field } from "#/components/admin/field";
import { useFieldContext } from "#/components/admin/form/form-context";
import { Button } from "#/components/ui/button";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import {
	type MediaFile,
	mediaFileQuery,
	mediaFilesQuery,
	uploadMedia,
} from "#/features/media/queries";
import { errorMessage } from "#/lib/errors";
import { m } from "#/paraglide/messages";
import { AdminDialog } from "./admin-dialog";

function MediaPicker({
	onPick,
	onClose,
}: {
	onPick: (file: MediaFile) => void;
	onClose: () => void;
}) {
	const queryClient = useQueryClient();
	const files = useInfiniteQuery(mediaFilesQuery);
	const input = useRef<HTMLInputElement>(null);
	const [uploading, setUploading] = useState(false);
	const items = files.data?.pages.flatMap((page) => page.items) ?? [];

	const upload = async (file: File) => {
		setUploading(true);
		try {
			const stored = await uploadMedia(file);
			await queryClient.invalidateQueries({
				queryKey: mediaFilesQuery.queryKey,
			});
			onPick(stored);
		} catch (error) {
			toast.error(errorMessage(error));
		} finally {
			setUploading(false);
		}
	};

	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-3xl"
			title={m.admin_media_title()}
		>
			<div className="flex justify-end">
				<Input
					ref={input}
					type="file"
					accept="image/jpeg,image/png,image/webp,image/avif"
					className="hidden"
					onChange={(event) => {
						const file = event.target.files?.[0];
						event.target.value = "";
						if (file) upload(file);
					}}
				/>
				<Button
					type="button"
					variant="outline"
					size="sm"
					disabled={uploading}
					onClick={() => input.current?.click()}
				>
					{uploading ? <Spinner aria-hidden /> : <UploadIcon aria-hidden />}
					{m.admin_media_upload()}
				</Button>
			</div>
			{files.isError && (
				<p role="alert" className="type-small text-destructive">
					{errorMessage(files.error)}
				</p>
			)}
			{files.isSuccess && items.length === 0 && (
				<p className="type-small text-muted-foreground">
					{m.admin_media_empty()}
				</p>
			)}
			<ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
				{items.map((file) => (
					<li key={file.id}>
						<Button
							type="button"
							variant="outline"
							className="aspect-square h-auto w-full overflow-hidden p-0"
							aria-label={m.admin_media_image_n({ id: file.id })}
							onClick={() => onPick(file)}
						>
							<img
								src={file.url}
								alt=""
								loading="lazy"
								className="size-full object-cover"
							/>
						</Button>
					</li>
				))}
			</ul>
			{files.hasNextPage && (
				<Button
					type="button"
					variant="outline"
					disabled={files.isFetchingNextPage}
					onClick={() => files.fetchNextPage()}
				>
					{m.admin_media_more()}
				</Button>
			)}
		</AdminDialog>
	);
}

export function MediaField({ label }: { label: string }) {
	const field = useFieldContext<number | null>();
	const id = useId();
	const [picking, setPicking] = useState(false);
	const value = field.state.value;
	const file = useQuery({
		...mediaFileQuery(value ?? 0),
		enabled: value !== null,
	});
	return (
		<Field id={id} label={label}>
			<div className="flex items-center gap-3">
				<div className="grid size-20 shrink-0 place-items-center overflow-hidden rounded-md border bg-muted">
					{file.data ? (
						<img
							src={file.data.url}
							alt=""
							className="size-full object-cover"
						/>
					) : (
						<ImageIcon aria-hidden className="text-muted-foreground" />
					)}
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						id={id}
						type="button"
						variant="outline"
						size="sm"
						onClick={() => setPicking(true)}
					>
						{value === null ? m.admin_media_choose() : m.admin_media_change()}
					</Button>
					{value !== null && (
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={() => field.handleChange(null)}
						>
							{m.admin_media_remove()}
						</Button>
					)}
				</div>
			</div>
			{picking && (
				<MediaPicker
					onClose={() => setPicking(false)}
					onPick={(picked) => {
						field.handleChange(picked.id);
						setPicking(false);
					}}
				/>
			)}
		</Field>
	);
}
