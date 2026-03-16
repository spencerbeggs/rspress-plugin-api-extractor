import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	apiModel: {
		localPaths: [
			"../../sites/basic/lib/models/kitchensink",
			"../../sites/i18n/lib/models/kitchensink",
			"../../sites/multi/lib/models/kitchensink",
		],
	},
	transform({ pkg }) {
		delete pkg.devDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		return pkg;
	},
});
