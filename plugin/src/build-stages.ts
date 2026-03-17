import path from "node:path";
import { FileSystem } from "@effect/platform";
import type {
	ApiClass,
	ApiEnum,
	ApiFunction,
	ApiInterface,
	ApiItem,
	ApiNamespace,
	ApiPackage,
	ApiTypeAlias,
	ApiVariable,
} from "@microsoft/api-extractor-model";
import { ApiItemKind } from "@microsoft/api-extractor-model";
import { Effect, Metric, Stream } from "effect";
import matter from "gray-matter";
import { hashContent, hashFrontmatter } from "./content-hash.js";
import { BuildMetrics } from "./layers/ObservabilityLive.js";
import type { NamespaceMember } from "./loader.js";
import { ApiParser } from "./loader.js";
import { generateFrontmatter } from "./markdown/helpers.js";
import {
	ClassPageGenerator,
	EnumPageGenerator,
	FunctionPageGenerator,
	InterfacePageGenerator,
	MainIndexPageGenerator,
	NamespacePageGenerator,
	TypeAliasPageGenerator,
	VariablePageGenerator,
} from "./markdown/index.js";
import { OpenGraphResolver } from "./og-resolver.js";
import type { CategoryConfig, LlmsPlugin, SourceConfig } from "./schemas/index.js";
import type { FileSnapshot } from "./services/SnapshotService.js";
import { SnapshotService } from "./services/SnapshotService.js";

export type { FileSnapshot } from "./services/SnapshotService.js";

export interface WorkItem {
	readonly item: ApiItem;
	readonly categoryKey: string;
	readonly categoryConfig: CategoryConfig;
	readonly namespaceMember?: NamespaceMember;
}

export interface GeneratedPageResult {
	readonly workItem: WorkItem;
	readonly content: string;
	readonly bodyContent: string;
	readonly frontmatter: Record<string, unknown>;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly routePath: string;
	readonly relativePathWithExt: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly isUnchanged: boolean;
}

export interface CrossLinkData {
	readonly routes: Map<string, string>;
	readonly kinds: Map<string, string>;
}

export interface FileWriteResult {
	readonly relativePathWithExt: string;
	readonly absolutePath: string;
	readonly status: "new" | "modified" | "unchanged";
	readonly snapshot: FileSnapshot;
	readonly categoryKey: string;
	readonly label: string;
	readonly routePath: string;
}

export interface PrepareWorkItemsInput {
	readonly apiPackage: ApiPackage;
	readonly categories: Record<string, CategoryConfig>;
	readonly baseRoute: string;
	readonly packageName: string;
}

export interface PrepareWorkItemsResult {
	readonly workItems: WorkItem[];
	readonly crossLinkData: CrossLinkData;
}

/**
 * Sanitize a display name to create a valid HTML ID.
 * Mirrors the logic in MarkdownCrossLinker.sanitizeId().
 */
function sanitizeId(displayName: string): string {
	return displayName
		.toLowerCase()
		.replace(/[\s_]+/g, "-")
		.replace(/[^a-z0-9-]/g, "")
		.replace(/^-+|-+$/g, "");
}

/**
 * Prepare the flat list of WorkItems to process and the cross-link data maps.
 *
 * This function:
 * 1. Categorizes API items from the model
 * 2. Builds cross-link routes and kinds maps (replicating MarkdownCrossLinker.initialize())
 * 3. Extracts namespace members and adds their routes (with collision detection)
 * 4. Flattens all items into a single WorkItem[]
 *
 * NOTE: This function does NOT call the markdownCrossLinker singleton. The caller
 * is responsible for passing the returned crossLinkData to the cross-linker and
 * Shiki cross-linker as needed.
 */
export function prepareWorkItems(input: PrepareWorkItemsInput): PrepareWorkItemsResult {
	const { apiPackage, categories, baseRoute } = input;

	// 1. Categorize API items by category key
	const items = ApiParser.categorizeApiItems(apiPackage, categories);

	// 2. Build cross-link routes and kinds maps directly
	//    (mirrors MarkdownCrossLinker.initialize() logic)
	const routes = new Map<string, string>();
	const kinds = new Map<string, string>();

	for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
		const categoryItems = items[categoryKey] || [];
		for (const item of categoryItems) {
			const itemRoute = `${baseRoute}/${categoryConfig.folderName}/${item.displayName.toLowerCase()}`;
			routes.set(item.displayName, itemRoute);
			kinds.set(item.displayName, item.kind);

			// For classes and interfaces, also add routes for their members
			if (item.kind === "Class" || item.kind === "Interface") {
				const itemWithMembers = item as ApiClass | ApiInterface;
				for (const member of itemWithMembers.members) {
					const memberName = member.displayName;
					const memberId = sanitizeId(memberName);
					const fullMemberName = `${item.displayName}.${memberName}`;
					const memberRoute = `${itemRoute}#${memberId}`;
					routes.set(fullMemberName, memberRoute);
					kinds.set(fullMemberName, member.kind);
				}
			}
		}
	}

	// 3. Extract namespace members and add their routes with collision detection
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
		routes.set(nsMember.qualifiedName, qualifiedRoute);
		kinds.set(nsMember.qualifiedName, nsMember.item.kind);

		// Add unqualified PascalCase name if no collision and not already present
		const displayName = nsMember.item.displayName;
		const isPascalCase = /^[A-Z]/.test(displayName);
		if (isPascalCase && (unqualifiedNameCounts.get(displayName) || 0) <= 1 && !routes.has(displayName)) {
			routes.set(displayName, qualifiedRoute);
			kinds.set(displayName, nsMember.item.kind);
		}
	}

	// 4. Flatten all items into a single WorkItem[]
	const workItems: WorkItem[] = [];

	for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
		const categoryItems = items[categoryKey] || [];
		for (const item of categoryItems) {
			workItems.push({ item, categoryKey, categoryConfig });
		}
	}

	// Add namespace members as work items
	for (const nsMember of namespaceMembers) {
		const categoryEntry = Object.entries(categories).find(([, config]) =>
			config.itemKinds?.includes(nsMember.item.kind),
		);
		if (categoryEntry) {
			const [categoryKey, categoryConfig] = categoryEntry;
			workItems.push({
				item: nsMember.item,
				categoryKey,
				categoryConfig,
				namespaceMember: nsMember,
			});
		}
	}

	return {
		workItems,
		crossLinkData: { routes, kinds },
	};
}

/**
 * Normalize markdown spacing by removing excessive blank lines.
 * - Remove extra blank lines between headings and code blocks
 * - Ensure single blank line between sections
 */
export function normalizeMarkdownSpacing(content: string): string {
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
 * Shared context for generateSinglePage — fields that are the same
 * for every item in a single API build.
 */
export interface GenerateSinglePageContext {
	readonly existingSnapshots: Map<string, FileSnapshot>;
	readonly baseRoute: string;
	readonly packageName: string;
	readonly apiScope: string;
	readonly apiName?: string;
	readonly source?: SourceConfig;
	readonly buildTime: string;
	readonly resolvedOutputDir: string;
	readonly suppressExampleErrors?: boolean;
	readonly llmsPlugin?: LlmsPlugin;
}

/**
 * Generate a single page from a work item. Returns null for unsupported kinds.
 */
export function generateSinglePage(
	workItem: WorkItem,
	ctx: GenerateSinglePageContext,
): Effect.Effect<GeneratedPageResult | null, never, FileSystem.FileSystem> {
	return Effect.gen(function* () {
		const fileSystem = yield* FileSystem.FileSystem;
		const {
			existingSnapshots,
			baseRoute,
			packageName,
			apiScope,
			apiName,
			source,
			buildTime,
			resolvedOutputDir,
			suppressExampleErrors,
			llmsPlugin,
		} = ctx;
		const { item, categoryConfig, namespaceMember } = workItem;
		let page: { routePath: string; content: string } | null = null;

		// Generate appropriate page based on item kind
		switch (item.kind) {
			case ApiItemKind.Class: {
				const generator = new ClassPageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiClass,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/class/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			case ApiItemKind.Interface: {
				const generator = new InterfacePageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiInterface,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/interface/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			case ApiItemKind.Function: {
				const generator = new FunctionPageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiFunction,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/function/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			case ApiItemKind.TypeAlias: {
				const generator = new TypeAliasPageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiTypeAlias,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/type/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			case ApiItemKind.Enum: {
				const generator = new EnumPageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiEnum,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/enum/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			case ApiItemKind.Variable: {
				const generator = new VariablePageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiVariable,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/variable/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			case ApiItemKind.Namespace: {
				const generator = new NamespacePageGenerator();
				page = yield* Effect.promise(() =>
					generator.generate(
						item as ApiNamespace,
						baseRoute,
						packageName,
						categoryConfig.singularName,
						apiScope,
						apiName,
						source,
						suppressExampleErrors,
						llmsPlugin,
					),
				);
				page = {
					routePath: page.routePath.replace("/namespace/", `/${categoryConfig.folderName}/`),
					content: page.content,
				};
				break;
			}
			default: {
				console.warn(
					`Skipping item "${item.displayName}" with unsupported kind: ${item.kind} (${ApiItemKind[item.kind] || "unknown"}) in category "${categoryConfig.displayName}"`,
				);
				return null;
			}
		}

		if (!page) {
			return null;
		}

		// For namespace members, transform the route path to use qualified name
		if (namespaceMember) {
			const simpleName = item.displayName.toLowerCase();
			const qualifiedNameLower = namespaceMember.qualifiedName.toLowerCase();
			page = {
				routePath: page.routePath.replace(`/${simpleName}`, `/${qualifiedNameLower}`),
				content: page.content,
			};
		}

		// Track page generation
		yield* Metric.increment(BuildMetrics.pagesGenerated);

		// Parse the generated content to extract frontmatter and body
		const parsed = matter(page.content);
		// Normalize markdown spacing to remove excessive blank lines
		const bodyContent = normalizeMarkdownSpacing(parsed.content);
		const frontmatterData = parsed.data;

		// Compute relative path from outputDir
		const relativePath = page.routePath.replace(baseRoute, "").replace(/^\//, "");
		const relativePathWithExt = `${relativePath}.mdx`;

		// Hash the content and frontmatter
		const contentHash = hashContent(bodyContent);
		const frontmatterHash = hashFrontmatter(frontmatterData);

		// Determine timestamps based on previous snapshot
		let publishedTime: string;
		let modifiedTime: string;
		let isUnchanged = false;

		const oldSnapshot = existingSnapshots.get(relativePathWithExt);

		if (!oldSnapshot) {
			// No snapshot exists - check if file exists on disk as fallback
			const absolutePath = path.join(resolvedOutputDir, relativePathWithExt);
			const fileExists = yield* fileSystem.exists(absolutePath).pipe(Effect.orElseSucceed(() => false));

			if (fileExists) {
				// File exists on disk - compare against it to preserve timestamps
				const existingContent = yield* fileSystem
					.readFileString(absolutePath)
					.pipe(Effect.orElseSucceed(() => null as string | null));

				if (existingContent !== null) {
					const { data: existingFrontmatter, content: existingBody } = matter(existingContent);
					// Apply same normalization as generated content for accurate comparison
					const normalizedExistingBody = normalizeMarkdownSpacing(existingBody);
					const existingContentHash = hashContent(normalizedExistingBody);
					const existingFrontmatterHash = hashFrontmatter(existingFrontmatter);

					if (existingContentHash === contentHash && existingFrontmatterHash === frontmatterHash) {
						// File exists and matches - preserve timestamps, skip write
						publishedTime = (existingFrontmatter["article:published_time"] as string | undefined) || buildTime;
						modifiedTime = (existingFrontmatter["article:modified_time"] as string | undefined) || buildTime;
						isUnchanged = true;
					} else {
						// File exists but content changed - preserve published, update modified
						publishedTime = (existingFrontmatter["article:published_time"] as string | undefined) || buildTime;
						modifiedTime = buildTime;
					}
				} else {
					// Read failed - treat as new file
					publishedTime = buildTime;
					modifiedTime = buildTime;
				}
			} else {
				// File doesn't exist - truly new
				publishedTime = buildTime;
				modifiedTime = buildTime;
			}
		} else if (oldSnapshot.contentHash === contentHash && oldSnapshot.frontmatterHash === frontmatterHash) {
			// NO CHANGES: Preserve both existing timestamps, skip file write
			publishedTime = oldSnapshot.publishedTime;
			modifiedTime = oldSnapshot.modifiedTime;
			isUnchanged = true;
		} else {
			// CHANGED: Preserve published time, update modified time
			publishedTime = oldSnapshot.publishedTime;
			modifiedTime = buildTime;
		}

		return {
			workItem,
			content: page.content,
			bodyContent,
			frontmatter: frontmatterData,
			contentHash,
			frontmatterHash,
			routePath: page.routePath,
			relativePathWithExt,
			publishedTime,
			modifiedTime,
			isUnchanged,
		};
	});
}

/**
 * Shared context for writeSingleFile — fields that are the same
 * for every item in a single API build.
 */
export interface WriteSingleFileContext {
	readonly resolvedOutputDir: string;
	readonly buildTime: string;
	readonly ogResolver?: import("./og-resolver.js").OpenGraphResolver | null;
	readonly siteUrl?: string;
	readonly ogImage?: import("./schemas/index.js").OpenGraphImageConfig;
	readonly packageName?: string;
	readonly apiName?: string;
}

/**
 * Write a single generated page to disk. No-op for unchanged pages.
 */
export function writeSingleFile(
	result: GeneratedPageResult,
	ctx: WriteSingleFileContext,
): Effect.Effect<FileWriteResult, never, FileSystem.FileSystem> {
	return Effect.gen(function* () {
		const fileSystem = yield* FileSystem.FileSystem;
		const { resolvedOutputDir, buildTime, ogResolver, siteUrl, ogImage, packageName, apiName } = ctx;
		const {
			workItem,
			bodyContent,
			frontmatter,
			contentHash,
			frontmatterHash,
			publishedTime,
			modifiedTime,
			isUnchanged,
			routePath,
			relativePathWithExt,
		} = result;
		const { item, categoryKey, categoryConfig, namespaceMember } = workItem;

		const absolutePath = path.join(resolvedOutputDir, relativePathWithExt);

		// Use qualified name for namespace members
		const label = namespaceMember ? namespaceMember.qualifiedName : item.displayName;

		const snapshot: FileSnapshot = {
			outputDir: resolvedOutputDir,
			filePath: relativePathWithExt,
			publishedTime,
			modifiedTime,
			contentHash,
			frontmatterHash,
			buildTime,
		};

		// Handle unchanged files - skip write
		if (isUnchanged) {
			yield* Metric.increment(BuildMetrics.filesTotal);
			yield* Metric.increment(BuildMetrics.filesUnchanged);

			return {
				relativePathWithExt,
				absolutePath,
				status: "unchanged" as const,
				snapshot,
				categoryKey,
				label,
				routePath,
			};
		}

		// Build final file content
		let finalContent = matter.stringify(bodyContent, frontmatter);

		if (ogResolver && siteUrl && packageName) {
			// Resolve OG image metadata (auto-detect dimensions from local files if possible)
			const ogImageMetadata = yield* Effect.promise(() => ogResolver.resolve(ogImage, packageName, apiName));

			const ogMetadataOptions: Parameters<typeof OpenGraphResolver.createPageMetadata>[0] = {
				siteUrl,
				pageRoute: routePath,
				description: frontmatter.description as string,
				publishedTime,
				modifiedTime,
				section: categoryConfig.displayName,
				packageName,
			};
			if (ogImageMetadata) {
				ogMetadataOptions.ogImage = ogImageMetadata;
			}
			const ogMetadata = OpenGraphResolver.createPageMetadata(ogMetadataOptions);

			// Regenerate frontmatter with OG metadata
			const newFrontmatter = generateFrontmatter(
				item.displayName,
				frontmatter.description as string,
				categoryConfig.singularName,
				apiName,
				ogMetadata,
			);

			// Combine new frontmatter with body content
			finalContent = newFrontmatter + bodyContent;
		}

		// Check if file exists before writing to determine status
		const fileExisted = yield* fileSystem.exists(absolutePath).pipe(Effect.orElseSucceed(() => false));

		// Ensure directory exists and write the file
		const dirPath = path.dirname(absolutePath);
		yield* fileSystem.makeDirectory(dirPath, { recursive: true }).pipe(Effect.orDie);
		yield* fileSystem.writeFileString(absolutePath, finalContent).pipe(Effect.orDie);

		const status: "new" | "modified" = fileExisted ? "modified" : "new";

		// Increment metrics
		yield* Metric.increment(BuildMetrics.filesTotal);
		if (status === "new") {
			yield* Metric.increment(BuildMetrics.filesNew);
		} else {
			yield* Metric.increment(BuildMetrics.filesModified);
		}

		return {
			relativePathWithExt,
			absolutePath,
			status,
			snapshot,
			categoryKey,
			label,
			routePath,
		};
	});
}

export interface WriteMetadataInput {
	readonly fileResults: readonly FileWriteResult[];
	readonly categories: Record<string, CategoryConfig>;
	readonly resolvedOutputDir: string;
	readonly existingSnapshots: Map<string, FileSnapshot>;
	readonly buildTime: string;
	readonly baseRoute: string;
	readonly packageName: string;
	readonly apiName?: string;
	readonly generatedFiles: Set<string>;
}

/**
 * Write all metadata files (_meta.json and index.mdx) for the generated API docs.
 *
 * This function handles three groups of metadata:
 * 1. Root API _meta.json — category folder entries with collapsible/collapsed settings
 * 2. Main index page (index.mdx) — API landing page, skipped if already exists
 * 3. Category _meta.json files — sorted navigation entries per category folder
 *
 * All writes use snapshot tracking (hash comparison, disk fallback, timestamp
 * preservation) to avoid unnecessary disk writes.
 *
 * The `generatedFiles` Set is mutated — entries are added for each metadata file
 * written. This is required for stale file cleanup by the caller.
 */
export function writeMetadata(
	input: WriteMetadataInput,
): Effect.Effect<void, never, FileSystem.FileSystem | SnapshotService> {
	return Effect.gen(function* () {
		const fileSystem = yield* FileSystem.FileSystem;
		const snapshotSvc = yield* SnapshotService;
		const {
			fileResults,
			categories,
			resolvedOutputDir,
			existingSnapshots,
			buildTime,
			baseRoute,
			packageName,
			generatedFiles,
		} = input;

		// ── 1. Root _meta.json ────────────────────────────────────────────────────

		// Derive which categories have items from fileResults
		const categoriesWithItems = new Set<string>();
		for (const result of fileResults) {
			categoriesWithItems.add(result.categoryKey);
		}

		const apiMetaEntries: Array<{
			type: string;
			name: string;
			label: string;
			collapsible: boolean;
			collapsed: boolean;
			overviewHeaders: number[];
		}> = [];

		for (const [categoryKey, categoryConfig] of Object.entries(categories)) {
			if (categoriesWithItems.has(categoryKey)) {
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

		const apiMetaJsonPath = path.join(resolvedOutputDir, "_meta.json");
		const apiMetaJsonRelPath = "_meta.json";
		const apiMetaJsonContent = JSON.stringify(apiMetaEntries, null, "\t");
		const apiMetaContentHash = hashContent(apiMetaJsonContent);
		const apiMetaOldSnapshot = existingSnapshots.get(apiMetaJsonRelPath);

		let apiMetaUnchanged = false;
		let apiMetaPublished: string;
		let apiMetaModified: string;

		const apiMetaFileExists = yield* fileSystem.exists(apiMetaJsonPath).pipe(Effect.orElseSucceed(() => false));

		if (!apiMetaFileExists) {
			apiMetaPublished = apiMetaOldSnapshot?.publishedTime || buildTime;
			apiMetaModified = buildTime;
			apiMetaUnchanged = false;
		} else if (!apiMetaOldSnapshot) {
			const existingContent = yield* fileSystem
				.readFileString(apiMetaJsonPath)
				.pipe(Effect.orElseSucceed(() => null as string | null));
			const existingData = existingContent
				? yield* Effect.try(() => JSON.parse(existingContent) as unknown).pipe(Effect.orElseSucceed(() => null))
				: null;
			const normalizedExisting = existingData ? JSON.stringify(existingData, null, "\t") : null;

			if (normalizedExisting === apiMetaJsonContent) {
				apiMetaPublished = "2024-01-01T00:00:00.000Z";
				apiMetaModified = "2024-01-01T00:00:00.000Z";
				apiMetaUnchanged = true;
			} else {
				apiMetaPublished = "2024-01-01T00:00:00.000Z";
				apiMetaModified = buildTime;
			}
		} else if (apiMetaOldSnapshot.contentHash === apiMetaContentHash) {
			apiMetaPublished = apiMetaOldSnapshot.publishedTime;
			apiMetaModified = apiMetaOldSnapshot.modifiedTime;
			apiMetaUnchanged = true;
		} else {
			apiMetaPublished = apiMetaOldSnapshot.publishedTime;
			apiMetaModified = buildTime;
		}

		if (!apiMetaUnchanged) {
			yield* fileSystem.writeFileString(apiMetaJsonPath, apiMetaJsonContent).pipe(Effect.orDie);
			yield* Metric.increment(BuildMetrics.filesTotal);
			if (apiMetaOldSnapshot) {
				yield* Metric.increment(BuildMetrics.filesModified);
			} else {
				yield* Metric.increment(BuildMetrics.filesNew);
			}
		} else {
			yield* Metric.increment(BuildMetrics.filesTotal);
			yield* Metric.increment(BuildMetrics.filesUnchanged);
		}

		yield* snapshotSvc
			.upsert({
				outputDir: resolvedOutputDir,
				filePath: apiMetaJsonRelPath,
				publishedTime: apiMetaPublished,
				modifiedTime: apiMetaModified,
				contentHash: apiMetaContentHash,
				frontmatterHash: "",
				buildTime,
			})
			.pipe(Effect.ignore);

		generatedFiles.add(apiMetaJsonRelPath);

		// ── 2. Main index page ────────────────────────────────────────────────────

		const categoryCounts: Record<string, number> = {};
		for (const result of fileResults) {
			categoryCounts[result.categoryKey] = (categoryCounts[result.categoryKey] || 0) + 1;
		}

		const mainIndexGenerator = new MainIndexPageGenerator();
		const mainIndex = mainIndexGenerator.generate(packageName, baseRoute, categoryCounts);

		// routePath is e.g. "/api/index" → relative path "index.mdx"
		const indexRelativePath = `${mainIndex.routePath.replace(baseRoute, "").replace(/^\//, "")}.mdx`;
		const indexAbsolutePath = path.join(resolvedOutputDir, indexRelativePath);

		const indexFileExists = yield* fileSystem.exists(indexAbsolutePath).pipe(Effect.orElseSucceed(() => false));

		if (!indexFileExists) {
			const indexDirPath = path.dirname(indexAbsolutePath);
			yield* fileSystem.makeDirectory(indexDirPath, { recursive: true }).pipe(Effect.orDie);
			yield* fileSystem.writeFileString(indexAbsolutePath, mainIndex.content).pipe(Effect.orDie);
			yield* Metric.increment(BuildMetrics.filesTotal);
			yield* Metric.increment(BuildMetrics.filesNew);
		} else {
			yield* Metric.increment(BuildMetrics.filesTotal);
			yield* Metric.increment(BuildMetrics.filesUnchanged);
		}

		generatedFiles.add("index.mdx");

		// ── 3. Category _meta.json files ──────────────────────────────────────────

		// Group fileResults by categoryKey
		const categoryMetaEntriesMap = new Map<string, Array<{ name: string; label: string }>>();
		for (const result of fileResults) {
			// Derive name: filename without extension from relativePathWithExt
			// e.g. "class/foo.mdx" → "foo"
			const baseName = path.basename(result.relativePathWithExt, ".mdx");
			const entries = categoryMetaEntriesMap.get(result.categoryKey) || [];
			entries.push({ name: baseName, label: result.label });
			categoryMetaEntriesMap.set(result.categoryKey, entries);
		}

		// Build and write each category _meta.json
		const metaSnapshots = yield* Effect.forEach(
			Array.from(categoryMetaEntriesMap.entries()),
			([categoryKey, entries]) =>
				Effect.gen(function* () {
					const categoryConfig = categories[categoryKey];
					if (!categoryConfig || entries.length === 0) return null;

					// Sort alphabetically by label
					entries.sort((a, b) => a.label.localeCompare(b.label));

					const categoryMeta = entries.map((entry) => ({
						type: "file",
						name: entry.name,
						label: entry.label,
					}));

					const categoryMetaPath = path.join(resolvedOutputDir, categoryConfig.folderName, "_meta.json");
					const relPath = path.join(categoryConfig.folderName, "_meta.json");
					const content = JSON.stringify(categoryMeta, null, "\t");
					const contentHash = hashContent(content);
					const oldSnapshot = existingSnapshots.get(relPath);

					let isUnchanged = false;
					let publishedTime: string;
					let modifiedTime: string;

					const fileExists = yield* fileSystem.exists(categoryMetaPath).pipe(Effect.orElseSucceed(() => false));

					if (!fileExists) {
						publishedTime = oldSnapshot?.publishedTime || buildTime;
						modifiedTime = buildTime;
						isUnchanged = false;
					} else if (!oldSnapshot) {
						const existingContent = yield* fileSystem
							.readFileString(categoryMetaPath)
							.pipe(Effect.orElseSucceed(() => null as string | null));
						const existingData = existingContent
							? yield* Effect.try(() => JSON.parse(existingContent) as unknown).pipe(Effect.orElseSucceed(() => null))
							: null;
						const normalizedExisting = existingData ? JSON.stringify(existingData, null, "\t") : null;

						if (normalizedExisting === content) {
							publishedTime = "2024-01-01T00:00:00.000Z";
							modifiedTime = "2024-01-01T00:00:00.000Z";
							isUnchanged = true;
						} else {
							publishedTime = "2024-01-01T00:00:00.000Z";
							modifiedTime = buildTime;
						}
					} else if (oldSnapshot.contentHash === contentHash) {
						publishedTime = oldSnapshot.publishedTime;
						modifiedTime = oldSnapshot.modifiedTime;
						isUnchanged = true;
					} else {
						publishedTime = oldSnapshot.publishedTime;
						modifiedTime = buildTime;
					}

					if (!isUnchanged) {
						const categoryDir = path.dirname(categoryMetaPath);
						yield* fileSystem.makeDirectory(categoryDir, { recursive: true }).pipe(Effect.orDie);
						yield* fileSystem.writeFileString(categoryMetaPath, content).pipe(Effect.orDie);
						yield* Metric.increment(BuildMetrics.filesTotal);
						if (oldSnapshot) {
							yield* Metric.increment(BuildMetrics.filesModified);
						} else {
							yield* Metric.increment(BuildMetrics.filesNew);
						}
					} else {
						yield* Metric.increment(BuildMetrics.filesTotal);
						yield* Metric.increment(BuildMetrics.filesUnchanged);
					}

					generatedFiles.add(relPath);

					if (isUnchanged) {
						return null;
					}

					return {
						outputDir: resolvedOutputDir,
						filePath: relPath,
						publishedTime,
						modifiedTime,
						contentHash,
						frontmatterHash: "",
						buildTime,
					};
				}),
			{ concurrency: "unbounded" },
		);

		// Batch-update all category _meta.json snapshots (filter out nulls for unchanged files)
		const metaSnapshotsToUpdate = metaSnapshots.filter((s): s is FileSnapshot => s !== null);
		if (metaSnapshotsToUpdate.length > 0) {
			yield* snapshotSvc.batchUpsert(metaSnapshotsToUpdate).pipe(Effect.ignore);
		}
	});
}

export interface CleanupAndCommitInput {
	readonly fileResults: readonly FileWriteResult[];
	readonly resolvedOutputDir: string;
	readonly generatedFiles: ReadonlySet<string>;
}

/**
 * Batch-upsert snapshots for written files, then delete stale and orphaned files
 * from disk and the snapshot database. Finally, remove any empty subdirectories.
 *
 * Steps:
 * 1. Filter fileResults to written files (status !== "unchanged"), extract snapshots,
 *    and batch-upsert them into the snapshot DB.
 * 2. Call snapshotManager.cleanupStaleFiles() to find files tracked in DB but not
 *    generated in this build, then delete them from disk.
 * 3. Read the output directory recursively; for each .mdx or _meta.json file not in
 *    generatedFiles, delete it from disk and remove its snapshot.
 * 4. After deleting orphans, remove empty subdirectories deepest-first.
 */
export function cleanupAndCommit(
	input: CleanupAndCommitInput,
): Effect.Effect<void, never, FileSystem.FileSystem | SnapshotService> {
	return Effect.gen(function* () {
		const fileSystem = yield* FileSystem.FileSystem;
		const snapshotSvc = yield* SnapshotService;
		const { fileResults, resolvedOutputDir, generatedFiles } = input;

		// 1. Batch-upsert snapshots for written (non-unchanged) files only
		const snapshotsToUpdate = fileResults.filter((r) => r.status !== "unchanged").map((r) => r.snapshot);

		if (snapshotsToUpdate.length > 0) {
			yield* snapshotSvc.batchUpsert(snapshotsToUpdate).pipe(Effect.ignore);
		}

		// 2. Stale file cleanup: files in DB but not generated in this build
		const staleFiles = yield* snapshotSvc
			.cleanupStale(resolvedOutputDir, generatedFiles)
			.pipe(Effect.orElseSucceed(() => [] as ReadonlyArray<string>));
		yield* Effect.forEach(
			staleFiles,
			(staleFile) =>
				Effect.gen(function* () {
					const fullPath = path.join(resolvedOutputDir, staleFile);
					yield* fileSystem.remove(fullPath).pipe(Effect.ignore);
					yield* Effect.logDebug(`🗑️  DELETED STALE: ${staleFile}`);
				}),
			{ concurrency: "unbounded" },
		);

		// 3. Orphan file cleanup: files on disk not tracked in generatedFiles
		const allFiles = yield* fileSystem
			.readDirectory(resolvedOutputDir, { recursive: true })
			.pipe(Effect.orElseSucceed(() => [] as string[]));
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
		yield* Effect.forEach(
			orphanedFiles,
			(orphan) =>
				Effect.gen(function* () {
					const fullPath = path.join(resolvedOutputDir, orphan);
					yield* fileSystem.remove(fullPath).pipe(Effect.ignore);
					yield* snapshotSvc.deleteSnapshot(resolvedOutputDir, orphan).pipe(Effect.ignore);
					yield* Effect.logDebug(`🗑️  DELETED ORPHAN: ${orphan}`);
				}),
			{ concurrency: "unbounded" },
		);

		// 4. Remove empty subdirectories after file deletion (deepest-first)
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
				const entries = yield* fileSystem
					.readDirectory(fullDir)
					.pipe(Effect.orElseSucceed(() => ["placeholder"] as string[]));
				if (entries.length === 0) {
					yield* fileSystem.remove(fullDir).pipe(Effect.ignore);
					yield* Effect.logDebug(`🗑️  REMOVED EMPTY DIR: ${dir}`);
				}
			}
		}
	});
}

export interface BuildPipelineInput {
	readonly workItems: readonly WorkItem[];
	readonly baseRoute: string;
	readonly packageName: string;
	readonly apiScope: string;
	readonly apiName?: string;
	readonly source?: SourceConfig;
	readonly buildTime: string;
	readonly resolvedOutputDir: string;
	readonly pageConcurrency: number;
	readonly existingSnapshots: Map<string, FileSnapshot>;
	readonly suppressExampleErrors?: boolean;
	readonly llmsPlugin?: LlmsPlugin;
	readonly ogResolver?: import("./og-resolver.js").OpenGraphResolver | null;
	readonly siteUrl?: string;
	readonly ogImage?: import("./schemas/index.js").OpenGraphImageConfig;
}

/**
 * Effect Stream pipeline: workItems → generate → write (no-op for unchanged) → fold
 *
 * Unchanged files are NOT filtered out. They flow through the write stage as
 * no-ops and appear in the fold output with status: "unchanged". This is
 * required because ALL generated files must be tracked for:
 * - generatedFiles set (stale/orphan cleanup)
 * - fileContextMap (remark plugin Twoslash error attribution)
 * - _meta.json navigation entries
 *
 * The Stream.filter only removes nulls (unsupported ApiItemKind). All other
 * items — including unchanged ones — flow through to the fold accumulator.
 */
export function buildPipelineForApi(
	input: BuildPipelineInput,
): Effect.Effect<FileWriteResult[], never, FileSystem.FileSystem> {
	const generateCtx: GenerateSinglePageContext = {
		existingSnapshots: input.existingSnapshots,
		baseRoute: input.baseRoute,
		packageName: input.packageName,
		apiScope: input.apiScope,
		...(input.apiName != null ? { apiName: input.apiName } : {}),
		...(input.source != null ? { source: input.source } : {}),
		buildTime: input.buildTime,
		resolvedOutputDir: input.resolvedOutputDir,
		...(input.suppressExampleErrors != null ? { suppressExampleErrors: input.suppressExampleErrors } : {}),
		...(input.llmsPlugin != null ? { llmsPlugin: input.llmsPlugin } : {}),
	};

	const writeCtx: WriteSingleFileContext = {
		resolvedOutputDir: input.resolvedOutputDir,
		buildTime: input.buildTime,
		...(input.ogResolver !== undefined ? { ogResolver: input.ogResolver } : {}),
		...(input.siteUrl != null ? { siteUrl: input.siteUrl } : {}),
		...(input.ogImage != null ? { ogImage: input.ogImage } : {}),
		...(input.packageName != null ? { packageName: input.packageName } : {}),
		...(input.apiName != null ? { apiName: input.apiName } : {}),
	};

	return Stream.fromIterable(input.workItems).pipe(
		// Stage 1: Generate page content + hashes + timestamps
		Stream.mapEffect((workItem) => generateSinglePage(workItem, generateCtx), {
			concurrency: input.pageConcurrency,
		}),
		// Filter nulls (unsupported item kinds only)
		Stream.filter((result): result is GeneratedPageResult => result !== null),
		// Stage 2: Write file to disk (no-op for unchanged)
		Stream.mapEffect((result) => writeSingleFile(result, writeCtx), {
			concurrency: input.pageConcurrency,
		}),
		// Fold: accumulate ALL results (unchanged + written)
		Stream.runFold([] as FileWriteResult[], (acc, result) => [...acc, result]),
	);
}
