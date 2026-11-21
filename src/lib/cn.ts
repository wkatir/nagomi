import { createCn } from "cn/config";

// Every `import { cn } from "cn"` resolves here (tsconfig paths), shadcn components
// included, so a `type-*` utility of styles.css and a component's Tailwind text class
// (`text-lg` on a sheet title) replace each other; otherwise both reach the element and the
// order of the generated CSS decides.
const textSizes = ["lead", "body", "small", "meta", "ui"];
const headings = ["display", "h1", "h2", "h3", "title", "stat"];
// The --spacing-* names of styles.css, so `p-admin-card` and a component's `p-0` replace
// each other.
const spacing = [
	"section",
	"section-sm",
	"admin-page",
	"admin-section",
	"admin-stack",
	"admin-card",
	"admin-header",
];

export const cn = createCn({
	extend: {
		theme: { spacing },
		classGroups: {
			"font-size": [{ type: textSizes }],
			"type-heading": [{ type: headings }],
		},
		// A heading also sets the line height, the tracking and the weight.
		conflictingClassGroups: {
			"type-heading": ["font-size", "leading", "tracking", "font-weight"],
		},
	},
});
