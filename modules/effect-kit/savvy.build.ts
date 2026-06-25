import { defineBuild, runBuild } from "@savvy-web/bundler";

const config = defineBuild({
	meta: {
		localPaths: ["../../sites/effect/lib/models/effect-kit", "../../sites/multi/lib/models/effect-kit"],
		tsdoc: {
			suppressWarnings: [{ messageId: "ae-forgotten-export", pattern: "_base" }],
			tagDefinitions: [{ tagName: "@since", syntaxKind: "block" }],
		},
	},
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
