import { useSuspenseQuery } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { DetailColumns, DetailPage } from "#/components/admin/detail-layout";
import { adminSettingsQuery } from "#/lib/queries";
import { LifecycleHeader } from "../merchandising/lifecycle-header";
import { useRoutineStatus } from "./mutations";
import { missingLabel, missingToPublish } from "./publishing";
import type { RoutineDetail } from "./queries";
import { RoutineDetails } from "./routine-details";
import { RoutineSteps } from "./routine-steps";
import { RoutineTexts } from "./routine-texts";

// Each card is keyed by its data, so it is rebuilt with what was saved.
export function RoutineEditor({ routine }: { routine: RoutineDetail }) {
	const { data: settings } = useSuspenseQuery(adminSettingsQuery);
	const { defaultLocale } = settings;
	const router = useRouter();
	const status = useRoutineStatus();
	const title = routine.translations.find((t) => t.locale === defaultLocale);

	return (
		<DetailPage>
			<LifecycleHeader
				title={title?.title ?? routine.slug}
				status={routine.status}
				missing={missingToPublish(routine, defaultLocale).map((need) =>
					missingLabel[need](),
				)}
				busy={status.isPending}
				onStatus={(next) => status.mutate({ id: routine.id, status: next })}
			/>
			<DetailColumns
				aside={
					<RoutineDetails
						key={`${routine.slug}/${routine.position}/${routine.isFeatured}`}
						routine={routine}
					/>
				}
			>
				<RoutineTexts
					key={JSON.stringify(routine.translations)}
					routine={routine}
					defaultLocale={defaultLocale}
					onSaved={() => router.invalidate()}
				/>
				<RoutineSteps key={JSON.stringify(routine.items)} routine={routine} />
			</DetailColumns>
		</DetailPage>
	);
}
