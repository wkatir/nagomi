import { MoreHorizontalIcon } from "lucide-react";
import { HeaderActions, PageHeader } from "#/components/admin/page-header";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import type { ProductStatus } from "#/lib/enums";
import { m } from "#/paraglide/messages";
import { lifecycleBadge, lifecycleStatusLabel } from "./status-labels";

// Unpublishing and archiving sit behind "more" since they are the exception.
export function LifecycleHeader({
	title,
	status,
	missing,
	busy,
	onStatus,
}: {
	title: string;
	status: ProductStatus;
	missing: string[];
	busy: boolean;
	onStatus: (status: ProductStatus) => void;
}) {
	return (
		<PageHeader
			title={title}
			badges={
				<Badge variant={lifecycleBadge[status]}>
					{lifecycleStatusLabel[status]()}
				</Badge>
			}
			description={
				status === "draft" && missing.length > 0
					? m.admin_merch_publish_missing({ items: missing.join(", ") })
					: undefined
			}
			action={
				<HeaderActions>
					{status === "draft" && (
						<Button
							className="max-sm:flex-1"
							disabled={busy || missing.length > 0}
							onClick={() => onStatus("published")}
						>
							{m.admin_merch_publish()}
						</Button>
					)}
					{status === "archived" && (
						<Button
							className="max-sm:flex-1"
							disabled={busy}
							onClick={() => onStatus("draft")}
						>
							{m.admin_merch_restore()}
						</Button>
					)}
					{status !== "archived" && (
						<DropdownMenu modal={false}>
							<DropdownMenuTrigger asChild>
								<Button
									variant="outline"
									size="icon"
									aria-label={m.admin_merch_more_actions()}
								>
									<MoreHorizontalIcon aria-hidden />
								</Button>
							</DropdownMenuTrigger>
							<DropdownMenuContent align="end">
								{status === "published" && (
									<DropdownMenuItem
										disabled={busy}
										onSelect={() => onStatus("draft")}
									>
										{m.admin_merch_unpublish()}
									</DropdownMenuItem>
								)}
								<DropdownMenuItem
									disabled={busy}
									onSelect={() => onStatus("archived")}
								>
									{m.admin_merch_archive()}
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</HeaderActions>
			}
		/>
	);
}
