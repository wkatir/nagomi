import { cn } from "cn";
import type { ReactNode } from "react";
import { languageName } from "#/components/admin/labels";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs";
import { LOCALES, type Locale } from "#/lib/enums";

// A tab whose fields have errors says so, since its fields may be out of sight.
export function LocaleTabs({
	defaultLocale,
	invalid = [],
	children,
}: {
	defaultLocale: Locale;
	invalid?: readonly Locale[];
	children: (locale: Locale) => ReactNode;
}) {
	const locales = [
		defaultLocale,
		...LOCALES.filter((l) => l !== defaultLocale),
	];
	return (
		<Tabs defaultValue={defaultLocale}>
			<TabsList>
				{locales.map((locale) => (
					<TabsTrigger
						key={locale}
						value={locale}
						className={cn(invalid.includes(locale) && "text-destructive")}
					>
						{languageName[locale]()}
						{invalid.includes(locale) && (
							<span
								aria-hidden
								className="ml-1.5 size-1.5 rounded-full bg-destructive"
							/>
						)}
					</TabsTrigger>
				))}
			</TabsList>
			{locales.map((locale) => (
				<TabsContent key={locale} value={locale} className="grid gap-3 pt-3">
					{children(locale)}
				</TabsContent>
			))}
		</Tabs>
	);
}
