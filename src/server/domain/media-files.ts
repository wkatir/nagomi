import { type Db, schema } from "#/db";
import { inList } from "./d1";
import { mediaUrl } from "./images";

const { mediaFiles } = schema;

export const mediaView = (
	file: typeof mediaFiles.$inferSelect | null | undefined,
) => (file ? { ...file, url: mediaUrl(file.r2Key) } : null);

export async function mediaAvailable(
	db: Db,
	ids: (number | null | undefined)[],
) {
	const wanted = [
		...new Set(ids.filter((id): id is number => typeof id === "number")),
	];
	if (wanted.length === 0) return true;
	const found = await db
		.select({ id: mediaFiles.id })
		.from(mediaFiles)
		.where(inList(mediaFiles.id, wanted));
	return found.length === wanted.length;
}
