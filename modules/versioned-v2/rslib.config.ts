import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	apiModel: {
		localPaths: ["../../sites/versioned/lib/models/versioned-v2"],
	},
	transform({ pkg }) {
		pkg.name = "versioned-module";
		delete pkg.devDependencies;
		delete pkg.scripts;
		return pkg;
	},
});
