import { RoutineCard } from "#/components/store/routine-card";
import { SectionHeading } from "#/components/store/ui/section-heading";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import type { Trail } from "#/lib/crumbs";
import type { ListingScope, ListingSearch } from "#/lib/listing";
import type { RoutineView } from "#/lib/queries";
import { m } from "#/paraglide/messages";
import { ProductListing } from "./product-listing";

export function LandingPage({
	trail,
	title,
	description,
	routines = [],
	scope,
	search,
	onChange,
}: {
	trail: Trail;
	title: string;
	description: string | null;
	routines?: RoutineView[];
	scope: ListingScope;
	search: ListingSearch;
	onChange: (next: ListingSearch) => void | Promise<void>;
}) {
	return (
		<div className="container-page py-section-sm">
			<StoreBreadcrumb trail={trail} className="-mt-3" />
			<h1 className="mt-2 type-h1 text-balance">{title}</h1>
			{description && (
				<p className="mt-4 max-w-[62ch] type-lead text-foreground-secondary">
					{description}
				</p>
			)}
			{routines.length > 0 && (
				<section
					aria-labelledby="landing-routines-title"
					className="mt-section-sm"
				>
					<SectionHeading
						id="landing-routines-title"
						title={m.need_routines_title()}
					/>
					<ul className="mt-8 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
						{routines.map((routine) => (
							<li key={routine.slug}>
								<RoutineCard routine={routine} />
							</li>
						))}
					</ul>
				</section>
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
