import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { adminSettingsQuery } from "#/lib/queries";
import { LifecycleHeader } from "../merchandising/lifecycle-header";
import { CollectionDetails } from "./collection-details";
import { CollectionProducts } from "./collection-products";
import { CollectionTexts } from "./collection-texts";
import { useCollectionStatus } from "./mutations";
import { missingLabel, missingToPublish } from "./publishing";
import type { CollectionDetail } from "./queries";

// Each card is keyed by its data, so it is rebuilt with what was saved.
export function CollectionEditor({
	collection,
}: {
	collection: CollectionDetail;
}) {
	const { data: settings } = useSuspenseQuery(adminSettingsQuery);
	const { defaultLocale } = settings;
	const router = useRouter();
	const status = useCollectionStatus();
	const title = collection.translations.find((t) => t.locale === defaultLocale);

	return (
		<DetailPage>
			<LifecycleHeader
				title={title?.title ?? collection.slug}
				status={collection.status}
				missing={missingToPublish(collection, defaultLocale).map((need) =>
					missingLabel[need](),
				)}
				busy={status.isPending}
				onStatus={(next) => status.mutate({ id: collection.id, status: next })}
			/>
			<DetailColumns
				aside={
					<CollectionDetails
						key={`${collection.slug}/${collection.position}/${collection.showOnHome}/${collection.coverMediaId}`}
						collection={collection}
					/>
				}
			>
				<CollectionTexts
					key={JSON.stringify(collection.translations)}
					collection={collection}
					defaultLocale={defaultLocale}
					onSaved={() => router.invalidate()}
				/>
				<CollectionProducts
					key={JSON.stringify(collection.products)}
					collection={collection}
				/>
			</DetailColumns>
		</DetailPage>
	);
}
