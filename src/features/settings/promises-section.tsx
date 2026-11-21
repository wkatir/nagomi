import { useSuspenseQuery } from "@tanstack/react-query";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { RETURN_WINDOW_PLACEHOLDER } from "#/lib/promises";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { PromiseCard } from "./promise-card";
import { promisesQuery } from "./queries";

export function PromisesSection() {
	const { data: promises } = useSuspenseQuery(promisesQuery);
	const { data: store } = useSuspenseQuery(storeQuery);
	if (promises.length === 0)
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>{m.admin_settings_promises_empty()}</EmptyTitle>
					<EmptyDescription>
						{m.admin_settings_promises_empty_hint()}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	return (
		<div className="grid gap-admin-stack">
			<p className="type-small text-muted-foreground">
				{m.admin_settings_promises_help({
					placeholder: RETURN_WINDOW_PLACEHOLDER,
				})}
			</p>
			{promises.map((promise) => (
				<PromiseCard
					key={promise.id}
					promise={promise}
					defaultLocale={store.defaultLocale}
				/>
			))}
		</div>
	);
}
