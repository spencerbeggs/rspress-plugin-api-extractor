import { build } from "@savvy-web/bundler";

await build({
	meta: {
		localPaths: ["../../sites/effect/lib/models/effect-kit", "../../sites/multi/lib/models/effect-kit"],
		tsdoc: {
			suppressWarnings: [{ messageId: "ae-forgotten-export", pattern: "_base" }],
			tagDefinitions: [{ tagName: "@since", syntaxKind: "block" }],
		},
	},
});
