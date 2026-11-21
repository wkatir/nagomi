import { getTableColumns } from "drizzle-orm";
import { schema } from "#/db";

const { mediaFiles, productImages } = schema;

// Select from product_images joined to media_files on
// `media_files.id = product_images.media_file_id`.
export const productPhotoColumns = {
	...getTableColumns(productImages),
	r2Key: mediaFiles.r2Key,
	contentType: mediaFiles.contentType,
	byteSize: mediaFiles.byteSize,
	width: mediaFiles.width,
	height: mediaFiles.height,
};
