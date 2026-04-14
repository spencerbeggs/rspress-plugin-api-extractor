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
			api: {
				name: "Kitchen Sink",
				packageName: "kitchensink",
				model: path.join(__dirname, "lib/models/kitchensink/kitchensink.api.json"),
				packageJson: path.join(__dirname, "lib/models/kitchensink/package.json"),
				tsconfig: path.join(__dirname, "lib/models/kitchensink/tsconfig.json"),
				apiFolder: "api",
				theme: {
					light: "github-light-default",
					dark: "github-dark-default",
				},
			},
		}),
	],
	route: {
		cleanUrls: true,
	},
});
