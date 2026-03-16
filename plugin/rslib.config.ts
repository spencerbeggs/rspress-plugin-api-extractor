import { pluginReact } from "@rsbuild/plugin-react";
import { defineConfig, rspack } from "@rslib/core";

export default defineConfig({
	lib: [
		// Frontend runtime components (React/browser code)
		{
			dts: {
				bundle: true,
				tsgo: true,
				distPath: "./dist/runtime",
			},
			source: {
				entry: {
					index: "./src/runtime/index.tsx",
				},
				// Preserve import.meta.env so RSPress can replace it at website build time
				define: {
					"import.meta.env": "import.meta.env",
				},
			},
			tools: {
				rspack: {
					plugins: [
						new rspack.BannerPlugin({
							banner: 'import "./index.css";',
							raw: true,
							include: /index\.js$/,
						}),
					],
				},
			},
			bundle: true,
			format: "esm",
			experiments: {
				advancedEsm: true,
			},
			plugins: [pluginReact()],
			output: {
				distPath: {
					root: "./dist/runtime",
				},
				externals: [
					"@theme",
					"react",
					"@types/react",
					"react/jsx-runtime",
					"react/jsx-dev-runtime",
					"@rspress/core",
					"@rspress/plugin-llms",
					"@rspress/plugin-llms/runtime",
				],
				target: "web",
				cssModules: {
					// Use default export to match RSPress CSS module configuration
					namedExport: false,
					exportLocalsConvention: "camelCaseOnly",
				},
			},
		},
		// Node.js plugin code (server-side logic)
		{
			dts: {
				bundle: true,
				tsgo: true,
			},
			source: {
				entry: {
					index: "./src/index.ts",
				},
				// Preserve import.meta.env so RSPress can replace it at website build time
				define: {
					"import.meta.env": "import.meta.env",
				},
			},
			format: "esm",
			experiments: {
				advancedEsm: true,
			},
			syntax: "esnext",
			bundle: true, // Bundle Node.js plugin into single file
			output: {
				externals: [
					// External dependencies that should not be bundled
					"@microsoft/api-extractor-model",
					"@microsoft/tsdoc",
					"@rspress/core",
					"@shikijs/twoslash",
					"@typescript/ata",
					"type-registry-effect",
					"typescript",
					"shiki",
					"unified",
					"unist-util-visit",
					"mdast-util-mdx-jsx",
				],
			},
		},
	],
});
