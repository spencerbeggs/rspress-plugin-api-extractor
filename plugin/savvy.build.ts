import { definePlugin, runBuild } from "@savvy-web/rspress-builder";

const config = definePlugin({
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
	transform({ pkg, targetGroup }) {
		if (targetGroup.id === "github") {
			(pkg as { name?: string }).name = "@spencerbeggs/rspress-plugin-api-extractor";
		}
		const p = pkg as Record<string, unknown>;
		delete p.devDependencies;
		delete p.bundleDependencies;
		delete p.scripts;
		delete p.publishConfig;
		delete p.packageManager;
		delete p.devEngines;
		return pkg;
	},
});

export default config;

if (import.meta.main) {
	await runBuild(config, { cwd: import.meta.dirname, argv: process.argv.slice(2) });
}
