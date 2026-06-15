import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
	root: "docs",
	title: "Versioned API Test",
	outDir: "dist",
	llms: true,
	themeConfig: {
		llmsUI: {
			viewOptions: ["markdownLink", "chatgpt", "claude"],
			placement: "outline",
		},
	},
	multiVersion: {
		default: "v2",
		versions: ["v1", "v2"],
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "info",
			api: {
				packageName: "versioned-module",
				versions: {
					v1: ApiExtractorPlugin.api.fromDir("./lib/models/v1"),
					v2: ApiExtractorPlugin.api.fromDir("./lib/models/v2"),
				},
			},
		}),
	],
	route: { cleanUrls: true },
});
