import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "i18n API Test",
	outDir: "dist",
	lang: "en",
	locales: [
		{ lang: "en", label: "English" },
		{ lang: "zh", label: "中文" },
	],
	builderConfig: {
		source: {
			define: { "import.meta.env": "import.meta.env" },
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "debug",
			api: {
				packageName: "kitchensink",
				model: path.join(__dirname, "../../modules/kitchensink/dist/npm/kitchensink.api.json"),
				packageJson: path.join(__dirname, "../../modules/kitchensink/dist/npm/package.json"),
				tsconfig: path.join(__dirname, "../../modules/kitchensink/tsconfig.json"),
				theme: { light: "github-light-default", dark: "github-dark-default" },
			},
		}),
	],
	route: { cleanUrls: true },
});
