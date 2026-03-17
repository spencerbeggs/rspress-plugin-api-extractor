import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import type { CrossLinkData } from "./build-stages.js";
import { buildPipelineForApi, cleanupAndCommit, prepareWorkItems, writeMetadata } from "./build-stages.js";
import { ApiParser } from "./loader.js";
import { markdownCrossLinker } from "./markdown/index.js";
import type { ResolvedApiConfig, ResolvedBuildContext } from "./services/ConfigService.js";
import { SnapshotService } from "./services/SnapshotService.js";
import { TwoslashManager } from "./twoslash-transformer.js";
import type { VfsConfig } from "./vfs-registry.js";
import { VfsRegistry } from "./vfs-registry.js";

/**
 * Generate markdown documentation for a single API as a native Effect program.
 *
 * Orchestrates the 5 build stages:
 * 1. prepareWorkItems — categorize items, build cross-link data, flatten work items
 * 2. generatePages — generate page content, hash, resolve timestamps
 * 3. writeFiles — write changed files to disk
 * 4. writeMetadata — write root _meta.json, main index, category _meta.json files
 * 5. cleanupAndCommit — batch upsert snapshots, delete stale/orphan files
 *
 * Returns the CrossLinkData for this API so callers can merge cross-link data
 * across multiple APIs.
 */
export function generateApiDocs(
	apiConfig: ResolvedApiConfig & { suppressExampleErrors?: boolean },
	buildContext: ResolvedBuildContext,
	fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
): Effect.Effect<CrossLinkData, never, FileSystem.FileSystem | SnapshotService> {
	return Effect.gen(function* () {
		const fileSystem = yield* FileSystem.FileSystem;
		const snapshotSvc = yield* SnapshotService;

		const {
			apiPackage,
			packageName,
			apiName,
			outputDir,
			baseRoute,
			categories,
			source,
			packageJson,
			llmsPlugin,
			siteUrl,
			ogImage,
		} = apiConfig;
		const suppressExampleErrors = apiConfig.suppressExampleErrors ?? true;

		const {
			shikiCrossLinker,
			highlighter,
			hideCutTransformer,
			hideCutLinesTransformer,
			twoslashTransformer,
			ogResolver,
			pageConcurrency,
		} = buildContext;

		const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
		const buildTime = new Date().toISOString();

		// Load existing snapshots from database for this outputDir
		const allSnapshots = yield* snapshotSvc.getAllForDirectory(resolvedOutputDir).pipe(Effect.orDie);
		const existingSnapshots = new Map(allSnapshots.map((s) => [s.filePath, s]));

		// Create the output directory if it doesn't exist
		yield* fileSystem.makeDirectory(resolvedOutputDir, { recursive: true }).pipe(Effect.orDie);

		// Phase 1: Prepare work items and cross-link data (sync, pure)
		const { workItems, crossLinkData } = prepareWorkItems({
			apiPackage,
			categories,
			baseRoute,
			packageName,
		});

		// Initialize cross-linkers with the prepared data
		markdownCrossLinker.initialize(ApiParser.categorizeApiItems(apiPackage, categories), baseRoute, categories);
		// API scope is derived from baseRoute to match file path inference in remark plugins
		// e.g., baseRoute "/example-module" -> scope "example-module"
		// When baseRoute is "/" (single-API mode), fall back to packageName to ensure a non-empty scope
		const apiScope = baseRoute.replace(/^\//, "").split("/")[0] || packageName;
		shikiCrossLinker.reinitialize(crossLinkData.routes, crossLinkData.kinds, apiScope);
		TwoslashManager.addTypeRoutes(crossLinkData.routes);

		// Register VFS config for the remark plugin
		if (highlighter) {
			const vfsConfig: VfsConfig = {
				vfs: new Map(),
				highlighter,
				crossLinker: shikiCrossLinker,
				packageName,
				apiScope,
			};
			if (twoslashTransformer != null) vfsConfig.twoslashTransformer = twoslashTransformer;
			if (hideCutTransformer != null) vfsConfig.hideCutTransformer = hideCutTransformer;
			if (hideCutLinesTransformer != null) vfsConfig.hideCutLinesTransformer = hideCutLinesTransformer;
			if (apiConfig.theme != null) vfsConfig.theme = apiConfig.theme;
			VfsRegistry.register(apiScope, vfsConfig);
		}

		// Phase 2+3: Generate pages and write files via Stream pipeline
		yield* Effect.logInfo(
			`Generating ${workItems.length} pages across ${Object.keys(categories).length} categories in parallel`,
		);

		const fileResults = yield* buildPipelineForApi({
			workItems,
			baseRoute,
			packageName,
			apiScope,
			...(apiName != null ? { apiName } : {}),
			...(source != null ? { source } : {}),
			buildTime,
			resolvedOutputDir,
			pageConcurrency,
			existingSnapshots,
			...(suppressExampleErrors != null ? { suppressExampleErrors } : {}),
			...(llmsPlugin != null ? { llmsPlugin } : {}),
			...(ogResolver !== undefined ? { ogResolver } : {}),
			...(siteUrl != null ? { siteUrl } : {}),
			...(ogImage != null ? { ogImage } : {}),
		});

		const changedAfterPipeline = fileResults.filter((r) => r.status !== "unchanged").length;
		yield* Effect.logInfo(`Generated ${changedAfterPipeline} pages`);

		// Track generated files and file context
		const generatedFiles = new Set<string>();
		for (const r of fileResults) {
			generatedFiles.add(r.relativePathWithExt);
			const ctx: { api?: string; version?: string; file: string } = {
				file: r.relativePathWithExt,
			};
			if (apiName != null) ctx.api = apiName;
			if (packageJson?.version != null) ctx.version = packageJson.version;
			fileContextMap.set(r.absolutePath, ctx);
		}

		// Phase 4: Write metadata (root _meta.json, main index, category _meta.json)
		yield* writeMetadata({
			fileResults,
			categories,
			resolvedOutputDir,
			existingSnapshots,
			buildTime,
			baseRoute,
			packageName,
			...(apiName != null ? { apiName } : {}),
			generatedFiles,
		});

		// Phase 5: Cleanup and commit snapshots
		yield* cleanupAndCommit({
			fileResults,
			resolvedOutputDir,
			generatedFiles,
		});

		const changedCount = fileResults.filter((r) => r.status !== "unchanged").length;
		yield* Effect.logInfo(`Generated ${changedCount} API documentation files for ${packageName}`);

		return crossLinkData;
	});
}
