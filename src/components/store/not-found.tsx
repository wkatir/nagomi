import { Link } from "@tanstack/react-router";
import { Compass } from "lucide-react";
import { StoreButton } from "#/components/store/ui/store-button";
import { m } from "#/paraglide/messages";

export function StoreNotFound() {
	return (
		<div className="container-page pt-8">
			<div className="panel relative mx-auto max-w-xl overflow-hidden p-8 text-center md:p-12">
				<div
					aria-hidden
					className="absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_at_top,rgb(139_124_246/0.22),transparent_70%)]"
				/>
				<p
					aria-hidden
					className="relative font-serif text-6xl leading-none text-brand"
				>
					404
				</p>
				<span className="relative mx-auto mt-6 flex size-12 items-center justify-center rounded-full bg-accent text-brand">
					<Compass aria-hidden className="size-6" />
				</span>
				<h1 className="relative mt-4 type-h1 text-balance">
					{m.not_found_title()}
				</h1>
				<p className="relative mt-3 type-body text-foreground-secondary">
					{m.not_found_body()}
				</p>
				<div className="relative mt-8 flex flex-wrap justify-center gap-3">
					<StoreButton asChild>
						<Link to="/products">{m.not_found_products()}</Link>
					</StoreButton>
					<StoreButton asChild variant="outline">
						<Link to="/">{m.not_found_home()}</Link>
					</StoreButton>
				</div>
			</div>
		</div>
	);
}
