import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import Markdown from "react-markdown";
import { useStoreDate } from "#/hooks/use-store-date";
import { isNotFound } from "#/lib/api";
import { pageQuery, storeQuery } from "#/lib/queries";
import { sellerDetails } from "#/lib/seller";
import { pageMeta } from "#/lib/seo";
import { m } from "#/paraglide/messages";
import { getLocale } from "#/paraglide/runtime";

export const Route = createFileRoute("/_store/pages/$slug")({
	loader: async ({ context, params }) => {
		try {
			const [store, page] = await Promise.all([
				context.queryClient.ensureQueryData(storeQuery),
				context.queryClient.ensureQueryData(
					pageQuery(params.slug, getLocale()),
				),
			]);
			return { storeName: store.name, title: page.title };
		} catch (e) {
			if (isNotFound(e)) throw notFound();
			throw e;
		}
	},
	head: ({ loaderData }) => ({
		meta: loaderData
			? pageMeta({ title: loaderData.title, storeName: loaderData.storeName })
			: [],
	}),
	component: Page,
});

// Legal pages show the seller identity from store settings (consumer protection law, Art. 21-A).
function Page() {
	const { slug } = Route.useParams();
	const locale = getLocale();
	const { data: page } = useSuspenseQuery(pageQuery(slug, locale));
	const { data: store } = useSuspenseQuery(storeQuery);
	const formatDate = useStoreDate();
	const seller = sellerDetails(store.business);
	// Formatted in the store zone so the server render and the browser agree.
	const updated = formatDate(page.updatedAt);

	return (
		<article className="mx-auto max-w-[68ch] px-4 py-16">
			<h1 className="type-h2">{page.title}</h1>
			<p className="mt-3 type-small text-muted-foreground">
				{m.legal_updated({ date: updated })}
			</p>
			<div className="prose mt-8 max-w-none prose-neutral prose-headings:tracking-[-0.02em]">
				<Markdown>{page.bodyMarkdown}</Markdown>
			</div>
			<section className="mt-12 border-t pt-6 type-small">
				<h2 className="font-bold">{m.legal_seller()}</h2>
				<p className="mt-2 text-muted-foreground">{seller.join(" · ")}</p>
			</section>
		</article>
	);
}
