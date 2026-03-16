import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "API Extractor Plugin Test",
	outDir: "dist",
	builderConfig: {
		source: {
			define: {
				"import.meta.env": "import.meta.env",
			},
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "debug",
			apis: [
				{
					name: "Example Module",
					packageName: "example-module",
					model: path.join(__dirname, "../example-module/dist/npm/example-module.api.json"),
					packageJson: path.join(__dirname, "../example-module/dist/npm/package.json"),
					tsconfig: path.join(__dirname, "../example-module/tsconfig.json"),
					docsDir: path.join(__dirname, "docs/example-module"),
					apiFolder: "api",
					baseRoute: "/example-module",
					theme: {
						light: "github-light-default",
						dark: "github-dark-default",
					},
				},
			],
		}),
	],
	route: {
		cleanUrls: true,
	},
});
