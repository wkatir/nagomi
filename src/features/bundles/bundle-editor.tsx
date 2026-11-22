import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { WritableFor } from "#/components/admin/staff-access";
import { storeQuery } from "#/lib/queries";
import { LifecycleHeader } from "../merchandising/lifecycle-header";
import { BundleDetails } from "./bundle-details";
import { BundleItems } from "./bundle-items";
import { BundleTexts } from "./bundle-texts";
import { useBundleStatus } from "./mutations";
import { missingLabel, missingToPublish } from "./publishing";
import type { BundleDetail } from "./queries";

// Each card is keyed by its data, so it is rebuilt with what was saved.
export function BundleEditor({ bundle }: { bundle: BundleDetail }) {
	const { data: settings } = useSuspenseQuery(storeQuery);
	const { defaultLocale } = settings;
	const router = useRouter();
	const status = useBundleStatus();
	const title = bundle.translations.find((t) => t.locale === defaultLocale);

	return (
		<WritableFor area="catalog">
			<DetailPage>
				<LifecycleHeader
					title={title?.name ?? bundle.slug}
					status={bundle.status}
					missing={missingToPublish(bundle, defaultLocale).map((need) =>
						missingLabel[need](),
					)}
					busy={status.isPending}
					onStatus={(next) => status.mutate({ id: bundle.id, status: next })}
				/>
				<DetailColumns
					aside={
						<BundleDetails
							key={`${bundle.slug}/${bundle.price}/${bundle.position}/${bundle.isFeatured}`}
							bundle={bundle}
						/>
					}
				>
					<BundleTexts
						key={JSON.stringify(bundle.translations)}
						bundle={bundle}
						defaultLocale={defaultLocale}
						onSaved={() => router.invalidate()}
					/>
					<BundleItems key={JSON.stringify(bundle.items)} bundle={bundle} />
				</DetailColumns>
			</DetailPage>
		</WritableFor>
	);
}
