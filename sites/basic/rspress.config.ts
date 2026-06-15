import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

export default defineConfig({
	root: "docs",
	title: "API Extractor Plugin Test",
	outDir: "dist",
	llms: true,
	themeConfig: {
		llmsUI: {
			viewOptions: ["markdownLink", "chatgpt", "claude"],
			placement: "outline",
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "info",
			api: ApiExtractorPlugin.api.fromDir("./lib/models/kitchensink"),
		}),
	],
	route: {
		cleanUrls: true,
	},
});
