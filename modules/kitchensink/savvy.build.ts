import { build } from "@savvy-web/bundler";

await build({
	meta: {
		localPaths: [
			"../../sites/basic/lib/models/kitchensink",
			"../../sites/i18n/lib/models/kitchensink",
			"../../sites/multi/lib/models/kitchensink",
		],
		tsdoc: {
			// Compiler-generated mixin bases (AuditedRecord_base) are intentionally
			// unexported; the docs plugin inlines them on the owning class page.
			suppressWarnings: [{ messageId: "ae-forgotten-export", pattern: "_base" }],
		},
	},
});
