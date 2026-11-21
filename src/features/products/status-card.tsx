import { useSuspenseQuery } from "@tanstack/react-query";
import { CheckCircle2Icon, CircleIcon } from "lucide-react";
import { languageName } from "#/components/admin/labels";
import { Section } from "#/components/admin/section";
import type { AdminProduct } from "#/lib/api";
import type { Locale, ProductStatus } from "#/lib/enums";
import { storeQuery } from "#/lib/queries";
import {
	PUBLISH_REQUIREMENTS,
	type PublishRequirement,
} from "#/lib/schemas/products";
import { m } from "#/paraglide/messages";
import { ProductStatusBadge } from "./status-badge";

const requirementLabel = (requirement: PublishRequirement, language: string) =>
	({
		text: m.admin_product_req_text({ language }),
		price: m.admin_product_req_price(),
		photo_alt: m.admin_product_req_photo_alt({ language }),
		brand: m.admin_product_req_brand(),
		category: m.admin_product_req_category(),
	})[requirement];

export function PublishChecklist({
	missing,
	defaultLocale,
}: {
	missing: readonly PublishRequirement[];
	defaultLocale: Locale;
}) {
	const language = languageName[defaultLocale]();
	return (
		<ul className="grid gap-2">
			{PUBLISH_REQUIREMENTS.map((requirement) => {
				const lacking = missing.includes(requirement);
				return (
					<li
						key={requirement}
						className="type-small flex items-start gap-2"
						data-missing={lacking}
					>
						{lacking ? (
							<CircleIcon
								aria-hidden
								className="mt-0.5 size-4 shrink-0 text-muted-foreground"
							/>
						) : (
							<CheckCircle2Icon
								aria-hidden
								className="mt-0.5 size-4 shrink-0"
							/>
						)}
						<span className={lacking ? undefined : "text-muted-foreground"}>
							{requirementLabel(requirement, language)}
							<span className="sr-only">
								{" "}
								{lacking
									? m.admin_product_req_missing()
									: m.admin_product_req_done()}
							</span>
						</span>
					</li>
				);
			})}
		</ul>
	);
}

const statusNote = (status: ProductStatus) =>
	({
		draft: m.admin_product_note_draft(),
		published: m.admin_product_note_published(),
		archived: m.admin_product_note_archived(),
	})[status];

export function StatusCard({ product }: { product: AdminProduct }) {
	const { data: store } = useSuspenseQuery(storeQuery);
	return (
		<Section title={m.admin_product_status_title()}>
			<div className="grid gap-4 p-admin-card">
				<div className="grid justify-items-start gap-2">
					<ProductStatusBadge status={product.status} />
					<p className="type-small text-muted-foreground">
						{statusNote(product.status)}
					</p>
				</div>
				{product.status === "draft" && (
					<div className="grid gap-3">
						<h3 className="type-small font-bold">
							{m.admin_product_checklist()}
						</h3>
						<PublishChecklist
							missing={product.publishMissing}
							defaultLocale={store.defaultLocale}
						/>
						{product.publishMissing.length === 0 && (
							<p className="type-small text-muted-foreground">
								{m.admin_product_ready()}
							</p>
						)}
					</div>
				)}
			</div>
		</Section>
	);
}
