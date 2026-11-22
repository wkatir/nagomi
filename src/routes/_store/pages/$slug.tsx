import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import Markdown from "react-markdown";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
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

function Page() {
	const { slug } = Route.useParams();
	const locale = getLocale();
	const { data: page } = useSuspenseQuery(pageQuery(slug, locale));
	const { data: store } = useSuspenseQuery(storeQuery);
	const formatDate = useStoreDate();
	const seller = sellerDetails(store);
	const updated = formatDate(page.updatedAt);

	return (
		<div className="container-page pt-4 md:pt-6">
			<StoreBreadcrumb
				trail={{
					ancestors: ["home"],
					current: { name: page.title, path: `/pages/${page.slug}` },
				}}
			/>
			<article className="panel mx-auto mt-2 max-w-[72ch] px-5 py-8 md:px-10 md:py-10">
				<h1 className="type-h1 text-balance">{page.title}</h1>
				<p className="mt-2 type-meta text-muted-foreground">
					{m.legal_updated({ date: updated })}
				</p>
				<div className="prose prose-invert mt-8 max-w-none text-[0.9375rem] leading-[1.75] prose-headings:font-semibold prose-headings:tracking-[-0.01em] prose-headings:text-foreground prose-h2:mt-10 prose-h2:text-lg prose-h3:text-base prose-p:text-foreground-secondary prose-a:text-brand prose-a:underline-offset-4 prose-strong:text-foreground prose-li:text-foreground-secondary prose-li:marker:text-brand prose-hr:border-border">
					<Markdown>{page.bodyMarkdown}</Markdown>
				</div>
				{seller.length > 0 && (
					<section className="mt-10 rounded-lg border bg-background p-4 type-small">
						<h2 className="type-h4">{m.legal_seller()}</h2>
						<p className="mt-1 text-muted-foreground">{seller.join(" · ")}</p>
					</section>
				)}
			</article>
		</div>
	);
}
