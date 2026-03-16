import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "Versioned API Test",
	outDir: "dist",
	multiVersion: {
		default: "v2",
		versions: ["v1", "v2"],
	},
	builderConfig: {
		source: {
			define: { "import.meta.env": "import.meta.env" },
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "info",
			api: {
				packageName: "versioned-module",
				versions: {
					v1: {
						model: path.join(__dirname, "lib/models/versioned-v1/versioned-v1.api.json"),
						packageJson: path.join(__dirname, "lib/models/versioned-v1/package.json"),
					},
					v2: {
						model: path.join(__dirname, "lib/models/versioned-v2/versioned-v2.api.json"),
						packageJson: path.join(__dirname, "lib/models/versioned-v2/package.json"),
					},
				},
				theme: { light: "github-light-default", dark: "github-dark-default" },
			},
		}),
	],
	route: { cleanUrls: true },
});
