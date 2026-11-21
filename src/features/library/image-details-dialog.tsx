import { useSuspenseQuery } from "@tanstack/react-query";
import { AdminDialog } from "#/components/admin/admin-dialog";
import { Fact } from "#/components/admin/section";
import type { MediaFile } from "#/features/media/queries";
import { useStoreDate } from "#/hooks/use-store-date";
import { intlLocale } from "#/lib/intl";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";
import { formatFileSize } from "./file-size";
import { ImageUsage } from "./image-usage";

const typeName: Record<MediaFile["contentType"], string> = {
	"image/jpeg": "JPEG",
	"image/png": "PNG",
	"image/webp": "WebP",
	"image/avif": "AVIF",
};

export function ImageDetailsDialog({
	file,
	onClose,
}: {
	file: MediaFile;
	onClose: () => void;
}) {
	const { data: store } = useSuspenseQuery(storeQuery);
	const formatDate = useStoreDate();
	const locale = intlLocale(getLocale(), store.countryCode);
	return (
		<AdminDialog
			onClose={onClose}
			className="sm:max-w-3xl"
			title={m.admin_media_image_n({ id: file.id })}
		>
			<div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_16rem]">
				<div className="grid max-h-80 place-items-center overflow-hidden rounded-md border bg-muted">
					<img
						src={file.url}
						alt=""
						width={file.width}
						height={file.height}
						className="max-h-80 w-full object-contain"
					/>
				</div>
				<dl className="grid content-start gap-3">
					<Fact
						label={m.admin_library_type()}
						value={typeName[file.contentType]}
					/>
					<Fact
						label={m.admin_library_size()}
						value={m.admin_library_size_value({
							size: formatFileSize(file.byteSize, locale),
							bytes: new Intl.NumberFormat(locale).format(file.byteSize),
						})}
					/>
					<Fact
						label={m.admin_library_dimensions()}
						value={m.admin_library_dimensions_value({
							width: file.width,
							height: file.height,
						})}
					/>
					<Fact
						label={m.admin_library_uploaded_on()}
						value={formatDate(file.createdAt, {
							dateStyle: "medium",
							timeStyle: "short",
						})}
					/>
				</dl>
			</div>
			<section className="grid gap-2 border-t pt-4">
				<h3 className="type-ui font-bold">{m.admin_library_used_in()}</h3>
				<ImageUsage id={file.id} />
			</section>
		</AdminDialog>
	);
}
