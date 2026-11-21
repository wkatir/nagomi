import { useRouter } from "@tanstack/react-router";
import { StoreButton } from "#/components/store/ui/store-button";
import { m } from "#/paraglide/messages";

// Fixed copy: the error the server rendered with is not the one the browser gets.
// Invalidating reruns the loaders, which also resets the boundary.
export function RouteError() {
	const router = useRouter();
	return (
		<div className="container-page py-section">
			<h1 className="max-w-[16ch] type-h1 text-balance">
				{m.error_page_title()}
			</h1>
			<p className="mt-5 max-w-[44ch] type-lead text-foreground-secondary">
				{m.error_page_body()}
			</p>
			<StoreButton onClick={() => router.invalidate()} className="mt-8">
				{m.error_retry()}
			</StoreButton>
		</div>
	);
}
