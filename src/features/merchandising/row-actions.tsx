import { MoreHorizontalIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import { m } from "#/paraglide/messages";

export function RowActions({
	name,
	onEdit,
	onArchive,
	onRestore,
}: {
	name: string;
	onEdit?: () => void;
	onArchive?: () => void;
	onRestore?: () => void;
}) {
	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<Button
					variant="ghost"
					size="icon-sm"
					aria-label={m.admin_merch_row_actions({ name })}
				>
					<MoreHorizontalIcon aria-hidden />
				</Button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end">
				{onEdit && (
					<DropdownMenuItem onSelect={onEdit}>
						{m.admin_edit()}
					</DropdownMenuItem>
				)}
				{onArchive && (
					<DropdownMenuItem onSelect={onArchive}>
						{m.admin_merch_archive()}
					</DropdownMenuItem>
				)}
				{onRestore && (
					<DropdownMenuItem onSelect={onRestore}>
						{m.admin_merch_restore()}
					</DropdownMenuItem>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
