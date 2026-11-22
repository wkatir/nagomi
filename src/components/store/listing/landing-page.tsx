import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import type { Trail } from "#/lib/crumbs";
import type { ListingScope, ListingSearch } from "#/lib/listing";
import { m } from "#/paraglide/messages";
import { ProductListing } from "./product-listing";

export function LandingPage({
	trail,
	title,
	subtitle,
	description,
	scope,
	search,
	onChange,
}: {
	trail: Trail;
	title: string;
	subtitle?: string | null;
	description: string | null;
	scope: ListingScope;
	search: ListingSearch;
	onChange: (next: ListingSearch) => void | Promise<void>;
}) {
	return (
		<div className="container-page py-section-sm">
			<StoreBreadcrumb trail={trail} className="-mt-3" />
			<h1 className="mt-2 type-h1 text-balance">{title}</h1>
			{subtitle && (
				<p className="mt-2 type-h3 text-foreground-secondary">{subtitle}</p>
			)}
			{description && (
				<p className="mt-4 max-w-[62ch] type-lead text-foreground-secondary">
					{description}
				</p>
			)}
			<section
				aria-labelledby="landing-products-title"
				className="mt-section-sm"
			>
				<SectionHeading id="landing-products-title" title={m.shop_title()} />
				<div className="mt-8">
					<ProductListing
						search={search}
						scope={scope}
						onChange={onChange}
						headingLevel={3}
					/>
				</div>
			</section>
		</div>
	);
}
