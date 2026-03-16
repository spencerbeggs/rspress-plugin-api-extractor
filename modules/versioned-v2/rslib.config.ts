import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	apiModel: true,
	transform({ pkg }) {
		pkg.name = "versioned-module";
		delete pkg.devDependencies;
		delete pkg.scripts;
		return pkg;
	},
});
