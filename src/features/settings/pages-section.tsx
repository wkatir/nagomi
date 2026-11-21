import { useSuspenseQuery } from "@tanstack/react-query";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyTitle,
} from "#/components/ui/empty";
import { storeQuery } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { PageCard } from "./page-card";
import { pagesQuery } from "./queries";

export function PagesSection() {
	const { data: pages } = useSuspenseQuery(pagesQuery);
	const { data: store } = useSuspenseQuery(storeQuery);
	if (pages.length === 0)
		return (
			<Empty>
				<EmptyHeader>
					<EmptyTitle>{m.admin_settings_pages_empty()}</EmptyTitle>
					<EmptyDescription>
						{m.admin_settings_pages_empty_hint()}
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	return (
		<div className="grid gap-admin-stack">
			<p className="type-small text-muted-foreground">
				{m.admin_settings_pages_help()}
			</p>
			{pages.map((page) => (
				<PageCard
					key={page.id}
					page={page}
					defaultLocale={store.defaultLocale}
				/>
			))}
		</div>
	);
}
