import { cn } from "cn";
import { BundleCard } from "#/components/store/bundle-card";
import { ProductCard } from "#/components/store/product-card";
import { SectionHeading } from "#/components/store/ui/section-heading";
import type { BundleView, CatalogCard } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import type { Relation } from "#/server/domain/related";

type Related = CatalogCard & { relation: Relation };

// The padding keeps focus outlines inside the scroll box.
const rail =
	"mt-6 grid grid-flow-col overflow-x-auto max-md:-mx-4 max-md:snap-x max-md:snap-mandatory max-md:scroll-px-4 max-md:p-4 max-md:pt-2 md:mt-8 md:grid-flow-row md:overflow-visible";

// One row on a wide screen; the API sends the best first.
const RAIL_LIMIT = 4;

export function RelatedProducts({
	related,
	bundles,
}: {
	related: Related[];
	bundles: BundleView[];
}) {
	if (related.length === 0 && bundles.length === 0) return null;
	const complements = related
		.filter((r) => r.relation === "complement")
		.slice(0, RAIL_LIMIT);
	const alternatives = related
		.filter((r) => r.relation === "alternative")
		.slice(0, RAIL_LIMIT);
	return (
		<div className="container-page grid grid-cols-1 gap-section-sm border-t pt-section-sm">
			{complements.length > 0 && (
				<Rail
					id="complements-title"
					title={m.product_complements()}
					products={complements}
				/>
			)}
			<ProductBundles bundles={bundles} />
			{alternatives.length > 0 && (
				<Rail
					id="alternatives-title"
					title={m.product_alternatives()}
					products={alternatives}
				/>
			)}
		</div>
	);
}

function Rail({
	id,
	title,
	products,
}: {
	id: string;
	title: string;
	products: Related[];
}) {
	return (
		<section aria-labelledby={id}>
			<SectionHeading id={id} title={title} />
			<ul
				className={cn(
					rail,
					"auto-cols-[44%] gap-3 md:grid-cols-3 md:gap-x-5 md:gap-y-12 lg:grid-cols-4",
				)}
			>
				{products.map((p) => (
					<li key={p.slug} className="snap-start">
						<ProductCard product={p} headingLevel={3} className="h-full" />
					</li>
				))}
			</ul>
		</section>
	);
}

function ProductBundles({ bundles }: { bundles: BundleView[] }) {
	if (bundles.length === 0) return null;
	return (
		<section aria-labelledby="product-bundles-title">
			<SectionHeading id="product-bundles-title" title={m.product_bundles()} />
			<ul
				className={cn(
					rail,
					"auto-cols-[86%] gap-5 md:grid-cols-2 lg:grid-cols-3",
				)}
			>
				{bundles.map((r) => (
					<li key={r.slug} className="snap-start">
						<BundleCard bundle={r} />
					</li>
				))}
			</ul>
		</section>
	);
}
