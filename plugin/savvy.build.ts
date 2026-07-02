import { build } from "@savvy-web/rspress-builder";

await build({
	runtime: true,
	dtsBundledPackages: ["@rspress/core", "@type/mdast", "@type/unist"],
	apiModel: {
		tsdoc: {
			suppressWarnings: [
				{ messageId: "ae-forgotten-export", pattern: "_base" },
				// The config helpers are exposed only via the `ApiExtractorPlugin.api`
				// namespace (not as named top-level exports), so their declarations are
				// referenced by the public type but intentionally not re-exported.
				{ messageId: "ae-forgotten-export", pattern: "ApiExtractorPluginImpl|fromDir|fromParentDir" },
			],
		},
	},
});
