import fs from "node:fs";
import path from "node:path";
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
import { Effect, Metric } from "effect";
import matter from "gray-matter";
import { BuildMetrics } from "./layers/ObservabilityLive.js";
import type { NamespaceMember } from "./loader.js";
import { ApiParser } from "./loader.js";
import {
	ClassPageGenerator,
	EnumPageGenerator,
	FunctionPageGenerator,
	InterfacePageGenerator,
	NamespacePageGenerator,
	TypeAliasPageGenerator,
	VariablePageGenerator,
} from "./markdown/index.js";
import { SnapshotManager } from "./snapshot-manager.js";
import type { CategoryConfig, LlmsPluginOptions, SourceConfig } from "./types.js";
import { parallelLimit } from "./utils.js";

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

export interface FileSnapshot {
	readonly outputDir: string;
	readonly filePath: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly buildTime: string;
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

export interface GeneratePagesInput {
	readonly workItems: readonly WorkItem[];
	readonly existingSnapshots: Map<string, import("./snapshot-manager.js").FileSnapshot>;
	readonly baseRoute: string;
	readonly packageName: string;
	readonly apiScope: string;
	readonly apiName?: string;
	readonly source?: SourceConfig;
	readonly buildTime: string;
	readonly resolvedOutputDir: string;
	readonly pageConcurrency: number;
	readonly suppressExampleErrors?: boolean;
	readonly llmsPlugin?: LlmsPluginOptions;
}

/**
 * Generate page content for each work item, parse frontmatter, hash content,
 * and resolve timestamps from existing snapshots.
 *
 * For each WorkItem:
 * 1. Creates the appropriate page generator and calls `.generate()` based on `item.kind`
 * 2. For namespace members, transforms the route path to use the qualified name
 * 3. Increments BuildMetrics.pagesGenerated
 * 4. Parses the generated content via matter() (gray-matter)
 * 5. Normalizes markdown spacing
 * 6. Hashes content and frontmatter via SnapshotManager static methods
 * 7. Resolves timestamps from existing snapshots or disk fallback
 */
export async function generatePages(input: GeneratePagesInput): Promise<(GeneratedPageResult | null)[]> {
	const {
		workItems,
		existingSnapshots,
		baseRoute,
		packageName,
		apiScope,
		apiName,
		source,
		buildTime,
		resolvedOutputDir,
		pageConcurrency,
		suppressExampleErrors,
		llmsPlugin,
	} = input;

	return parallelLimit(
		workItems as WorkItem[],
		pageConcurrency,
		async (workItem: WorkItem): Promise<GeneratedPageResult | null> => {
			const { item, categoryConfig, namespaceMember } = workItem;
			let page: { routePath: string; content: string } | null = null;

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
			Effect.runSync(Metric.increment(BuildMetrics.pagesGenerated));

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
		},
	);
}

export interface WriteFilesInput {
	readonly pages: readonly (GeneratedPageResult | null)[];
	readonly resolvedOutputDir: string;
	readonly baseRoute: string;
	readonly buildTime: string;
	readonly pageConcurrency: number;
	readonly ogResolver?: import("./og-resolver.js").OpenGraphResolver | null;
	readonly siteUrl?: string;
	readonly ogImage?: import("./types.js").OpenGraphImageConfig;
	readonly packageName?: string;
	readonly apiName?: string;
}

/**
 * Write changed files to disk, resolving OG metadata where configured,
 * and return FileWriteResult[] for metadata/snapshot tracking.
 *
 * For each GeneratedPageResult:
 * - If unchanged: skip write, increment metrics, return status "unchanged"
 * - If changed:
 *   1. Optionally resolve OG metadata and regenerate frontmatter
 *   2. Write the file to disk (creating directories as needed)
 *   3. Determine status: "new" if file didn't exist, "modified" if it did
 *   4. Increment appropriate metrics
 */
export async function writeFiles(input: WriteFilesInput): Promise<FileWriteResult[]> {
	const { pages, resolvedOutputDir, buildTime, pageConcurrency, ogResolver, siteUrl, ogImage, packageName, apiName } =
		input;

	// Filter out null results
	const validPages = pages.filter((p): p is GeneratedPageResult => p !== null);

	return parallelLimit(validPages, pageConcurrency, async (result: GeneratedPageResult): Promise<FileWriteResult> => {
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
			Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
			Effect.runSync(Metric.increment(BuildMetrics.filesUnchanged));

			return {
				relativePathWithExt,
				absolutePath,
				status: "unchanged",
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
			const ogImageMetadata = await ogResolver.resolve(ogImage, packageName, apiName);

			const { OpenGraphResolver } = await import("./og-resolver.js");
			const ogMetadata = OpenGraphResolver.createPageMetadata({
				siteUrl,
				pageRoute: routePath,
				description: frontmatter.description as string,
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
				frontmatter.description as string,
				categoryConfig.singularName,
				apiName,
				ogMetadata,
			);

			// Combine new frontmatter with body content
			finalContent = newFrontmatter + bodyContent;
		}

		// Check if file exists before writing to determine status
		const fileExisted = await fs.promises
			.access(absolutePath)
			.then(() => true)
			.catch(() => false);

		// Ensure directory exists and write the file
		const dirPath = path.dirname(absolutePath);
		await fs.promises.mkdir(dirPath, { recursive: true });
		await fs.promises.writeFile(absolutePath, finalContent, "utf-8");

		const status: "new" | "modified" = fileExisted ? "modified" : "new";

		// Increment metrics
		Effect.runSync(Metric.increment(BuildMetrics.filesTotal));
		if (status === "new") {
			Effect.runSync(Metric.increment(BuildMetrics.filesNew));
		} else {
			Effect.runSync(Metric.increment(BuildMetrics.filesModified));
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
