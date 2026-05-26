import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "Effect Multi-Entry Test",
	outDir: "dist",
	builderConfig: {
		source: {
			define: {
				"import.meta.env": "import.meta.env",
			},
		},
	},
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
			apis: [
				ApiExtractorPlugin.api.fromFolder("lib/models/effect-kit", {
					cwd: __dirname,
					name: "Effect Kit",
					baseRoute: "/api",
					apiFolder: "api",
					theme: {
						light: "github-light-default",
						dark: "github-dark-default",
					},
				}),
			],
		}),
	],
	route: {
		cleanUrls: true,
	},
});
