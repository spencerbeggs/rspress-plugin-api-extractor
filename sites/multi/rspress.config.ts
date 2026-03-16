import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "Multi-API Portal Test",
	outDir: "dist",
	builderConfig: {
		source: {
			define: { "import.meta.env": "import.meta.env" },
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "debug",
			apis: [
				{
					packageName: "kitchensink",
					model: path.join(__dirname, "../../modules/kitchensink/dist/npm/kitchensink.api.json"),
					packageJson: path.join(__dirname, "../../modules/kitchensink/dist/npm/package.json"),
					tsconfig: path.join(__dirname, "../../modules/kitchensink/tsconfig.json"),
					theme: { light: "github-light-default", dark: "github-dark-default" },
				},
				{
					packageName: "versioned-module",
					baseRoute: "/versioned",
					model: path.join(__dirname, "../../modules/versioned-v1/dist/npm/versioned-v1.api.json"),
					packageJson: path.join(__dirname, "../../modules/versioned-v1/dist/npm/package.json"),
					theme: { light: "github-light-default", dark: "github-dark-default" },
				},
			],
		}),
	],
	route: { cleanUrls: true },
});
