import { RSPressPluginBuilder } from "@savvy-web/rslib-builder";

export default RSPressPluginBuilder.create({
	dtsBundledPackages: ["@rspress/core"],
	apiModel: {
		suppressWarnings: [
			{ messageId: "ae-forgotten-export", pattern: "_base" },
			// The config helpers are exposed only via the `ApiExtractorPlugin.api`
			// namespace (not as named top-level exports), so their declarations are
			// referenced by the public type but intentionally not re-exported.
			{ messageId: "ae-forgotten-export", pattern: "ApiExtractorPluginImpl|fromFolder|fromModelsDir" },
		],
	},
	transform({ pkg, target }) {
		if (target?.registry === "https://npm.pkg.github.com/") {
			pkg.name = "@spencerbeggs/rspress-plugin-api-extractor";
		}
		delete pkg.devDependencies;
		delete pkg.bundleDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		delete pkg.packageManager;
		delete pkg.devEngines;
		return pkg;
	},
});
