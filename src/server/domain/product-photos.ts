import { getTableColumns } from "drizzle-orm";
import { schema } from "#/db";

const { mediaFiles, productImages } = schema;

export const productPhotoColumns = {
	...getTableColumns(productImages),
	r2Key: mediaFiles.r2Key,
	contentType: mediaFiles.contentType,
	byteSize: mediaFiles.byteSize,
	width: mediaFiles.width,
	height: mediaFiles.height,
};
