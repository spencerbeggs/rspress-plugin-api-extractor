import { defineBuild, runBuild } from "@savvy-web/bundler";

const config = defineBuild({
	meta: {
		localPaths: [
			"../../sites/basic/lib/models/kitchensink",
			"../../sites/i18n/lib/models/kitchensink",
			"../../sites/multi/lib/models/kitchensink",
		],
	},
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
