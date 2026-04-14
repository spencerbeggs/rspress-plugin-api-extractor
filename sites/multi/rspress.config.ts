import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "Multi-API Portal Test",
	outDir: "dist",
	llms: true,
	themeConfig: {
		llmsUI: {
			viewOptions: ["markdownLink", "chatgpt", "claude"],
			placement: "title",
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "info",
			apis: [
				{
					packageName: "kitchensink",
					model: path.join(__dirname, "lib/models/kitchensink/kitchensink.api.json"),
					packageJson: path.join(__dirname, "lib/models/kitchensink/package.json"),
					tsconfig: path.join(__dirname, "lib/models/kitchensink/tsconfig.json"),
					theme: { light: "github-light-default", dark: "github-dark-default" },
				},
				{
					packageName: "versioned-module",
					baseRoute: "/versioned",
					model: path.join(__dirname, "lib/models/versioned-v1/versioned-v1.api.json"),
					packageJson: path.join(__dirname, "lib/models/versioned-v1/package.json"),
					theme: { light: "github-light-default", dark: "github-dark-default" },
				},
			],
		}),
	],
	route: { cleanUrls: true },
});
