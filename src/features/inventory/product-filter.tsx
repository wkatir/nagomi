import { PackageIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { SizePicker } from "#/components/admin/size-picker";
import { Button } from "#/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { m } from "#/paraglide/messages";

// The SKU is what the URL keeps, so a link can arrive with it.
export function ProductFilter({
	sku,
	onChange,
}: {
	sku: string | undefined;
	onChange: (sku: string | undefined) => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<div className="flex items-center">
			<Popover open={open} onOpenChange={setOpen}>
				<PopoverTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						data-active={sku !== undefined}
						className="font-normal data-[active=false]:text-muted-foreground data-[active=true]:rounded-r-none"
					>
						<PackageIcon aria-hidden />
						{sku ?? m.admin_movement_filter_product()}
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-80 p-0">
					<SizePicker
						picked={new Set()}
						placeholder={m.admin_movement_find_product()}
						onPick={(size) => {
							onChange(size.sku);
							setOpen(false);
						}}
					/>
				</PopoverContent>
			</Popover>
			{sku !== undefined && (
				<Button
					variant="outline"
					size="icon-sm"
					className="rounded-l-none border-l-0"
					aria-label={m.admin_movement_clear_product()}
					onClick={() => onChange(undefined)}
				>
					<XIcon aria-hidden />
				</Button>
			)}
		</div>
	);
}
