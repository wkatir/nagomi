import { cn } from "cn";
import type { ComponentProps, ReactNode } from "react";
import { Tabs, TabsList, TabsTrigger } from "#/components/ui/tabs";

export function PageTabs({
	value,
	onValueChange,
	label,
	children,
}: {
	value: string;
	onValueChange?: (value: string) => void;
	label?: string;
	children: ReactNode;
}) {
	return (
		<Tabs
			value={value}
			onValueChange={onValueChange}
			className="mb-admin-section"
		>
			<TabsList
				variant="line"
				aria-label={label}
				className="w-full justify-start gap-6 overflow-x-auto border-b"
			>
				{children}
			</TabsList>
		</Tabs>
	);
}

export function PageTab({
	className,
	...props
}: ComponentProps<typeof TabsTrigger>) {
	return (
		<TabsTrigger
			className={cn("flex-none px-0 type-ui", className)}
			{...props}
		/>
	);
}
