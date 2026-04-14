/**
 * Effect program for post-processing LLMs text files in afterBuild.
 *
 * Wires the pure processing functions from llms-processing.ts into the
 * plugin lifecycle, handling file I/O via \@effect/platform FileSystem.
 *
 * Responsibilities:
 * 1. Collect all API routes from build results
 * 2. Post-process global llms.txt (filter API entries, append pointers)
 * 3. Post-process global llms-full.txt (remove API sections)
 * 4. Generate per-package files (llms.txt, llms-full.txt, llms-docs.txt, llms-api.txt)
 */
import path from "node:path";
import { FileSystem } from "@effect/platform";
import { Effect } from "effect";
import type { GenerateApiDocsResult } from "./build-program.js";
import type { LlmsTxtEntry, PackagePointer, PackageScopeInfo } from "./llms-processing.js";
import {
	filterLlmsFullTxt,
	filterLlmsTxt,
	generatePackageLlmsFullTxt,
	generatePackageLlmsTxt,
	generateStructuredLlmsTxt,
	parseLlmsTxtLine,
} from "./llms-processing.js";
import type { LlmsPlugin } from "./schemas/index.js";

/**
 * Input for the processLlmsFiles Effect program.
 */
export interface ProcessLlmsFilesInput {
	/** Absolute path to the site output directory (e.g., resolved dist/) */
	readonly outDir: string;
	/** Build results from each API config's generateApiDocs call */
	readonly buildResults: ReadonlyArray<GenerateApiDocsResult>;
	/** Merged LLMs plugin configuration */
	readonly llmsPlugin: LlmsPlugin;
	/** Map of packageName to package-level route (without apiFolder, e.g., "/kitchensink") */
	readonly packageRoutes: ReadonlyMap<string, string>;
}

/**
 * Convert generated file relative paths to route URLs for matching against llms.txt entries.
 *
 * The generatedFiles Set stores paths relative to the output dir, like "class/pipeline.mdx".
 * The llms.txt entries have URLs like "/api/class/pipeline", so we:
 * - Replace .mdx extension with .md (RSPress llms.txt URLs use .md extension)
 * - Prepend the baseRoute (e.g., "/api/")
 * - Normalize trailing slashes
 */
function buildApiRoutes(buildResults: ReadonlyArray<GenerateApiDocsResult>): Set<string> {
	const apiRoutes = new Set<string>();

	for (const result of buildResults) {
		const base = result.baseRoute.endsWith("/") ? result.baseRoute : `${result.baseRoute}/`;

		for (const relPath of result.generatedFiles) {
			if (!relPath.endsWith(".mdx")) continue;
			// Convert "class/pipeline.mdx" -> "/api/class/pipeline.md"
			const mdPath = relPath.replace(/\.mdx$/, ".md");
			const routeUrl = `${base}${mdPath}`;
			apiRoutes.add(routeUrl);
		}
	}

	return apiRoutes;
}

/**
 * Discover version/locale prefixes from build results' base routes.
 *
 * RSPress generates global llms files at version/locale prefixed paths:
 * - dist/llms.txt (default)
 * - dist/v1/llms.txt (versioned)
 * - dist/zh/llms.txt (i18n)
 *
 * We examine the base routes to extract prefixes. Base routes like:
 * - "/api" results in prefix ""
 * - "/v1/api" results in prefix "v1"
 * - "/zh/api" results in prefix "zh"
 *
 * Returns unique prefixes including "" (root) which always exists.
 */
function discoverPrefixes(buildResults: ReadonlyArray<GenerateApiDocsResult>): Set<string> {
	const prefixes = new Set<string>();
	// Always include root prefix (RSPress always generates root llms.txt)
	prefixes.add("");

	for (const result of buildResults) {
		// baseRoute looks like "/api", "/v1/api", "/zh/api"
		const segments = result.baseRoute.split("/").filter(Boolean);
		// If more than 1 segment, the first segment(s) before the last are the prefix
		// e.g., "/v1/api" -> segments ["v1", "api"] -> prefix "v1"
		// e.g., "/api" -> segments ["api"] -> prefix ""
		if (segments.length > 1) {
			// Take all segments except the last (which is the API folder name)
			const prefixSegments = segments.slice(0, -1);
			prefixes.add(prefixSegments.join("/"));
		}
	}

	return prefixes;
}

/**
 * Build package pointers for a given prefix context.
 *
 * Each build result produces a per-package llms.txt file. The pointer
 * URL is relative to the site root and includes any prefix.
 */
function buildPackagePointers(
	buildResults: ReadonlyArray<GenerateApiDocsResult>,
	prefix: string,
	packageRoutes: ReadonlyMap<string, string>,
): PackagePointer[] {
	const pointers: PackagePointer[] = [];

	for (const result of buildResults) {
		// For versioned/locale prefixes, only include results under that prefix
		if (prefix !== "" && !result.baseRoute.startsWith(`/${prefix}/`)) {
			continue;
		}

		const displayName = result.apiName ?? result.packageName;
		const pkgRoute = packageRoutes.get(result.packageName) ?? result.baseRoute;
		const base = pkgRoute.endsWith("/") ? pkgRoute : `${pkgRoute}/`;
		pointers.push({
			name: displayName,
			llmsTxtUrl: `${base}llms.txt`,
		});
	}

	return pointers;
}

/**
 * Collect API page entries from the global llms.txt for a specific package.
 *
 * Parses the global llms.txt to find entries whose URLs match this package's
 * generated API routes, building the LlmsTxtEntry array for per-package files.
 */
function collectApiEntries(globalLlmsTxtContent: string, result: GenerateApiDocsResult): LlmsTxtEntry[] {
	const base = result.baseRoute.endsWith("/") ? result.baseRoute : `${result.baseRoute}/`;
	const entries: LlmsTxtEntry[] = [];

	for (const line of globalLlmsTxtContent.split("\n")) {
		const entry = parseLlmsTxtLine(line);
		if (!entry) {
			continue;
		}
		// Check if this entry's URL is under this package's base route
		if (entry.url.startsWith(base)) {
			entries.push(entry);
		}
	}

	return entries;
}

/**
 * Collect guide page entries from the global llms.txt that are NOT API pages.
 *
 * Guide pages are entries in the global llms.txt that are under the package's
 * route but not in the API routes set. Uses packageRoute (e.g., "/kitchensink")
 * instead of prefix to avoid matching entries from other packages.
 */
function collectGuideEntries(
	globalLlmsTxtContent: string,
	apiRoutes: Set<string>,
	packageRoute: string,
): LlmsTxtEntry[] {
	const base = packageRoute.endsWith("/") ? packageRoute : `${packageRoute}/`;
	const entries: LlmsTxtEntry[] = [];

	for (const line of globalLlmsTxtContent.split("\n")) {
		const entry = parseLlmsTxtLine(line);
		if (!entry) {
			continue;
		}
		// Include entries under this package's route that are NOT API routes
		if ((entry.url === packageRoute || entry.url.startsWith(base)) && !apiRoutes.has(entry.url)) {
			entries.push(entry);
		}
	}

	return entries;
}

/**
 * Extract page content sections from llms-full.txt that match a URL predicate.
 *
 * Sections are delimited by `---\nurl: {path}\n---` frontmatter blocks.
 * Returns content (without frontmatter) for sections whose URL satisfies the predicate.
 */
function extractSections(
	globalLlmsFullContent: string,
	urlPredicate: (url: string) => boolean,
): Array<{ url: string; content: string }> {
	const pages: Array<{ url: string; content: string }> = [];
	if (!globalLlmsFullContent) {
		return pages;
	}

	const frontmatterPattern = /^---\nurl:\s*(.+)\n---$/gm;
	let match = frontmatterPattern.exec(globalLlmsFullContent);
	const boundaries: Array<{ url: string; start: number; fmEnd: number }> = [];

	while (match !== null) {
		boundaries.push({
			url: match[1].trim(),
			start: match.index,
			fmEnd: match.index + match[0].length,
		});
		match = frontmatterPattern.exec(globalLlmsFullContent);
	}

	for (let i = 0; i < boundaries.length; i++) {
		const boundary = boundaries[i];
		if (!urlPredicate(boundary.url)) {
			continue;
		}
		const nextStart = i + 1 < boundaries.length ? boundaries[i + 1].start : globalLlmsFullContent.length;
		const content = globalLlmsFullContent.slice(boundary.fmEnd, nextStart).trim();
		pages.push({ url: boundary.url, content });
	}

	return pages;
}

/**
 * Read llms-full.txt sections and collect page content for API pages.
 *
 * Parses the global llms-full.txt to extract full markdown content for
 * pages matching this package's API routes.
 */
function collectApiPageContent(
	globalLlmsFullContent: string,
	result: GenerateApiDocsResult,
): Array<{ url: string; content: string }> {
	const base = result.baseRoute.endsWith("/") ? result.baseRoute : `${result.baseRoute}/`;
	return extractSections(globalLlmsFullContent, (url) => url.startsWith(base));
}

/**
 * Process LLMs text files after the RSPress build.
 *
 * This Effect program:
 * 1. Builds the set of all API route URLs from build results
 * 2. Discovers version/locale prefixes from base routes
 * 3. For each prefix, post-processes global llms.txt and llms-full.txt
 * 4. When scopes is enabled, generates per-package LLMs files
 *
 * Requires FileSystem from \@effect/platform.
 */
export function processLlmsFiles(input: ProcessLlmsFilesInput): Effect.Effect<void, never, FileSystem.FileSystem> {
	return Effect.gen(function* () {
		const fs = yield* FileSystem.FileSystem;
		const { outDir, buildResults, llmsPlugin, packageRoutes } = input;

		if (buildResults.length === 0) {
			return;
		}

		// Step 1: Build the set of all API route URLs
		const apiRoutes = buildApiRoutes(buildResults);
		yield* Effect.logDebug(`Built ${apiRoutes.size} API routes for LLMs filtering`);

		if (apiRoutes.size === 0) {
			return;
		}

		// Step 2: Discover version/locale prefixes
		const prefixes = discoverPrefixes(buildResults);

		// Step 3: Process each prefix's global files
		yield* Effect.forEach(
			[...prefixes],
			(prefix) => processPrefix(fs, outDir, prefix, buildResults, apiRoutes, llmsPlugin, packageRoutes),
			{ concurrency: "unbounded" },
		);
	});
}

/**
 * Process global and per-package LLMs files for a single prefix.
 */
function processPrefix(
	fs: FileSystem.FileSystem,
	outDir: string,
	prefix: string,
	buildResults: ReadonlyArray<GenerateApiDocsResult>,
	apiRoutes: Set<string>,
	llmsPlugin: LlmsPlugin,
	packageRoutes: ReadonlyMap<string, string>,
): Effect.Effect<void> {
	return Effect.gen(function* () {
		const prefixDir = prefix ? path.join(outDir, prefix) : outDir;

		// Read global llms.txt
		const llmsTxtPath = path.join(prefixDir, "llms.txt");
		const llmsTxtExists = yield* fs.exists(llmsTxtPath).pipe(Effect.orElseSucceed(() => false));
		if (!llmsTxtExists) {
			return;
		}
		const llmsTxtContent = yield* fs.readFileString(llmsTxtPath).pipe(Effect.orDie);

		// Read global llms-full.txt
		const llmsFullTxtPath = path.join(prefixDir, "llms-full.txt");
		const llmsFullTxtExists = yield* fs.exists(llmsFullTxtPath).pipe(Effect.orElseSucceed(() => false));
		const llmsFullTxtContent = llmsFullTxtExists ? yield* fs.readFileString(llmsFullTxtPath).pipe(Effect.orDie) : "";

		// Restructure global llms.txt with package sections
		if (llmsPlugin.scopes) {
			// Build package scope info for structured output
			const packageScopes: PackageScopeInfo[] = buildResults.map((r) => {
				const pkgRoute = packageRoutes.get(r.packageName) ?? r.baseRoute;
				return {
					name: r.apiName ?? r.packageName,
					packageName: r.packageName,
					version: r.packageVersion,
					description: r.packageDescription,
					packageRoute: pkgRoute,
					llmsApiTxtUrl: `${pkgRoute.endsWith("/") ? pkgRoute : `${pkgRoute}/`}llms-api.txt`,
				};
			});
			const structuredLlmsTxt = generateStructuredLlmsTxt(llmsTxtContent, apiRoutes, packageScopes);
			yield* fs.writeFileString(llmsTxtPath, structuredLlmsTxt).pipe(Effect.orDie);
		} else {
			// Simple filtering: just remove API entries, append pointers
			const pointers = buildPackagePointers(buildResults, prefix, packageRoutes);
			const filteredLlmsTxt = filterLlmsTxt(llmsTxtContent, apiRoutes, pointers);
			yield* fs.writeFileString(llmsTxtPath, filteredLlmsTxt).pipe(Effect.orDie);
		}

		// Filter global llms-full.txt: remove API sections
		if (llmsFullTxtContent) {
			const filteredLlmsFullTxt = filterLlmsFullTxt(llmsFullTxtContent, apiRoutes);
			yield* fs.writeFileString(llmsFullTxtPath, filteredLlmsFullTxt).pipe(Effect.orDie);
		}

		// Step 4: Generate per-package files when scopes is enabled
		if (llmsPlugin.scopes) {
			// For root prefix, include all results (multi-API sites have multi-segment
			// routes like /kitchensink/api but still belong to the root prefix).
			// For versioned/locale prefixes, only include results under that prefix.
			const prefixResults =
				prefix === "" ? [...buildResults] : buildResults.filter((r) => r.baseRoute.startsWith(`/${prefix}/`));
			yield* Effect.forEach(
				prefixResults,
				(result) =>
					generatePerPackageFiles(
						fs,
						outDir,
						result,
						llmsTxtContent,
						llmsFullTxtContent,
						apiRoutes,
						llmsPlugin,
						packageRoutes.get(result.packageName) ?? result.baseRoute,
					),
				{ concurrency: "unbounded" },
			);
		}
	});
}

/**
 * Generate per-package LLMs files (llms.txt, llms-full.txt, llms-docs.txt, llms-api.txt).
 */
function generatePerPackageFiles(
	fs: FileSystem.FileSystem,
	outDir: string,
	result: GenerateApiDocsResult,
	globalLlmsTxtContent: string,
	globalLlmsFullContent: string,
	apiRoutes: Set<string>,
	llmsPlugin: LlmsPlugin,
	packageRoute: string,
): Effect.Effect<void> {
	return Effect.gen(function* () {
		// Write llms files at the package scope level (e.g., dist/kitchensink/),
		// not the API route level (e.g., dist/kitchensink/api/).
		const pkgRouteSegment = packageRoute.replace(/^\//, "");
		const packageLlmsDir = pkgRouteSegment ? path.join(outDir, pkgRouteSegment) : outDir;
		yield* fs.makeDirectory(packageLlmsDir, { recursive: true }).pipe(Effect.orDie);

		const displayName = result.apiName ?? result.packageName;

		// Collect API page entries from global llms.txt
		const apiEntries = collectApiEntries(globalLlmsTxtContent, result);

		// Collect guide page entries (non-API entries under this package's route)
		const guideEntries = collectGuideEntries(globalLlmsTxtContent, apiRoutes, packageRoute);

		// Generate per-package llms.txt
		const packageLlmsTxt = generatePackageLlmsTxt({
			name: displayName,
			packageName: result.packageName,
			guidePages: guideEntries,
			apiPages: apiEntries,
		});
		yield* fs.writeFileString(path.join(packageLlmsDir, "llms.txt"), packageLlmsTxt).pipe(Effect.orDie);

		// Collect full page content for API pages from global llms-full.txt
		const apiPageContent = collectApiPageContent(globalLlmsFullContent, result);

		// Collect full page content for guide pages from global llms-full.txt
		const guideRouteUrls = new Set(guideEntries.map((e) => e.url));
		const guidePageContent = globalLlmsFullContent
			? extractSections(globalLlmsFullContent, (url) => guideRouteUrls.has(url))
			: [];

		// Generate per-package llms-full.txt (guides + API combined)
		const fullPageContent = [...guidePageContent, ...apiPageContent];
		if (fullPageContent.length > 0) {
			const packageLlmsFullTxt = generatePackageLlmsFullTxt(fullPageContent);
			yield* fs.writeFileString(path.join(packageLlmsDir, "llms-full.txt"), packageLlmsFullTxt).pipe(Effect.orDie);
		}

		// Generate llms-api.txt (API-only content) when apiTxt is enabled
		if (llmsPlugin.apiTxt && apiPageContent.length > 0) {
			const apiTxtContent = generatePackageLlmsFullTxt(apiPageContent);
			yield* fs.writeFileString(path.join(packageLlmsDir, "llms-api.txt"), apiTxtContent).pipe(Effect.orDie);
		}

		// Generate llms-docs.txt (guide-only content)
		if (guidePageContent.length > 0) {
			const docsTxtContent = generatePackageLlmsFullTxt(guidePageContent);
			yield* fs.writeFileString(path.join(packageLlmsDir, "llms-docs.txt"), docsTxtContent).pipe(Effect.orDie);
		}

		yield* Effect.logDebug(`Generated LLMs files for ${displayName} in ${packageLlmsDir}`);
	});
}
