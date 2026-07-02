import { build } from "@savvy-web/bundler";

await build({
	meta: {
		localPaths: [
			"../../sites/basic/lib/models/kitchensink",
			"../../sites/i18n/lib/models/kitchensink",
			"../../sites/multi/lib/models/kitchensink",
		],
	},
});
