import { Link } from "@tanstack/react-router";
import { StoreButton } from "#/components/store/ui/store-button";
import { m } from "#/paraglide/messages";

export function StoreNotFound() {
	return (
		<div className="container-page py-section">
			<h1 className="max-w-[16ch] type-h1 text-balance">
				{m.not_found_title()}
			</h1>
			<p className="mt-5 max-w-[44ch] type-lead text-foreground-secondary">
				{m.not_found_body()}
			</p>
			<div className="mt-8 flex flex-wrap gap-3">
				<StoreButton asChild>
					<Link to="/products">{m.not_found_products()}</Link>
				</StoreButton>
				<StoreButton asChild variant="outline">
					<Link to="/">{m.not_found_home()}</Link>
				</StoreButton>
			</div>
		</div>
	);
}
