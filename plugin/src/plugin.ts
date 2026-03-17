import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type {
	ApiClass,
	ApiEntryPoint,
	ApiEnum,
	ApiFunction,
	ApiInterface,
	ApiNamespace,
	ApiPackage,
	ApiTypeAlias,
	ApiVariable,
} from "@microsoft/api-extractor-model";
import { ApiItemKind } from "@microsoft/api-extractor-model";
import type { RspressPlugin, UserConfig } from "@rspress/core";
import { Effect, Layer, ManagedRuntime, Metric } from "effect";
import matter from "gray-matter";
import type { Highlighter, ShikiTransformer } from "shiki";
import { createHighlighter } from "shiki";
import type { VirtualFileSystem } from "type-registry-effect";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import { ApiExtractedPackage } from "./api-extracted-package.js";
import { CategoryResolver } from "./category-resolver.js";
import { validatePluginOptions } from "./config-validation.js";
import { DebugLogger } from "./debug-logger.js";
import { HideCutLinesTransformer, MemberFormatTransformer } from "./hide-cut-transformer.js";
import { BuildMetrics, PluginLoggerLayer, logBuildSummary } from "./layers/ObservabilityLive.js";
import { PathDerivationServiceLive } from "./layers/PathDerivationServiceLive.js";
import type { NamespaceMember } from "./loader.js";
import { ApiParser } from "./loader.js";
import {
	ClassPageGenerator,
	EnumPageGenerator,
	FunctionPageGenerator,
	InterfacePageGenerator,
	MainIndexPageGenerator,
	NamespacePageGenerator,
	TypeAliasPageGenerator,
	VariablePageGenerator,
	markdownCrossLinker,
} from "./markdown/index.js";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import { ApiModelLoader } from "./model-loader.js";
import { OpenGraphResolver } from "./og-resolver.js";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";
import type { PerformanceManager } from "./performance-manager.js";
import { remarkApiCodeblocks } from "./remark-api-codeblocks.js";
import { remarkWithApi } from "./remark-with-api.js";
import { ShikiCrossLinker } from "./shiki-transformer.js";
import { SnapshotManager } from "./snapshot-manager.js";
import { TwoslashManager } from "./twoslash-transformer.js";
import { TypeReferenceExtractor } from "./type-reference-extractor.js";
import { TypeRegistryLoader } from "./type-registry-loader.js";
import type {
	ApiExtractorPluginOptions,
	CategoryConfig,
	ExternalPackageSpec,
	LlmsPluginOptions,
	LogLevel,
	MultiApiConfig,
	OpenGraphImageConfig,
	PackageJson,
	SingleApiConfig,
	SourceConfig,
	TypeResolutionCompilerOptions,
	VersionConfig,
} from "./types.js";
import {
	DEFAULT_CATEGORIES,
	extractAutoDetectedPackages,
	isVersionConfig,
	mergeLlmsPluginConfig,
	validateExternalPackages,
} from "./types.js";
import { resolveTypeScriptConfig } from "./typescript-config.js";
import { parallelLimit } from "./utils.js";
import { VfsRegistry } from "./vfs-registry.js";

const __filename: string = fileURLToPath(import.meta.url);
const __dirname: string = path.dirname(__filename);

/**
 * Normalize markdown spacing by removing excessive blank lines
 * - Remove extra blank lines between headings and code blocks
 * - Ensure single blank line between sections
 */
function normalizeMarkdownSpacing(content: string): string {
	return (
		content
			// Remove multiple consecutive blank lines (3+ blank lines -> 1 blank line)
			.replace(/\n\n\n+/g, "\n\n")
			// Remove blank lines between headings and code fences (3 or 4 backticks)
			.replace(/^(#{1,6}\s+.+?)\n+(?=````)/gm, "$1\n")
			// Remove blank lines after ## headings before content
			.replace(/^(#{2}\s+.+?)\n\n+/gm, "$1\n\n")
	);
}

/**
 * Default Shiki theme configuration
 */
const DEFAULT_SHIKI_THEMES: ShikiThemeConfig = {
	light: "github-light-default",
	dark: "github-dark-default",
};

/**
 * Normalize theme configuration from user input to a consistent format.
 * Accepts:
 * - undefined: uses default themes (github-light/github-dark)
 * - string: uses the same theme for both light and dark
 * - { light, dark }: uses specified themes for each mode
 * - Custom object: treated as a single theme for both modes
 *
 * Theme values can be:
 * - Built-in theme names (e.g., "github-light", "nord", "dracula")
 * - Paths to theme JSON files
 * - Custom theme objects following Shiki's theme schema
 */
function normalizeThemeConfig(
	theme: string | { light: string; dark: string } | Record<string, unknown> | undefined,
): ShikiThemeConfig {
	if (!theme) {
		return { ...DEFAULT_SHIKI_THEMES };
	}

	if (typeof theme === "string") {
		// Single theme name - use for both light and dark
		return { light: theme, dark: theme };
	}

	if ("light" in theme && "dark" in theme && typeof theme.light === "string" && typeof theme.dark === "string") {
		// Explicit light/dark configuration
		return { light: theme.light, dark: theme.dark };
	}

	// Custom theme object - use for both modes
	return { light: theme, dark: theme };
}

/**
 * Helper function to write a markdown file (async)
 */
async function writeFile(
	resolvedOutputDir: string,
	baseRoute: string,
	routePath: string,
	content: string,
	logger: DebugLogger,
	skipIfExists: boolean = false,
	perfManager?: PerformanceManager,
): Promise<boolean> {
	// Extract the relative path from the route path
	const relativePath = routePath.replace(baseRoute, "").replace(/^\//, "");
	const filePath = path.join(resolvedOutputDir, `${relativePath}.mdx`);

	// Track file operation start
	perfManager?.mark(`file.operation.${relativePath}.start`);

	// Check if file exists
	let existingContent: string | null = null;
	try {
		perfManager?.mark(`file.read.${relativePath}.start`);
		existingContent = await fs.promises.readFile(filePath, "utf-8");
		perfManager?.mark(`file.read.${relativePath}.end`);
		perfManager?.measure("file.read", `file.read.${relativePath}.start`, `file.read.${relativePath}.end`);
		perfManager?.increment("file.reads");
	} catch {
		// File doesn't exist
	}

	// Skip if file exists and skipIfExists is true (for overview files)
	if (skipIfExists && existingContent !== null) {
		Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
		Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));
		logger.debug(`✓ UNCHANGED: ${relativePath}.mdx`);
		return false;
	}

	// Determine status
	let status: "new" | "unchanged" | "modified";
	if (existingContent === null) {
		status = "new";
	} else if (existingContent === content) {
		status = "unchanged";
	} else {
		status = "modified";
	}

	// Validate MDX content for potential issues (always validate, even unchanged)
	logger.validateMDXContent(filePath, content);

	// Only write if changed
	if (status !== "unchanged") {
		// Ensure directory exists
		const dirPath = path.dirname(filePath);
		await fs.promises.mkdir(dirPath, { recursive: true });

		// Write the file
		perfManager?.mark(`file.write.${relativePath}.start`);
		await fs.promises.writeFile(filePath, content, "utf-8");
		perfManager?.mark(`file.write.${relativePath}.end`);
		perfManager?.measure("file.write", `file.write.${relativePath}.start`, `file.write.${relativePath}.end`);
		perfManager?.increment("file.writes");
		perfManager?.increment(`file.writes.${status}`);
	}

	// Track file operation end
	perfManager?.mark(`file.operation.${relativePath}.end`);
	perfManager?.measure("file.operation", `file.operation.${relativePath}.start`, `file.operation.${relativePath}.end`);

	// Track file generation via Effect Metrics
	Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
	if (status === "new") Effect.runSync(Metric.increment(BuildMetrics.filesNew));
	else if (status === "modified") Effect.runSync(Metric.increment(BuildMetrics.filesModified));
	else Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));
	logger.debug(
		`${status === "new" ? "📄" : status === "modified" ? "✏️" : "✓"} ${status.toUpperCase()}: ${relativePath}.mdx`,
	);

	return true;
}

/**
 * Generate markdown documentation for a single API
 */
async function generateApiDocs(
	config: {
		apiPackage: ApiPackage;
		packageName: string;
		apiName?: string;
		outputDir: string;
		baseRoute: string;
		categories: Record<string, CategoryConfig>;
		source?: SourceConfig;
		packageJson?: PackageJson;
		suppressExampleErrors?: boolean;
		llmsPlugin?: LlmsPluginOptions;
		siteUrl?: string;
		ogImage?: OpenGraphImageConfig;
		docsDir?: string;
		docsRoot?: string;
		theme?: ShikiThemeConfig;
	},
	shikiCrossLinker: ShikiCrossLinker,
	snapshotManager: SnapshotManager,
	ogResolver: OpenGraphResolver | null,
	logger: DebugLogger,
	fileContextMap: Map<string, { api?: string; version?: string; file: string }>,
	perfManager?: PerformanceManager,
	highlighter?: Highlighter,
	hideCutTransformer?: ShikiTransformer,
	hideCutLinesTransformer?: ShikiTransformer,
	twoslashTransformer?: ShikiTransformer,
): Promise<void> {
	const {
		apiPackage,
		packageName,
		apiName,
		outputDir,
		baseRoute,
		categories,
		source,
		packageJson,
		suppressExampleErrors = true,
		llmsPlugin,
		siteUrl,
		ogImage,
	} = config;

	const resolvedOutputDir = path.resolve(process.cwd(), outputDir);
	const buildTime = new Date().toISOString();

	// Load existing snapshots from database for this outputDir
	const existingSnapshots = new Map<string, import("./snapshot-manager.js").FileSnapshot>();
	for (const snapshot of snapshotManager.getSnapshotsForOutputDir(resolvedOutputDir)) {
		existingSnapshots.set(snapshot.filePath, snapshot);
	}

	// Track all files generated in this build
	const generatedFiles = new Set<string>();

	// Log package.json info if loaded
	if (packageJson) {
		logger.debug(`📦 Loaded package.json for ${packageName}: ${packageJson.name}@${packageJson.version}`);
	}

	// Create the output directory if it doesn't exist (async)
	await fs.promises.mkdir(resolvedOutputDir, { recursive: true });

	// Note: No upfront cleanup needed - we use snapshot-based tracking
	// to detect and clean up stale files at the end of the build process

	// Categorize API items
	const items = ApiParser.categorizeApiItems(apiPackage, categories);

	// Initialize cross-linking map for markdown and Shiki transformer
	const crossLinkData = markdownCrossLinker.initialize(items, baseRoute, categories);
	// API scope is derived from baseRoute to match file path inference in remark plugins
	// e.g., baseRoute "/example-module" -> scope "example-module"
	// When baseRoute is "/" (single-API mode), fall back to packageName to ensure a non-empty scope
	const apiScope = baseRoute.replace(/^\//, "").split("/")[0] || packageName;

	// Extract namespace members and add their routes to cross-link data
	const namespaceMembers = ApiParser.extractNamespaceMembers(apiPackage);

	// Track unqualified names to detect collisions across namespaces
	const unqualifiedNameCounts = new Map<string, number>();
	for (const nsMember of namespaceMembers) {
		const name = nsMember.item.displayName;
		unqualifiedNameCounts.set(name, (unqualifiedNameCounts.get(name) || 0) + 1);
	}

	for (const nsMember of namespaceMembers) {
		const categoryEntry = Object.entries(categories).find(([, config]) =>
			config.itemKinds?.includes(nsMember.item.kind),
		);
		if (!categoryEntry) continue;
		const [, categoryConfig] = categoryEntry;

		const qualifiedRoute = `${baseRoute}/${categoryConfig.folderName}/${nsMember.qualifiedName.toLowerCase()}`;

		// Always add qualified name (e.g., "Formatters.FormatOptions")
		crossLinkData.routes.set(nsMember.qualifiedName, qualifiedRoute);
		crossLinkData.kinds.set(nsMember.qualifiedName, nsMember.item.kind);

		// Add unqualified PascalCase name if no collision and not already present
		const displayName = nsMember.item.displayName;
		const isPascalCase = /^[A-Z]/.test(displayName);
		if (isPascalCase && (unqualifiedNameCounts.get(displayName) || 0) <= 1 && !crossLinkData.routes.has(displayName)) {
			crossLinkData.routes.set(displayName, qualifiedRoute);
			crossLinkData.kinds.set(displayName, nsMember.item.kind);
		}
	}

	shikiCrossLinker.reinitialize(crossLinkData.routes, crossLinkData.kinds, apiScope);

	// Add routes to TwoslashManager for {@link ...} resolution in hover popups
	TwoslashManager.addTypeRoutes(crossLinkData.routes);

	// Register VFS config for the remark plugin
	// This enables remarkApiCodeblocks to transform raw code fences during MDX compilation
	// Note: Cross-linking is now done via post-processing (crossLinker.transformHast) to avoid
	// interfering with Twoslash popup positioning
	if (highlighter) {
		VfsRegistry.register(apiScope, {
			vfs: new Map(), // VFS is already loaded in TwoslashManager, not needed here
			highlighter,
			twoslashTransformer,
			crossLinker: shikiCrossLinker,
			hideCutTransformer,
			hideCutLinesTransformer,
			packageName,
			apiScope,
			theme: config.theme,
		});
		logger.debug(`📦 Registered VFS config for remark plugin: ${apiScope}`);
	}

	let fileCount = 0;

	// Build _meta.json entries for api folder
	const apiMetaEntries: Array<{
		type: string;
		name: string;
		label: string;
		collapsible: boolean;
		collapsed: boolean;
		overviewHeaders: number[];
	}> = [];

	// Add category entries based on what exists
	for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
		const categoryItems = items[categoryKey] || [];
		if (categoryItems.length > 0) {
			apiMetaEntries.push({
				type: "dir",
				name: categoryConfig.folderName,
				label: categoryConfig.displayName,
				collapsible: categoryConfig.collapsible ?? true,
				collapsed: categoryConfig.collapsed ?? true,
				overviewHeaders: categoryConfig.overviewHeaders ?? [2],
			});
		}
	}

	// Write api/_meta.json with snapshot tracking
	const apiMetaJsonPath = path.join(resolvedOutputDir, "_meta.json");
	const apiMetaJsonRelPath = "_meta.json";
	const apiMetaJsonContent = JSON.stringify(apiMetaEntries, null, "\t");
	const apiMetaContentHash = SnapshotManager.hashContent(apiMetaJsonContent);
	const apiMetaOldSnapshot = existingSnapshots.get(apiMetaJsonRelPath);

	let apiMetaUnchanged = false;
	let apiMetaPublished: string;
	let apiMetaModified: string;

	// Always check if file exists on disk first
	const apiMetaFileExists = await fs.promises
		.access(apiMetaJsonPath)
		.then(() => true)
		.catch(() => false);

	if (!apiMetaFileExists) {
		// File doesn't exist - must regenerate regardless of snapshot
		apiMetaPublished = apiMetaOldSnapshot?.publishedTime || buildTime;
		apiMetaModified = buildTime;
		apiMetaUnchanged = false;
		logger.verbose(`📄 NEW (missing on disk): ${apiMetaJsonRelPath}`);
	} else if (!apiMetaOldSnapshot) {
		// No snapshot but file exists - compare content (normalize JSON formatting)
		const existingContent = await fs.promises.readFile(apiMetaJsonPath, "utf-8");
		const existingData = JSON.parse(existingContent);
		const normalizedExisting = JSON.stringify(existingData, null, "\t");
		const normalizedNew = apiMetaJsonContent;

		if (normalizedExisting === normalizedNew) {
			// File exists and matches - use arbitrary old timestamp (no frontmatter to extract from)
			// We use a consistent old date so it doesn't change between builds
			apiMetaPublished = "2024-01-01T00:00:00.000Z";
			apiMetaModified = "2024-01-01T00:00:00.000Z";
			apiMetaUnchanged = true;
			logger.debug(`✓ UNCHANGED (no snapshot, file matches): ${apiMetaJsonRelPath}`);
		} else {
			// File exists but changed
			apiMetaPublished = "2024-01-01T00:00:00.000Z";
			apiMetaModified = buildTime;
			logger.verbose(`✏️  MODIFIED (no snapshot, file changed): ${apiMetaJsonRelPath}`);
		}
	} else if (apiMetaOldSnapshot.contentHash === apiMetaContentHash) {
		// File exists, snapshot exists, content unchanged
		apiMetaPublished = apiMetaOldSnapshot.publishedTime;
		apiMetaModified = apiMetaOldSnapshot.modifiedTime;
		apiMetaUnchanged = true;
		logger.debug(`✓ UNCHANGED: ${apiMetaJsonRelPath}`);
	} else {
		// File exists, snapshot exists, content changed
		apiMetaPublished = apiMetaOldSnapshot.publishedTime;
		apiMetaModified = buildTime;
		logger.verbose(`✏️  MODIFIED: ${apiMetaJsonRelPath}`);
	}

	if (!apiMetaUnchanged) {
		await fs.promises.writeFile(apiMetaJsonPath, apiMetaJsonContent, "utf-8");
		Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
		if (apiMetaOldSnapshot) {
			Effect.runSync(Metric.increment(BuildMetrics.filesModified));
		} else {
			Effect.runSync(Metric.increment(BuildMetrics.filesNew));
		}
	} else {
		Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
		Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));
	}

	// Track in snapshot (note: _meta.json has no frontmatter)
	snapshotManager.upsertSnapshot({
		outputDir: resolvedOutputDir,
		filePath: apiMetaJsonRelPath,
		publishedTime: apiMetaPublished,
		modifiedTime: apiMetaModified,
		contentHash: apiMetaContentHash,
		frontmatterHash: "", // No frontmatter in _meta.json
		buildTime,
	});

	// Add to generatedFiles so it's not deleted as stale
	generatedFiles.add(apiMetaJsonRelPath);

	logger.verbose("✅ Generated _meta.json with category entries");

	// Generate main index page with category counts (skip if exists)
	const categoryCounts: Record<string, number> = {};
	for (const [categoryKey, categoryItems] of Object.entries(items)) {
		categoryCounts[categoryKey] = categoryItems.length;
	}
	const mainIndexGenerator = new MainIndexPageGenerator();
	const mainIndex = mainIndexGenerator.generate(packageName, baseRoute, categoryCounts);
	if (
		await writeFile(resolvedOutputDir, baseRoute, mainIndex.routePath, mainIndex.content, logger, true, perfManager)
	) {
		fileCount++;

		// Track file context for remark plugin
		const relativePathWithExt = `${mainIndex.routePath.replace(/^\//, "")}.mdx`;
		const absolutePath = path.join(resolvedOutputDir, relativePathWithExt);
		fileContextMap.set(absolutePath, {
			api: apiName,
			version: packageJson?.version,
			file: relativePathWithExt,
		});
	}

	// Track index page in generatedFiles regardless of whether it was written or skipped
	generatedFiles.add("index.mdx");

	// Collect category meta writes for parallel execution
	const categoryMetaWrites: Array<{ path: string; content: string; folderName: string; count: number }> = [];

	// Calculate parallelism level: leave 1-2 cores free for system responsiveness
	// On machines with 4+ cores, use cores-1; on smaller machines, use at least 2
	const cpuCores = os.cpus().length;
	const pageConcurrency = Math.max(cpuCores > 4 ? cpuCores - 1 : cpuCores, 2);

	// === FLATTENED PARALLEL PROCESSING ===
	// Collect ALL items from ALL categories into a single flat list, then process in parallel.
	// This eliminates the category-by-category sequential bottleneck.
	interface WorkItem {
		item: (typeof items)[string][number];
		categoryKey: string;
		categoryConfig: CategoryConfig;
		/** For namespace members, includes qualified name info */
		namespaceMember?: NamespaceMember;
	}

	const allWorkItems: WorkItem[] = [];
	for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
		const categoryItems = items[categoryKey] || [];
		for (const item of categoryItems) {
			allWorkItems.push({ item, categoryKey, categoryConfig });
		}
	}

	// Add namespace members to work items (reuse already-extracted list)
	// These are processed with qualified names (e.g., "MathUtils.Vector")
	for (const nsMember of namespaceMembers) {
		// Find the appropriate category for this member kind
		const categoryEntry = Object.entries(categories).find(([, config]) =>
			config.itemKinds?.includes(nsMember.item.kind),
		);
		if (categoryEntry) {
			const [categoryKey, categoryConfig] = categoryEntry;
			allWorkItems.push({
				item: nsMember.item,
				categoryKey,
				categoryConfig,
				namespaceMember: nsMember,
			});
		}
	}

	const totalItems = allWorkItems.length;
	logger.debug(`🚀 Page generation parallelism: ${pageConcurrency} concurrent pages (${cpuCores} CPU cores detected)`);
	logger.verbose(`📝 Generating ${totalItems} pages across ${Object.keys(categories).length} categories in parallel`);

	perfManager?.mark("pages.parallel.start");

	// Process ALL items in parallel (not category by category)
	const allItemResults = await parallelLimit(
		allWorkItems,
		pageConcurrency,
		async ({ item, categoryKey, categoryConfig, namespaceMember }) => {
			let page: { routePath: string; content: string } | null = null;

			// Use qualified name for namespace members, otherwise use display name
			const itemName = namespaceMember ? namespaceMember.qualifiedName : item.displayName;
			const pageFilePath = `${categoryConfig.folderName}/${itemName}.mdx`;

			// Count members for debug logging
			const memberCount = "members" in item ? (item.members as unknown[]).length : 0;

			// Log page generation start
			logger.pageGenerationStart({
				file: pageFilePath,
				apiItemType: ApiItemKind[item.kind] as
					| "Class"
					| "Interface"
					| "Function"
					| "TypeAlias"
					| "Enum"
					| "Variable"
					| "Namespace",
				memberCount,
				category: categoryConfig.folderName,
				apiName,
				version: packageJson?.version,
			});

			// Generate appropriate page based on item kind
			switch (item.kind) {
				case ApiItemKind.Class: {
					const generator = new ClassPageGenerator();
					page = await generator.generate(
						item as ApiClass,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					// Update route to use correct folder
					page = {
						routePath: page.routePath.replace("/class/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				case ApiItemKind.Interface: {
					const generator = new InterfacePageGenerator();
					page = await generator.generate(
						item as ApiInterface,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					page = {
						routePath: page.routePath.replace("/interface/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				case ApiItemKind.Function: {
					const generator = new FunctionPageGenerator();
					page = await generator.generate(
						item as ApiFunction,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					page = {
						routePath: page.routePath.replace("/function/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				case ApiItemKind.TypeAlias: {
					const generator = new TypeAliasPageGenerator();
					page = await generator.generate(
						item as ApiTypeAlias,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					page = {
						routePath: page.routePath.replace("/type/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				case ApiItemKind.Enum: {
					const generator = new EnumPageGenerator();
					page = await generator.generate(
						item as ApiEnum,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					page = {
						routePath: page.routePath.replace("/enum/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				case ApiItemKind.Variable: {
					const generator = new VariablePageGenerator();
					page = await generator.generate(
						item as ApiVariable,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					page = {
						routePath: page.routePath.replace("/variable/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				case ApiItemKind.Namespace: {
					const generator = new NamespacePageGenerator();
					page = await generator.generate(
						item as ApiNamespace,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					);
					page = {
						routePath: page.routePath.replace("/namespace/", `/${categoryConfig.folderName}/`),
						content: page.content,
					};
					break;
				}
				default: {
					logger.warn(
						`Skipping item "${item.displayName}" with unsupported kind: ${item.kind} (${ApiItemKind[item.kind] || "unknown"}) in category "${categoryConfig.displayName}"`,
					);
					logger.verbose(
						`  Item categorized as "${categoryKey}" but kind ${item.kind} has no matching page generator.`,
					);
					logger.verbose(`  Supported kinds: Class, Interface, Function, TypeAlias, Enum, Variable`);
					// Return null result for unsupported items
					return null;
				}
			}

			if (!page) {
				return null;
			}

			// For namespace members, transform the route path to use qualified name
			if (namespaceMember) {
				// Replace the simple member name with the qualified name in the route
				// e.g., /api/class/vector -> /api/class/mathutils.vector
				const simpleName = item.displayName.toLowerCase();
				const qualifiedNameLower = namespaceMember.qualifiedName.toLowerCase();
				page = {
					routePath: page.routePath.replace(`/${simpleName}`, `/${qualifiedNameLower}`),
					content: page.content,
				};
			}

			// Track page generation
			perfManager?.increment("pages.generated");

			// Parse the generated content to extract frontmatter and body
			const parsed = matter(page.content);
			// Normalize markdown spacing to remove excessive blank lines
			const bodyContent = normalizeMarkdownSpacing(parsed.content);
			const frontmatterData = parsed.data;

			// Compute relative path from outputDir
			const relativePath = page.routePath.replace(baseRoute, "").replace(/^\//, "");
			const relativePathWithExt = `${relativePath}.mdx`;

			// Hash the content and frontmatter
			const contentHash = SnapshotManager.hashContent(bodyContent);
			const frontmatterHash = SnapshotManager.hashFrontmatter(frontmatterData);

			// Determine timestamps based on previous snapshot
			let publishedTime: string;
			let modifiedTime: string;
			let isUnchanged = false;

			const oldSnapshot = existingSnapshots.get(relativePathWithExt);

			if (!oldSnapshot) {
				// No snapshot exists - check if file exists on disk as fallback
				const absolutePath = path.join(resolvedOutputDir, relativePathWithExt);
				const fileExists = await fs.promises
					.access(absolutePath)
					.then(() => true)
					.catch(() => false);

				if (fileExists) {
					// File exists on disk - compare against it to preserve timestamps
					const existingContent = await fs.promises.readFile(absolutePath, "utf-8");
					const { data: existingFrontmatter, content: existingBody } = matter(existingContent);
					// Apply same normalization as generated content for accurate comparison
					const normalizedExistingBody = normalizeMarkdownSpacing(existingBody);
					const existingContentHash = SnapshotManager.hashContent(normalizedExistingBody);
					const existingFrontmatterHash = SnapshotManager.hashFrontmatter(existingFrontmatter);

					if (existingContentHash === contentHash && existingFrontmatterHash === frontmatterHash) {
						// File exists and matches generated content - preserve timestamps and skip write
						publishedTime = (existingFrontmatter["article:published_time"] as string | undefined) || buildTime;
						modifiedTime = (existingFrontmatter["article:modified_time"] as string | undefined) || buildTime;
						isUnchanged = true;
						logger.debug(`✓ UNCHANGED (no snapshot, file matches): ${relativePathWithExt}`);
					} else {
						// File exists but content changed - preserve published, update modified
						publishedTime = (existingFrontmatter["article:published_time"] as string | undefined) || buildTime;
						modifiedTime = buildTime;
						logger.verbose(`✏️  MODIFIED (no snapshot, file changed): ${relativePathWithExt}`);
					}
				} else {
					// File doesn't exist - truly new
					publishedTime = buildTime;
					modifiedTime = buildTime;
					logger.verbose(`📄 NEW: ${relativePathWithExt}`);
				}
			} else if (oldSnapshot.contentHash === contentHash && oldSnapshot.frontmatterHash === frontmatterHash) {
				// NO CHANGES: Preserve both existing timestamps, skip file write
				publishedTime = oldSnapshot.publishedTime;
				modifiedTime = oldSnapshot.modifiedTime;
				isUnchanged = true;
				logger.debug(`✓ UNCHANGED: ${relativePathWithExt}`);
			} else {
				// CHANGED: Preserve published time, update modified time
				publishedTime = oldSnapshot.publishedTime;
				modifiedTime = buildTime;
				logger.verbose(`✏️  MODIFIED: ${relativePathWithExt}`);
			}

			// Return result for aggregation (include category info for grouping)
			return {
				item,
				page,
				relativePathWithExt,
				bodyContent,
				frontmatterData,
				contentHash,
				frontmatterHash,
				publishedTime,
				modifiedTime,
				isUnchanged,
				categoryKey,
				categoryConfig,
				namespaceMember,
			};
		},
	);

	perfManager?.mark("pages.parallel.end");
	perfManager?.measure("pages.parallel", "pages.parallel.start", "pages.parallel.end");
	logger.verbose(`✅ Generated ${allItemResults.filter((r) => r !== null).length} pages in parallel`);

	// Collect all snapshots for batch update (avoids SQLite contention during file writes)
	const snapshotsToUpdate: import("./snapshot-manager.js").FileSnapshot[] = [];

	// Filter out null results and prepare for parallel processing
	const validResults = allItemResults.filter((r): r is NonNullable<typeof r> => r !== null);

	// Process all file operations in parallel (reads, writes, OG resolution)
	perfManager?.mark("files.parallel.start");
	const fileResults = await parallelLimit(validResults, pageConcurrency, async (result) => {
		const {
			item,
			page,
			relativePathWithExt,
			bodyContent,
			frontmatterData,
			contentHash,
			frontmatterHash,
			publishedTime,
			modifiedTime,
			isUnchanged,
			categoryKey,
			categoryConfig,
			namespaceMember,
		} = result;

		const absolutePath = path.join(resolvedOutputDir, relativePathWithExt);

		// Handle unchanged files
		if (isUnchanged) {
			// Skip MDX validation read for unchanged files - too slow and not critical
			// The content was already validated when it was first written

			// Track as unchanged without writing
			Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
			Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));

			// Use qualified name for namespace members
			const metaName = namespaceMember ? namespaceMember.qualifiedName.toLowerCase() : item.displayName.toLowerCase();
			const metaLabel = namespaceMember ? namespaceMember.qualifiedName : item.displayName;

			return {
				categoryKey,
				metaEntry: { name: metaName, label: metaLabel },
				snapshot: {
					outputDir: resolvedOutputDir,
					filePath: relativePathWithExt,
					publishedTime,
					modifiedTime,
					contentHash,
					frontmatterHash,
					buildTime,
				},
				absolutePath,
				relativePathWithExt,
				written: false,
			};
		}

		// Build OG metadata with determined timestamps (if ogResolver is configured)
		let finalContent = matter.stringify(bodyContent, frontmatterData);
		if (ogResolver && siteUrl) {
			// Resolve OG image metadata (auto-detect dimensions from local files if possible)
			const ogImageMetadata = await ogResolver.resolve(ogImage, packageName, apiName);

			const ogMetadata = OpenGraphResolver.createPageMetadata({
				siteUrl,
				pageRoute: page.routePath,
				description: frontmatterData.description as string,
				publishedTime,
				modifiedTime,
				section: categoryConfig.displayName,
				packageName,
				ogImage: ogImageMetadata,
			});

			// Regenerate frontmatter with OG metadata
			const { generateFrontmatter } = await import("./markdown/helpers.js");
			const newFrontmatter = generateFrontmatter(
				item.displayName,
				frontmatterData.description as string,
				categoryConfig.singularName,
				apiName,
				ogMetadata,
			);

			// Combine new frontmatter with body content
			finalContent = newFrontmatter + bodyContent;
		}

		// Write the file
		const written = await writeFile(
			resolvedOutputDir,
			baseRoute,
			page.routePath,
			finalContent,
			logger,
			false,
			perfManager,
		);

		// Use qualified name for namespace members
		const metaName = namespaceMember ? namespaceMember.qualifiedName.toLowerCase() : item.displayName.toLowerCase();
		const metaLabel = namespaceMember ? namespaceMember.qualifiedName : item.displayName;

		return {
			categoryKey,
			metaEntry: { name: metaName, label: metaLabel },
			snapshot: {
				outputDir: resolvedOutputDir,
				filePath: relativePathWithExt,
				publishedTime,
				modifiedTime,
				contentHash,
				frontmatterHash,
				buildTime,
			},
			absolutePath,
			relativePathWithExt,
			written,
		};
	});
	perfManager?.mark("files.parallel.end");
	perfManager?.measure("files.parallel", "files.parallel.start", "files.parallel.end");

	// Collect results into appropriate structures
	const categoryMetaEntriesMap = new Map<string, Array<{ name: string; label: string }>>();

	for (const result of fileResults) {
		// Track generated file
		generatedFiles.add(result.relativePathWithExt);

		// Track file context for remark plugin
		fileContextMap.set(result.absolutePath, {
			api: apiName,
			version: packageJson?.version,
			file: result.relativePathWithExt,
		});

		// Collect snapshot for batch update (only if file was actually written)
		// Skip unchanged files - their snapshots are already correct in the database
		if (result.written) {
			snapshotsToUpdate.push(result.snapshot);
		}

		// Collect category meta entries
		const entries = categoryMetaEntriesMap.get(result.categoryKey) || [];
		entries.push(result.metaEntry);
		categoryMetaEntriesMap.set(result.categoryKey, entries);

		// Count written files
		if (result.written) {
			fileCount++;
		}
	}

	// Build category _meta.json writes
	for (const [categoryKey, categoryMetaEntries] of categoryMetaEntriesMap) {
		const categoryConfig = categories[categoryKey];
		if (!categoryConfig || categoryMetaEntries.length === 0) continue;

		// Prepare _meta.json for this category folder
		if (categoryMetaEntries.length > 0) {
			// Sort alphabetically by label
			categoryMetaEntries.sort((a, b) => a.label.localeCompare(b.label));

			// Build _meta.json array
			const categoryMeta = categoryMetaEntries.map((entry) => ({
				type: "file",
				name: entry.name,
				label: entry.label,
			}));

			// Collect for parallel write later
			const categoryMetaPath = path.join(resolvedOutputDir, categoryConfig.folderName, "_meta.json");
			categoryMetaWrites.push({
				path: categoryMetaPath,
				content: JSON.stringify(categoryMeta, null, "\t"),
				folderName: categoryConfig.folderName,
				count: categoryMeta.length,
			});
		}

		// Track category stats (no longer timing individual categories since we process in parallel)
		perfManager?.increment(`category.${categoryKey}.pages`, categoryMetaEntries.length);
	}

	// Batch-update all page snapshots in a single transaction (much faster than individual updates)
	if (snapshotsToUpdate.length > 0) {
		perfManager?.mark("snapshot.batch.start");
		const batchUpdated = snapshotManager.batchUpsertSnapshots(snapshotsToUpdate);
		perfManager?.mark("snapshot.batch.end");
		perfManager?.measure("snapshot.batch", "snapshot.batch.start", "snapshot.batch.end");
		logger.debug(`💾 Batch-updated ${batchUpdated} page snapshots`);
	}

	// Write all category _meta.json files in parallel and collect snapshots
	const metaSnapshots = await Promise.all(
		categoryMetaWrites.map(async (write) => {
			const relPath = path.join(write.folderName, "_meta.json");
			const contentHash = SnapshotManager.hashContent(write.content);
			const oldSnapshot = existingSnapshots.get(relPath);

			let isUnchanged = false;
			let publishedTime: string;
			let modifiedTime: string;

			// Always check if file exists on disk first
			const fileExists = await fs.promises
				.access(write.path)
				.then(() => true)
				.catch(() => false);

			if (!fileExists) {
				// File doesn't exist - must regenerate regardless of snapshot
				publishedTime = oldSnapshot?.publishedTime || buildTime;
				modifiedTime = buildTime;
				isUnchanged = false;
				logger.verbose(`📄 NEW (missing on disk): ${relPath}`);
			} else if (!oldSnapshot) {
				// No snapshot but file exists - compare content (normalize JSON formatting)
				const existingContent = await fs.promises.readFile(write.path, "utf-8");
				const existingData = JSON.parse(existingContent);
				const normalizedExisting = JSON.stringify(existingData, null, "\t");
				const normalizedNew = write.content;

				if (normalizedExisting === normalizedNew) {
					// File exists and matches - use arbitrary old timestamp
					publishedTime = "2024-01-01T00:00:00.000Z";
					modifiedTime = "2024-01-01T00:00:00.000Z";
					isUnchanged = true;
					logger.debug(`✓ UNCHANGED (no snapshot, file matches): ${relPath}`);
				} else {
					// File exists but changed
					publishedTime = "2024-01-01T00:00:00.000Z";
					modifiedTime = buildTime;
					logger.verbose(`✏️  MODIFIED (no snapshot, file changed): ${relPath}`);
				}
			} else if (oldSnapshot.contentHash === contentHash) {
				// File exists, snapshot exists, content unchanged
				publishedTime = oldSnapshot.publishedTime;
				modifiedTime = oldSnapshot.modifiedTime;
				isUnchanged = true;
				logger.debug(`✓ UNCHANGED: ${relPath}`);
			} else {
				// File exists, snapshot exists, content changed
				publishedTime = oldSnapshot.publishedTime;
				modifiedTime = buildTime;
				logger.verbose(`✏️  MODIFIED: ${relPath}`);
			}

			if (!isUnchanged) {
				// Ensure category directory exists
				const categoryDir = path.dirname(write.path);
				await fs.promises.mkdir(categoryDir, { recursive: true });

				await fs.promises.writeFile(write.path, write.content, "utf-8");
				Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
				if (oldSnapshot) {
					Effect.runSync(Metric.increment(BuildMetrics.filesModified));
				} else {
					Effect.runSync(Metric.increment(BuildMetrics.filesNew));
				}
			} else {
				Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
				Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));
			}

			// Add to generatedFiles so it's not deleted as stale
			generatedFiles.add(relPath);

			logger.verbose(`✅ Generated _meta.json for ${write.folderName} with ${write.count} entries`);

			// Return snapshot data for batch update (only if file was actually written)
			// Skip unchanged files - their snapshots are already correct in the database
			if (isUnchanged) {
				return null;
			}

			return {
				outputDir: resolvedOutputDir,
				filePath: relPath,
				publishedTime,
				modifiedTime,
				contentHash,
				frontmatterHash: "", // No frontmatter in _meta.json
				buildTime,
			};
		}),
	);

	// Batch-update all _meta.json snapshots (filter out nulls for unchanged files)
	const metaSnapshotsToUpdate = metaSnapshots.filter(
		(s): s is import("./snapshot-manager.js").FileSnapshot => s !== null,
	);
	if (metaSnapshotsToUpdate.length > 0) {
		snapshotManager.batchUpsertSnapshots(metaSnapshotsToUpdate);
		logger.debug(`💾 Batch-updated ${metaSnapshotsToUpdate.length} _meta.json snapshots`);
	}

	// Clean up stale files (in DB but not generated in this build) - parallelize for better performance
	const staleFiles: string[] = snapshotManager.cleanupStaleFiles(resolvedOutputDir, generatedFiles);
	await Promise.all(
		staleFiles.map(async (staleFile) => {
			const fullPath = path.join(resolvedOutputDir, staleFile);
			try {
				await fs.promises.unlink(fullPath);
				logger.verbose(`🗑️  DELETED STALE: ${staleFile}`);
			} catch {
				// File already doesn't exist, ignore
			}
		}),
	);

	// Filesystem-based cleanup: remove files on disk that aren't tracked in generatedFiles
	// This catches files that exist on disk but have no DB record (e.g., created before
	// the snapshot system, or after a DB reset)
	try {
		const allFiles = await fs.promises.readdir(resolvedOutputDir, { recursive: true });
		const orphanedFiles: string[] = [];
		for (const entry of allFiles) {
			const relPath = typeof entry === "string" ? entry : String(entry);
			// Only consider .mdx and _meta.json files
			if (!relPath.endsWith(".mdx") && !relPath.endsWith("_meta.json")) continue;
			// Normalize path separators to forward slashes for comparison
			const normalizedRelPath = relPath.replace(/\\/g, "/");
			if (!generatedFiles.has(normalizedRelPath)) {
				orphanedFiles.push(normalizedRelPath);
			}
		}

		// Delete orphaned files from disk and snapshot DB
		await Promise.all(
			orphanedFiles.map(async (orphan) => {
				const fullPath = path.join(resolvedOutputDir, orphan);
				try {
					await fs.promises.unlink(fullPath);
					snapshotManager.deleteSnapshot(resolvedOutputDir, orphan);
					logger.verbose(`🗑️  DELETED ORPHAN: ${orphan}`);
				} catch {
					// File already doesn't exist, ignore
				}
			}),
		);

		// Remove empty subdirectories after file deletion
		if (orphanedFiles.length > 0) {
			const dirs = new Set<string>();
			for (const orphan of orphanedFiles) {
				const dir = path.dirname(orphan);
				if (dir !== ".") {
					dirs.add(dir);
				}
			}
			// Sort deepest-first so child dirs are removed before parents
			const sortedDirs = [...dirs].sort((a, b) => b.split("/").length - a.split("/").length);
			for (const dir of sortedDirs) {
				const fullDir = path.join(resolvedOutputDir, dir);
				try {
					const entries = await fs.promises.readdir(fullDir);
					if (entries.length === 0) {
						await fs.promises.rmdir(fullDir);
						logger.verbose(`🗑️  REMOVED EMPTY DIR: ${dir}`);
					}
				} catch {
					// Directory doesn't exist or can't be read, ignore
				}
			}
		}
	} catch {
		// readdir failed (outputDir doesn't exist), ignore
	}

	logger.verbose(`✅ Generated ${fileCount} API documentation files for ${packageName}`);
}

/**
 * RSPress plugin for generating API documentation from API Extractor model files
 */
export function ApiExtractorPlugin(options: ApiExtractorPluginOptions): RspressPlugin {
	// Create instances once at plugin initialization and reuse across all builds
	const shikiCrossLinker = new ShikiCrossLinker();
	// Use the singleton transformers for signature formatting
	// - MemberFormatTransformer: for member signatures (hides wrapper lines + cut + imports)
	// - HideCutLinesTransformer: for full signatures (hides only cut + imports)
	const hideCutTransformer = MemberFormatTransformer;
	const hideCutLinesTransformer = HideCutLinesTransformer;

	// Create logger and stats collectors at plugin level (shared across hooks)
	// Support LOG_LEVEL environment variable as override (useful for CI/debugging)
	const envLogLevel = process.env.LOG_LEVEL?.toLowerCase() as LogLevel | undefined;
	const logLevel = envLogLevel || options.logLevel || "info";
	// Phase 1: Minimal Effect runtime with available services
	// LogLevel "none" is not supported by PluginLoggerLayer, fall back to "info"
	const effectLogLevel = logLevel === "none" ? "info" : logLevel;
	const EffectAppLayer = Layer.mergeAll(PathDerivationServiceLive, PluginLoggerLayer(effectLogLevel));
	const effectRuntime = ManagedRuntime.make(EffectAppLayer);

	// File context map (reset in beforeBuild for each build)
	const fileContextMap = new Map<string, { api?: string; version?: string; file: string }>();

	// Initialize debug logger at plugin level (handles all logging)
	const debugLogger = new DebugLogger({
		logLevel,
		logFile: options.logFile,
	});

	// Shiki highlighter (initialized once in beforeBuild)
	let shikiHighlighter: Highlighter | undefined;

	// Combined VFS for all APIs (populated in beforeBuild, accessed by remark plugins)
	let combinedVfs: Map<string, string> | undefined;

	// Capture RSPress root directory for OG image auto-detection
	let docsRoot: string | undefined;

	// Performance manager (initialized in beforeBuild)
	let perfManager: PerformanceManager | undefined;

	// Build start time for duration tracking
	let buildStartTime: number = 0;

	// Track first build to avoid repeating summary on HMR rebuilds
	let isFirstBuild = true;

	return {
		name: "rspress-plugin-api-docs",

		// Styles are now imported directly in components via SCSS

		// Use beforeBuild hook to generate markdown files before the build starts
		async beforeBuild(_config: UserConfig, _isProd: boolean): Promise<void> {
			buildStartTime = performance.now();

			// Clear VFS registry from previous builds to avoid stale configs
			VfsRegistry.clear();

			// Initialize performance manager
			const performanceThresholds = options.performance?.thresholds;
			const { PerformanceManager: PerfMgr } = await import("./performance-manager.js");
			perfManager = PerfMgr.getInstance(debugLogger, performanceThresholds);
			debugLogger.debug(`PerformanceManager initialized (thresholds: ${performanceThresholds ? "custom" : "default"})`);

			// Mark start of build for performance tracking
			perfManager.mark("build.start");

			debugLogger.verbose("🚀 RSPress API Extractor Plugin");
			if (options.logFile) {
				debugLogger.verbose(`📊 Debug logging enabled (buildId: ${debugLogger.getBuildId()})`);
			}

			// Clear file context map for this build
			fileContextMap.clear();

			// Read RSPress config for multiVersion and locales
			const rspressMultiVersion = (_config as { multiVersion?: { default: string; versions: string[] } }).multiVersion;
			const rspressLocales = (_config as { locales?: Array<{ lang: string }> }).locales?.map((l) => l.lang) ?? [];
			const rspressLang = (_config as { lang?: string }).lang;
			const rspressRoot = docsRoot || process.cwd();

			// Count APIs for build start event
			const apiCount = options.api ? 1 : (options.apis?.length ?? 0);

			// Emit build start event (we'll update externalPackageCount after collecting them)
			debugLogger.buildStart({
				apiCount,
				externalPackageCount: 0, // Will be updated in externalPackagesLoaded event
			});

			// Initialize snapshot manager
			const dbPath = path.resolve(process.cwd(), "api-docs-snapshot.db");
			const snapshotManager = new SnapshotManager(dbPath);

			// Initialize OG resolver if siteUrl is configured
			const ogResolver = options.siteUrl ? new OpenGraphResolver({ siteUrl: options.siteUrl, docsRoot }) : null;

			// Collect virtual file systems for all APIs to enable Twoslash
			combinedVfs = new Map<string, string>();

			// First, collect all API data and VFS before generating docs
			const apiConfigs: Array<{
				apiPackage: ApiPackage;
				packageName: string;
				apiName?: string;
				outputDir: string;
				baseRoute: string;
				categories: Record<string, CategoryConfig>;
				source?: SourceConfig;
				packageJson?: PackageJson;
				llmsPlugin?: LlmsPluginOptions;
				siteUrl?: string;
				ogImage?: OpenGraphImageConfig;
				docsDir?: string;
				docsRoot?: string;
				theme?: ShikiThemeConfig;
			}> = [];

			// Collect all external packages to load
			const allExternalPackages: ExternalPackageSpec[] = [];

			// Track the first API-level tsconfig/compilerOptions for TypeScript config resolution
			let firstApiTsconfig: SingleApiConfig["tsconfig"] | MultiApiConfig["tsconfig"];
			let firstApiCompilerOptions: SingleApiConfig["compilerOptions"] | MultiApiConfig["compilerOptions"];

			try {
				const categoryResolver = new CategoryResolver();
				const pluginDefaults = categoryResolver.mergeCategories(DEFAULT_CATEGORIES, options.defaultCategories);

				const loadTimer = debugLogger.startTimer("Loading API models");

				/** Helper to process a single API model (shared by single and multi modes) */
				const processSimpleApi = async (
					api: SingleApiConfig | MultiApiConfig,
					model: NonNullable<SingleApiConfig["model"]> | MultiApiConfig["model"],
					outputDir: string,
					fullRoute: string,
				) => {
					// Set API context for performance tracking
					perfManager?.setContext({ api: api.name || api.packageName });
					perfManager?.mark("api.load.simple.start");

					const { apiPackage, source: loaderSource } = await ApiModelLoader.loadApiModel(model);

					perfManager?.mark("api.load.simple.end");
					perfManager?.measure("api.load", "api.load.simple.start", "api.load.simple.end");
					perfManager?.increment("api.simple.loaded");
					const resolvedCategories = categoryResolver.resolveCategoryConfig(pluginDefaults, api.categories);
					const resolvedSource = categoryResolver.resolveSourceConfig(api.source, loaderSource);
					const resolvedLlms = mergeLlmsPluginConfig(options.llmsPlugin, api.llmsPlugin);

					// Load package.json
					const packageJson = api.packageJson ? await ApiModelLoader.loadPackageJson(api.packageJson) : undefined;

					// Validate that explicit externalPackages don't conflict with peerDependencies
					validateExternalPackages(api.externalPackages, packageJson);

					// Collect external packages (explicit config takes precedence, then auto-detected from package.json)
					const externalPackages =
						api.externalPackages || extractAutoDetectedPackages(packageJson, api.autoDetectDependencies);

					// Track external packages
					if (externalPackages && externalPackages.length > 0) {
						perfManager?.increment("external.packages.total", externalPackages.length);
					}

					// Generate virtual file system from API model for Twoslash
					perfManager?.mark("vfs.generate.simple.start");
					const pkg = ApiExtractedPackage.fromPackage(apiPackage, api.packageName);
					const vfs = pkg.generateVfs();
					prependImportsToVfs(vfs, apiPackage, api.packageName);
					perfManager?.mark("vfs.generate.simple.end");
					perfManager?.measure("vfs.generate", "vfs.generate.simple.start", "vfs.generate.simple.end");

					// Resolve ogImage with cascading: API > global
					const resolvedOgImage = api.ogImage ?? options.ogImage;

					// Normalize theme configuration
					const resolvedTheme = normalizeThemeConfig(api.theme);

					return {
						vfs,
						externalPackages: externalPackages || [],
						config: {
							apiPackage,
							packageName: api.packageName,
							apiName: api.name,
							outputDir,
							baseRoute: fullRoute,
							categories: resolvedCategories,
							source: resolvedSource,
							packageJson,
							llmsPlugin: resolvedLlms,
							siteUrl: options.siteUrl,
							ogImage: resolvedOgImage,
							docsDir: path.dirname(outputDir),
							docsRoot,
							theme: resolvedTheme,
						},
					};
				};

				if (options.api) {
					// === Single-API mode ===
					const api = options.api;
					const baseRoute = normalizeBaseRoute(api.baseRoute ?? "/");

					// Capture tsconfig for later resolution
					firstApiTsconfig = api.tsconfig;
					firstApiCompilerOptions = api.compilerOptions;

					if (rspressMultiVersion && api.versions) {
						// Versioned single-API mode
						perfManager?.setContext({ api: api.name || api.packageName });

						const versionResults = await Promise.all(
							Object.entries(api.versions).map(async ([version, versionValue]) => {
								// Set version context for performance tracking
								perfManager?.setContext({ version });
								perfManager?.mark(`api.load.${version}.start`);

								// Normalize version value to VersionConfig
								const versionConfig: VersionConfig = isVersionConfig(versionValue)
									? versionValue
									: { model: versionValue };

								const {
									apiPackage,
									packageJson: versionPackageJson,
									categories: versionCategories,
									source: versionSource,
									externalPackages: versionExternalPackages,
									autoDetectDependencies: versionAutoDetectDependencies,
									llmsPlugin: versionLlms,
									ogImage: versionOgImage,
								} = await ApiModelLoader.loadVersionModel(versionConfig);

								perfManager?.mark(`api.load.${version}.end`);
								perfManager?.measure("api.load", `api.load.${version}.start`, `api.load.${version}.end`);
								perfManager?.increment("api.versions.loaded");
								const resolvedCategories = categoryResolver.resolveCategoryConfig(
									pluginDefaults,
									api.categories,
									versionCategories,
								);
								const resolvedSource = categoryResolver.resolveSourceConfig(api.source, versionSource);
								const resolvedLlms = mergeLlmsPluginConfig(options.llmsPlugin, api.llmsPlugin, versionLlms);

								// Load package.json (version config takes precedence, then package-level config)
								const packageJson =
									versionPackageJson ||
									(api.packageJson ? await ApiModelLoader.loadPackageJson(api.packageJson) : undefined);

								// Validate that explicit externalPackages don't conflict with peerDependencies
								validateExternalPackages(versionExternalPackages || api.externalPackages, packageJson);

								// Collect external packages (version > package > auto-detected)
								const autoDetectOptions = versionAutoDetectDependencies || api.autoDetectDependencies;
								const externalPackages =
									versionExternalPackages ||
									api.externalPackages ||
									extractAutoDetectedPackages(packageJson, autoDetectOptions);

								// Track external packages
								if (externalPackages && externalPackages.length > 0) {
									perfManager?.increment("external.packages.total", externalPackages.length);
								}

								// Generate virtual file system from API model for Twoslash
								perfManager?.mark(`vfs.generate.${version}.start`);
								const pkg = ApiExtractedPackage.fromPackage(apiPackage, api.packageName);
								const vfs = pkg.generateVfs();
								prependImportsToVfs(vfs, apiPackage, api.packageName);
								perfManager?.mark(`vfs.generate.${version}.end`);
								perfManager?.measure("vfs.generate", `vfs.generate.${version}.start`, `vfs.generate.${version}.end`);

								// Use deriveOutputPaths for versioned paths (supports i18n + versioned cross-product)
								const versionDerivedPaths = deriveOutputPaths({
									mode: "single",
									docsRoot: rspressRoot,
									baseRoute,
									apiFolder: api.apiFolder ?? "api",
									locales: rspressLocales,
									defaultLang: rspressLang,
									versions: [version],
									defaultVersion: rspressMultiVersion?.default,
								});
								// Use the first derived path for this version (non-i18n case)
								// When i18n is active, we'd need to iterate all locale variants
								const versionDp = versionDerivedPaths[0];
								if (!versionDp) {
									return {
										vfs: new Map<string, string>(),
										externalPackages: [] as Array<{ name: string; version: string }>,
										config: null,
									};
								}
								const outputDir = versionDp.outputDir;
								const fullRoute = versionDp.routeBase;

								// Resolve ogImage with cascading: version > API > global
								const resolvedOgImage = versionOgImage ?? api.ogImage ?? options.ogImage;

								// Normalize theme configuration (versioned APIs use package-level theme)
								const resolvedTheme = normalizeThemeConfig(api.theme);

								return {
									vfs,
									externalPackages: externalPackages || [],
									config: {
										apiPackage,
										packageName: `${api.packageName} (${version})`,
										apiName: api.name,
										outputDir,
										baseRoute: fullRoute,
										categories: resolvedCategories,
										source: resolvedSource,
										packageJson,
										llmsPlugin: resolvedLlms,
										siteUrl: options.siteUrl,
										ogImage: resolvedOgImage,
										docsDir: path.dirname(outputDir),
										docsRoot,
										theme: resolvedTheme,
									},
								};
							}),
						);

						// Clear version context after processing all versions
						perfManager?.clearContext("version");

						// Flatten and merge version results
						for (const result of versionResults) {
							for (const [filepath, content] of result.vfs.entries()) {
								combinedVfs.set(filepath, content);
							}
							if (result.externalPackages.length > 0) {
								allExternalPackages.push(...result.externalPackages);
							}
							if (result.config) {
								apiConfigs.push(result.config);
							}
						}
					} else {
						// Non-versioned single-API mode
						const derivedPaths = deriveOutputPaths({
							mode: "single",
							docsRoot: rspressRoot,
							baseRoute,
							apiFolder: api.apiFolder ?? "api",
							locales: rspressLocales,
							defaultLang: rspressLang,
							versions: [],
							defaultVersion: undefined,
						});

						// For single non-versioned, use the first derived path
						const dp = derivedPaths[0];
						if (dp && api.model) {
							const result = await processSimpleApi(api, api.model, dp.outputDir, dp.routeBase);
							for (const [filepath, content] of result.vfs.entries()) {
								combinedVfs.set(filepath, content);
							}
							if (result.externalPackages.length > 0) {
								allExternalPackages.push(...result.externalPackages);
							}
							apiConfigs.push(result.config);
						}
					}
				} else if (options.apis) {
					// === Multi-API mode ===
					// Deterministically select tsconfig: first API with tsconfig wins
					// Warn if multiple APIs specify different tsconfigs
					const apisWithTsconfig = options.apis.filter((a) => a.tsconfig);
					if (apisWithTsconfig.length > 0) {
						firstApiTsconfig = apisWithTsconfig[0].tsconfig;
						const uniqueTsconfigs = new Set(apisWithTsconfig.map((a) => String(a.tsconfig)));
						if (uniqueTsconfigs.size > 1) {
							debugLogger.warn(
								`⚠️  Multiple APIs specify different tsconfig values: ${[...uniqueTsconfigs].join(", ")}. ` +
									`Using '${String(firstApiTsconfig)}' for TypeScript resolution. ` +
									`Per-API tsconfig resolution will be supported in a future release.`,
							);
						}
					}
					const apisWithCompilerOptions = options.apis.filter((a) => a.compilerOptions);
					if (apisWithCompilerOptions.length > 0) {
						firstApiCompilerOptions = apisWithCompilerOptions[0].compilerOptions;
					}

					const multiResults = await Promise.all(
						options.apis.map(async (api) => {
							const baseRoute = normalizeBaseRoute(api.baseRoute ?? `/${unscopedName(api.packageName)}`);

							const derivedPaths = deriveOutputPaths({
								mode: "multi",
								docsRoot: rspressRoot,
								baseRoute,
								apiFolder: api.apiFolder ?? "api",
								locales: rspressLocales,
								defaultLang: rspressLang,
								versions: [],
								defaultVersion: undefined,
							});

							const dp = derivedPaths[0];
							if (!dp) return [];

							const result = await processSimpleApi(api, api.model, dp.outputDir, dp.routeBase);
							return [result];
						}),
					);

					// Flatten and merge results
					for (const results of multiResults) {
						for (const result of results) {
							for (const [filepath, content] of result.vfs.entries()) {
								combinedVfs.set(filepath, content);
							}
							if (result.externalPackages.length > 0) {
								allExternalPackages.push(...result.externalPackages);
							}
							apiConfigs.push(result.config);
						}
					}
				}

				loadTimer.end();

				// Clear API context after loading all models
				perfManager?.clearContext("api");

				// Resolve TypeScript compiler options from configuration cascade
				// Uses project root (cwd) for resolving tsconfig.json paths
				const projectRoot = process.cwd();
				// Construct TypeScriptConfig from API-level fields (tsconfig/compilerOptions now live on api/apis)
				const globalTsConfig =
					firstApiTsconfig || firstApiCompilerOptions
						? { tsconfig: firstApiTsconfig, compilerOptions: firstApiCompilerOptions }
						: undefined;
				const resolvedCompilerOptions: TypeResolutionCompilerOptions = await resolveTypeScriptConfig(
					projectRoot,
					globalTsConfig,
				);

				debugLogger.verbose(
					`📝 Resolved TypeScript config: target=${resolvedCompilerOptions.target}, ` +
						`module=${resolvedCompilerOptions.module}, lib=[${resolvedCompilerOptions.lib?.join(", ")}]`,
				);

				// Load external package types and create TypeScript environment cache
				// Note: We ALWAYS create the TypeScript cache to ensure lib files are loaded,
				// even if there are no external packages to fetch
				let tsEnvCache: Map<string, VirtualTypeScriptEnvironment> | undefined;
				const loader = new TypeRegistryLoader(undefined, 7 * 24 * 60 * 60 * 1000, debugLogger);

				if (TypeRegistryLoader.hasPackages(allExternalPackages)) {
					const typesTimer = debugLogger.startTimer("Loading external package types");

					// Show heading in verbose mode
					if (debugLogger.isVerbose()) {
						debugLogger.verbose(`📦 Loading types for ${allExternalPackages.length} external package(s)...`);
					}

					// Track external package loading
					perfManager?.mark("external.packages.load.start");
					perfManager?.set("external.packages.count", allExternalPackages.length);

					const result = await loader.load(allExternalPackages, {
						createTsCache: true,
						compilerOptions: resolvedCompilerOptions,
					});

					perfManager?.mark("external.packages.load.end");
					perfManager?.measure("external.packages.load", "external.packages.load.start", "external.packages.load.end");

					// Merge external package VFS into combined VFS
					for (const [path, content] of result.vfs.entries()) {
						combinedVfs.set(path, content);
					}

					// Store TypeScript cache for Twoslash
					tsEnvCache = result.tsCache;

					// Track loaded and failed packages
					perfManager?.increment("external.packages.loaded", result.loaded.length);
					perfManager?.increment("external.packages.failed", result.failed.length);

					// Log results
					if (result.loaded.length > 0) {
						debugLogger.verbose(`✅ Successfully loaded types for ${result.loaded.length} package(s)`);
					}
					if (result.failed.length > 0) {
						debugLogger.warn(`⚠️  Failed to load types for ${result.failed.length} package(s):`);
						for (const { package: pkg, error } of result.failed) {
							debugLogger.warn(`   - ${pkg.name}@${pkg.version}: ${error}`);
						}
					}

					// Emit external packages loaded event
					const externalDurationMs = performance.now() - buildStartTime;
					debugLogger.externalPackagesLoaded({
						loaded: result.loaded.map((pkg) => `${pkg.name}@${pkg.version}`),
						failed: result.failed.map(({ package: pkg }) => `${pkg.name}@${pkg.version}`),
						durationMs: externalDurationMs,
					});

					typesTimer.end();
				} else {
					// No external packages, but still create TypeScript cache to load lib files
					// This ensures built-in types like Array, Promise, etc. are available in Twoslash
					const typesTimer = debugLogger.startTimer("Creating TypeScript environment cache");
					const result = await loader.load([], {
						createTsCache: true,
						compilerOptions: resolvedCompilerOptions,
					});
					tsEnvCache = result.tsCache;
					typesTimer.end();
					debugLogger.verbose("✅ Created TypeScript environment cache with lib files (no external packages)");
				}

				// Emit VFS merged event
				debugLogger.vfsMerged({
					packageCount: apiConfigs.length,
					totalFiles: combinedVfs.size,
					durationMs: performance.now() - buildStartTime,
				});

				// Initialize Twoslash BEFORE generating API docs
				// VFS now includes both package's own types and external dependencies
				const twoslashTimer = debugLogger.startTimer("Initializing Twoslash");
				const twoslashStartMs = performance.now();
				TwoslashManager.getInstance().initialize(
					combinedVfs,
					undefined,
					debugLogger,
					tsEnvCache,
					resolvedCompilerOptions,
				);
				twoslashTimer.end();

				// Emit Twoslash init event
				debugLogger.twoslashInitComplete({
					packageCount: apiConfigs.length,
					vfsFileCount: combinedVfs.size,
					durationMs: performance.now() - twoslashStartMs,
				});

				// Pre-initialize Shiki highlighter for better performance
				const shikiTimer = debugLogger.startTimer("Initializing Shiki highlighter");
				const shikiStartMs = performance.now();

				// Collect all unique themes from API configs
				// Uses Set for string themes and array for custom theme objects
				const themeSet = new Set<string>();
				const customThemes: Array<Record<string, unknown>> = [];

				for (const config of apiConfigs) {
					const theme = config.theme ?? { light: DEFAULT_SHIKI_THEMES.light, dark: DEFAULT_SHIKI_THEMES.dark };

					// Add light theme
					if (typeof theme.light === "string") {
						themeSet.add(theme.light);
					} else if (typeof theme.light === "object") {
						customThemes.push(theme.light as Record<string, unknown>);
					}

					// Add dark theme
					if (typeof theme.dark === "string") {
						themeSet.add(theme.dark);
					} else if (typeof theme.dark === "object") {
						customThemes.push(theme.dark as Record<string, unknown>);
					}
				}

				// Ensure defaults are always loaded (used by remark-with-api for files outside API docs)
				if (typeof DEFAULT_SHIKI_THEMES.light === "string") {
					themeSet.add(DEFAULT_SHIKI_THEMES.light);
				}
				if (typeof DEFAULT_SHIKI_THEMES.dark === "string") {
					themeSet.add(DEFAULT_SHIKI_THEMES.dark);
				}

				// Combine string theme names and custom theme objects
				const themes: Array<string | Record<string, unknown>> = [...themeSet, ...customThemes];
				const themeNames = [...themeSet]; // For logging (only string names)

				const langs = ["typescript", "javascript", "json", "bash", "sh"];
				shikiHighlighter = await createHighlighter({
					themes,
					langs,
				});
				shikiTimer.end();

				// Emit Shiki init event
				debugLogger.shikiInitComplete({
					themes: themeNames,
					languages: langs,
					durationMs: performance.now() - shikiStartMs,
				});

				// Generate API documentation with VFS mode for faster rendering
				// Use bounded parallelism (limit 2) to avoid SQLite contention while improving performance
				debugLogger.verbose("📝 Generating API documentation...");
				perfManager?.mark("page.generation.start");
				await parallelLimit(apiConfigs, 2, async (config) => {
					const configTimer = debugLogger.startTimer(`Generating docs for ${config.packageName}`);

					// Set API context for page generation tracking
					perfManager?.setContext({ api: config.apiName || config.packageName });
					perfManager?.mark(`page.generation.api.start`);

					await generateApiDocs(
						{
							...config,
							suppressExampleErrors: options.errors?.example !== "show",
						},
						shikiCrossLinker,
						snapshotManager,
						ogResolver,
						debugLogger,
						fileContextMap,
						perfManager,
						shikiHighlighter,
						hideCutTransformer,
						hideCutLinesTransformer,
						TwoslashManager.getInstance().getTransformer() ?? undefined,
					);

					perfManager?.mark(`page.generation.api.end`);
					perfManager?.measure("page.generation.api", `page.generation.api.start`, `page.generation.api.end`);
					perfManager?.clearContext("api");

					configTimer.end();
				});
				perfManager?.mark("page.generation.end");
				perfManager?.measure("page.generation.total", "page.generation.start", "page.generation.end");

				// Close snapshot manager connection
				snapshotManager.close();
				debugLogger.verbose("💾 Closed snapshot database");

				// Mark end of build and measure total time
				perfManager?.mark("build.end");
				perfManager?.measure("build.total", "build.start", "build.end");

				const totalTime = ((performance.now() - buildStartTime) / 1000).toFixed(2);
				debugLogger.verbose(`✅ API documentation complete (${totalTime}s)`);
			} catch (error) {
				// Log build error
				debugLogger.buildError({
					phase: "page.generate",
					error: error instanceof Error ? error : new Error(String(error)),
				});
				debugLogger.error(
					`❌ Error generating API documentation: ${error instanceof Error ? error.message : String(error)}`,
				);
				throw error;
			}
		},

		// Use afterBuild hook to log statistics
		async afterBuild(): Promise<void> {
			// Only emit detailed summary on first build (skip on HMR rebuilds to reduce noise)
			if (isFirstBuild) {
				// Log build summary via Effect metrics
				await effectRuntime.runPromise(logBuildSummary);

				// Read metric values for debug logger events
				const totalFiles = Effect.runSync(Metric.value(BuildMetrics.filesTotal)).count;
				const twoslashErrorCount = Effect.runSync(Metric.value(BuildMetrics.twoslashErrors)).count;
				const prettierErrorCount = Effect.runSync(Metric.value(BuildMetrics.prettierErrors)).count;
				const codeblockTotalCount = Effect.runSync(Metric.value(BuildMetrics.codeblockTotal)).count;
				const codeblockSlowCount = Effect.runSync(Metric.value(BuildMetrics.codeblockSlow)).count;
				const totalErrors = twoslashErrorCount + prettierErrorCount;

				// Emit summary events to debug logger
				debugLogger.codeBlockStatsSummary({
					total: codeblockTotalCount,
					slow: codeblockSlowCount,
					avgTimeMs: 0,
					byType: {},
					slowestMs: 0,
					fastestMs: 0,
				});
				debugLogger.errorStatsSummary({
					twoslash: { total: twoslashErrorCount },
					prettier: { total: prettierErrorCount },
				});

				// Emit build complete event
				debugLogger.buildComplete({
					durationMs: performance.now() - buildStartTime,
					summary: {
						files: totalFiles,
						pages: 0,
						errors: totalErrors,
					},
				});

				// Mark first build as complete
				isFirstBuild = false;
			}

			// Dispose Effect runtime (guaranteed cleanup of all scoped resources)
			await effectRuntime.dispose();

			// Close debug logger (await to ensure all events are written)
			await debugLogger.close();
		},

		// Use config hook to modify RSPress configuration
		config(_config: UserConfig): UserConfig {
			// Validate plugin options against RSPress config
			validatePluginOptions(options, _config as { multiVersion?: { default: string; versions: string[] } });

			// Capture docs root for OG image auto-detection (resolve to absolute path)
			if (_config.root) {
				docsRoot = path.isAbsolute(_config.root) ? _config.root : path.resolve(process.cwd(), _config.root);
			}

			// Read RSPress config values for path derivation
			const rspressRoot = docsRoot || process.cwd();
			const rspressLocales = (_config as { locales?: Array<{ lang: string }> }).locales?.map((l) => l.lang) ?? [];
			const rspressLang = (_config as { lang?: string }).lang;
			const rspressMultiVersion = (_config as { multiVersion?: { default: string; versions: string[] } }).multiVersion;

			// Pre-create output directories so RSPress's auto-nav-sidebar doesn't fail
			// This runs before beforeBuild, so directories must exist for _meta.json processing
			if (options.api) {
				const api = options.api;
				const baseRoute = normalizeBaseRoute(api.baseRoute ?? "/");
				const versions = rspressMultiVersion?.versions ?? [];
				const derivedPaths = deriveOutputPaths({
					mode: "single",
					docsRoot: rspressRoot,
					baseRoute,
					apiFolder: api.apiFolder ?? "api",
					locales: rspressLocales,
					defaultLang: rspressLang,
					versions,
					defaultVersion: rspressMultiVersion?.default,
				});
				for (const dp of derivedPaths) {
					fs.mkdirSync(dp.outputDir, { recursive: true });
				}
			} else if (options.apis) {
				for (const api of options.apis) {
					const baseRoute = normalizeBaseRoute(api.baseRoute ?? `/${unscopedName(api.packageName)}`);
					const derivedPaths = deriveOutputPaths({
						mode: "multi",
						docsRoot: rspressRoot,
						baseRoute,
						apiFolder: api.apiFolder ?? "api",
						locales: rspressLocales,
						defaultLang: rspressLang,
						versions: [],
						defaultVersion: undefined,
					});
					for (const dp of derivedPaths) {
						fs.mkdirSync(dp.outputDir, { recursive: true });
					}
				}
			}

			// Performance manager is initialized in beforeBuild (async context)

			// Inject Shiki transformer for cross-linking type references in code blocks
			const updatedConfig = { ..._config };

			// Ensure runtime components are included for proper module resolution
			// This allows RSPress to bundle the runtime components in all environments
			if (!updatedConfig.builderConfig) {
				updatedConfig.builderConfig = {};
			}
			if (!updatedConfig.builderConfig.source) {
				updatedConfig.builderConfig.source = {};
			}
			const existingInclude = updatedConfig.builderConfig.source.include || [];
			if (!existingInclude.includes("rspress-plugin-api-extractor/runtime")) {
				updatedConfig.builderConfig.source.include = [...existingInclude, "rspress-plugin-api-extractor/runtime"];
			}

			if (!updatedConfig.markdown) {
				updatedConfig.markdown = {};
			}

			// Add remark plugin for user-authored `with-api` code blocks
			if (!updatedConfig.markdown.remarkPlugins) {
				updatedConfig.markdown.remarkPlugins = [];
			}

			// Extract theme from the first API config for user-authored markdown files
			// (remarkWithApi runs globally, so we use the first API's theme as default)
			const firstApiTheme = options.api?.theme ?? options.apis?.[0]?.theme;
			const remarkTheme = normalizeThemeConfig(firstApiTheme);

			// This enables users to write ```typescript with-api blocks in their markdown
			// with full Twoslash support and cross-linking
			updatedConfig.markdown.remarkPlugins.push([
				remarkWithApi,
				{
					shikiCrossLinker,
					getTransformer: () => TwoslashManager.getInstance().getTransformer(),
					logger: debugLogger,
					perfManager,
					theme: remarkTheme,
				},
			]);

			// Add remark plugin for on-demand API code block rendering (dev mode)
			// This transforms raw code fences with api-signature/api-example metadata
			// into rendered HAST components during MDX compilation
			updatedConfig.markdown.remarkPlugins.push([
				remarkApiCodeblocks,
				{
					logger: debugLogger,
				},
			]);

			// Note: Deferred rendering architecture:
			// - Generated API docs output raw code fences with metadata (api-signature, api-example, etc.)
			// - The remarkApiCodeblocks plugin transforms them during MDX compilation (both dev and prod)
			// - This keeps MDX files clean and defers expensive Shiki/Twoslash processing to compile time
			// - User-authored `with-api` code blocks are processed by remarkWithApi plugin

			return updatedConfig;
		},
	};
}

/**
 * Prepend import statements for external type references to the VFS declaration files.
 *
 * This separates concerns: `ApiExtractedPackage` generates pure declarations,
 * while this helper adds import statements for external type references at the plugin layer.
 */
function prependImportsToVfs(vfs: VirtualFileSystem, apiPackage: ApiPackage, packageName: string): void {
	const extractor = new TypeReferenceExtractor(apiPackage, packageName);
	for (const entryPoint of apiPackage.entryPoints) {
		const imports = extractor.extractImportsForEntryPoint(entryPoint as ApiEntryPoint);
		const importStatements = TypeReferenceExtractor.formatImports(imports);
		if (importStatements.length === 0) continue;

		const entryName = (entryPoint as ApiEntryPoint).displayName || "";
		const fileName = entryName ? `${entryName}.d.ts` : "index.d.ts";
		const key = `node_modules/${packageName}/${fileName}`;
		const existing = vfs.get(key);
		if (existing) {
			vfs.set(key, `${importStatements.join("\n")}\n\n${existing}`);
		}
	}
}
