import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { NodeFileSystem } from "@effect/platform-node";
import { Effect, Layer, LogLevel, Logger } from "effect";
import { createHighlighter } from "shiki";
import { describe, expect, it } from "vitest";
import { generateApiDocs } from "../src/build-program.js";
import { CategoryResolver } from "../src/category-resolver.js";
import { ApiModelLoader } from "../src/model-loader.js";
import { DEFAULT_CATEGORIES } from "../src/schemas/index.js";
import type { ResolvedApiConfig, ResolvedBuildContext } from "../src/services/ConfigService.js";
import { ShikiCrossLinker } from "../src/shiki-transformer.js";
import { MockSnapshotServiceLayer } from "./utils/layers.js";

describe("generateApiDocs (Effect program)", () => {
	it("generates docs for fixture model and populates crossLinkData + fileContextMap", async () => {
		const modelPath = path.join(import.meta.dirname, "../src/__fixtures__/example-module/example-module.api.json");
		const { apiPackage } = await ApiModelLoader.loadApiModel(modelPath);
		const resolver = new CategoryResolver();
		const categories = resolver.mergeCategories(DEFAULT_CATEGORIES, undefined);

		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "build-program-"));

		const highlighter = await createHighlighter({
			themes: ["github-light-default", "github-dark-default"],
			langs: ["typescript"],
		});

		const apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean } = {
			apiPackage,
			packageName: "example-module",
			outputDir: tmpDir,
			baseRoute: "/example-module",
			categories,
			suppressExampleErrors: true,
		};

		const buildContext: ResolvedBuildContext = {
			apiConfigs: [apiConfig],
			combinedVfs: new Map(),
			highlighter,
			tsEnvCache: new Map(),
			resolvedCompilerOptions: {},
			ogResolver: null,
			shikiCrossLinker: new ShikiCrossLinker(),
			hideCutTransformer: { name: "mock-hide-cut" },
			hideCutLinesTransformer: { name: "mock-hide-cut-lines" },
			twoslashTransformer: undefined,
			pageConcurrency: 2,
			logLevel: "info" as const,
			suppressExampleErrors: true,
		};

		const fileContextMap = new Map<string, { api?: string; version?: string; file: string }>();

		const program = generateApiDocs(apiConfig, buildContext, fileContextMap);
		const testLayer = Layer.mergeAll(
			NodeFileSystem.layer,
			MockSnapshotServiceLayer,
			Logger.minimumLogLevel(LogLevel.None),
		);
		const crossLinkData = await Effect.runPromise(program.pipe(Effect.provide(testLayer)));

		// Cross-link data should be populated
		expect(crossLinkData.routes.size).toBeGreaterThan(0);
		expect(crossLinkData.kinds.size).toBeGreaterThan(0);

		// File context map should have entries for generated files
		expect(fileContextMap.size).toBeGreaterThan(0);
		for (const [absPath, ctx] of fileContextMap) {
			expect(path.isAbsolute(absPath)).toBe(true);
			expect(ctx.file).toBeTruthy();
		}

		// Output directory should contain generated files
		const outputFiles = await fs.promises.readdir(tmpDir, { recursive: true });
		const mdxFiles = outputFiles.filter((f) => typeof f === "string" && f.endsWith(".mdx"));
		expect(mdxFiles.length).toBeGreaterThan(0);

		// Cleanup
		highlighter.dispose();
		await fs.promises.rm(tmpDir, { recursive: true });
	}, 30_000);
});
