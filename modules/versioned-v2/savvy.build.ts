import { build } from "@savvy-web/bundler";

await build({
	meta: {
		localPaths: ["../../sites/versioned/lib/models/v2"],
	},
	transform({ pkg }) {
		pkg.name = "@modules/versioned";
		delete pkg.devDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		return pkg;
	},
});
