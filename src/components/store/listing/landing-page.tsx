import type { LucideIcon } from "lucide-react";
import { PageHeader } from "#/components/store/ui/page-header";
import { StoreBreadcrumb } from "#/components/store/ui/store-breadcrumb";
import type { Trail } from "#/lib/crumbs";
import type { ListingScope, ListingSearch } from "#/lib/listing";
import { ProductListing } from "./product-listing";

export function LandingPage({
	trail,
	title,
	subtitle,
	description,
	icon,
	scope,
	search,
	onChange,
}: {
	trail: Trail;
	title: string;
	subtitle?: string | null;
	description?: string | null;
	icon?: LucideIcon;
	scope?: ListingScope;
	search: ListingSearch;
	onChange: (next: ListingSearch) => void | Promise<void>;
}) {
	return (
		<div className="container-page pt-4 md:pt-6">
			<StoreBreadcrumb trail={trail} />
			<PageHeader
				title={title}
				subtitle={subtitle}
				description={description}
				icon={icon}
				className="mt-2 mb-6"
			/>
			<ProductListing
				search={search}
				scope={scope}
				onChange={onChange}
				headingLevel={2}
			/>
		</div>
	);
}
