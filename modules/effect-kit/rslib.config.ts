import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	apiModel: {
		localPaths: ["../../sites/effect/lib/models/effect-kit"],
		// Effect's Schema.TaggedError class expression leaks an internal
		// `<Name>_base` symbol into the .d.ts. forgottenExports defaults to
		// "error" under CI, so suppress these intentional internal symbols.
		suppressWarnings: [{ messageId: "ae-forgotten-export", pattern: "_base" }],
	},
	transform({ pkg }) {
		delete pkg.devDependencies;
		delete pkg.scripts;
		delete pkg.publishConfig;
		return pkg;
	},
});
