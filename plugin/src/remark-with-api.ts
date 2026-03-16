import * as path from "node:path";
import type { Code, Parent, Root } from "mdast";
import type { MdxJsxFlowElement } from "mdast-util-mdx-jsx";
import type { ShikiTransformer } from "shiki";
import { codeToHast, hastToHtml } from "shiki";
import type { Plugin } from "unified";
import { visit } from "unist-util-visit";
import type { CodeBlockStatsCollector } from "./code-block-stats.js";
import type { DebugLogger } from "./debug-logger.js";
import { stripTwoslashDirectives } from "./markdown/helpers.js";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import { DEFAULT_SHIKI_THEMES } from "./markdown/shiki-utils.js";
import type { PerformanceManager } from "./performance-manager.js";
import type { PrettierErrorStatsCollector } from "./prettier-error-stats.js";
import { formatCode } from "./prettier-formatter.js";
import type { ShikiCrossLinker } from "./shiki-transformer.js";
import type { TwoslashErrorStatsCollector } from "./twoslash-error-stats.js";

/**
 * Supported languages for with-api code blocks
 * Based on GitHub Linguist standard aliases:
 * - TypeScript: typescript, ts
 * - JavaScript: javascript, js, node
 * - TSX/JSX: tsx, jsx (Shiki-supported)
 */
const SUPPORTED_LANGUAGES: Set<string> = new Set(["typescript", "ts", "javascript", "js", "node", "tsx", "jsx"]);

/**
 * Infer API scope from file path
 * Path structure: docs/en/{api}/**\/*.mdx
 */
function inferApiScope(filePath: string): string | undefined {
	const normalized = filePath.replace(/\\/g, "/");

	// Match pattern: docs/en/{api}/{...rest}
	// or: website/docs/en/{api}/{...rest}
	const match = normalized.match(/(?:^|\/)(docs\/en|website\/docs\/en)\/([^/]+)(?:\/|$)/);

	if (!match) {
		return undefined;
	}

	return match[2];
}

/**
 * Options for the remark with-api plugin
 */
interface RemarkWithApiOptions {
	shikiCrossLinker: ShikiCrossLinker;
	/** Getter for the shared Twoslash transformer from TwoslashManager */
	getTransformer: () => ShikiTransformer | null;
	logger?: DebugLogger;
	statsCollector?: CodeBlockStatsCollector;
	twoslashErrorStats?: TwoslashErrorStatsCollector;
	prettierErrorStats?: PrettierErrorStatsCollector;
	perfManager?: PerformanceManager;
	/** Theme configuration for Shiki highlighting */
	theme?: ShikiThemeConfig;
}

/**
 * Remark plugin that transforms `with-api` code blocks into ApiExample components
 *
 * Usage in markdown:
 * ```typescript with-api
 * import { ClaudeBinaryPlugin } from "claude-binary-plugin";
 * // Full twoslash support: @noErrors, @errors, ^?, etc.
 * ```
 *
 * The plugin:
 * 1. Detects code blocks with `with-api` in the meta string
 * 2. Supports typescript, ts, tsx, javascript, js, jsx languages
 * 3. Processes with Twoslash for type information
 * 4. Applies API docs cross-linker for type reference links
 * 5. Renders to ApiExample component with pre-rendered Shiki HAST
 */
export const remarkWithApi: Plugin<[RemarkWithApiOptions], Root> = (options: RemarkWithApiOptions) => {
	const {
		shikiCrossLinker,
		getTransformer,
		logger,
		statsCollector,
		twoslashErrorStats,
		prettierErrorStats,
		perfManager,
		theme,
	} = options;

	// Resolve theme with defaults
	const resolvedTheme = theme ?? DEFAULT_SHIKI_THEMES;

	return async function remarkTransformer(tree: Root, file: { path?: string; cwd?: string }): Promise<void> {
		const fileStart = performance.now();
		const promises: Array<Promise<void>> = [];
		let blockCount = 0;
		let needsApiExampleImport = false;

		// Detect if we're in SSG-MD (node_md) compilation environment
		const isSsgMd =
			import.meta.env?.SSG_MD ||
			process.env.RSBUILD_ENVIRONMENT === "node_md" ||
			process.env.BUILD_TARGET === "node_md";

		// Get the current file path from VFile
		const currentFilePath = file.path;

		// Infer API scope from file path for cross-linking
		if (currentFilePath) {
			const apiScope = inferApiScope(currentFilePath);
			if (apiScope) {
				shikiCrossLinker.setApiScope(apiScope);
			}
		}

		visit(tree, "code", (node: Code, index: number | undefined, parent: Parent | undefined) => {
			// Check if this is a with-api code block
			const hasWithApi = node.meta?.includes("with-api");
			const lang = node.lang || "typescript";
			const isSupported = SUPPORTED_LANGUAGES.has(lang);

			if (!hasWithApi || !isSupported) {
				return;
			}

			blockCount++;
			const promise = (async () => {
				const blockStart = performance.now();

				// Track code block processing start
				const blockId = `with-api.${blockCount}`;
				perfManager?.mark(`code.block.${blockId}.start`);

				const rawCode = node.value;

				// Set context for error collectors
				if (currentFilePath) {
					const relativePath = path.basename(currentFilePath);
					const apiScope = inferApiScope(currentFilePath);

					if (twoslashErrorStats) {
						twoslashErrorStats.setContext({
							file: relativePath,
							api: apiScope,
							blockType: "with-api",
						});
					}

					if (prettierErrorStats) {
						prettierErrorStats.setContext({
							file: relativePath,
							api: apiScope,
							blockType: "with-api",
						});
					}
				}

				// Format code with Prettier for consistent styling
				const formatResult = await formatCode(rawCode, lang, prettierErrorStats, logger);
				const code = formatResult.code;

				if (formatResult.success && formatResult.formatTime > 0) {
					logger?.debug(
						`✨ [remark-with-api] Formatted ${rawCode.length} chars in ${formatResult.formatTime.toFixed(1)}ms`,
					);
				}

				// Build transformers array - twoslash only, cross-linker runs post-process
				// Note: hideCutTransformer is intentionally NOT used here - it's only for member
				// signature blocks (3-line class/interface context) generated by page generators
				// Uses the shared TwoslashManager transformer (same one used by API page code blocks)
				const twoslashTransformer = getTransformer();
				const transformers: ShikiTransformer[] = twoslashTransformer ? [twoslashTransformer] : [];

				// Render with Shiki and Twoslash - get HAST for component rendering
				const shikiStart = performance.now();
				let hast = await codeToHast(code, {
					lang,
					meta: { __raw: "twoslash" },
					themes: {
						light: resolvedTheme.light,
						dark: resolvedTheme.dark,
					},
					defaultColor: false,
					// Namespace CSS variables to avoid conflicts with user's default code blocks
					cssVariablePrefix: "--api-shiki-",
					transformers,
				});

				// Post-process with cross-linker after Twoslash has positioned popups
				// Get API scope from file path (already set above via setApiScope)
				const apiScope = currentFilePath ? inferApiScope(currentFilePath) : undefined;
				if (apiScope) {
					hast = shikiCrossLinker.transformHast(hast, apiScope);
				}

				const shikiTime = performance.now() - shikiStart;
				const totalBlockTime = performance.now() - blockStart;

				// Track code block processing end
				perfManager?.mark(`code.block.${blockId}.end`);
				perfManager?.measure("code.block.render", `code.block.${blockId}.start`, `code.block.${blockId}.end`);
				perfManager?.increment("code.blocks.processed");
				perfManager?.increment("code.blocks.with-api");

				// Log slow blocks at debug level
				if (perfManager?.isSlow("code.block", totalBlockTime) && logger) {
					logger.debug(
						`⏱️  [remark-with-api] Slow block: ${totalBlockTime.toFixed(0)}ms (shiki: ${shikiTime.toFixed(0)}ms, ${code.length} chars)`,
					);
				}

				// Track block stats if collector is provided
				if (statsCollector) {
					statsCollector.recordBlock(totalBlockTime, shikiTime, code.length, { blockType: "with-api" });
				}

				// Replace the code block with appropriate output based on build target
				if (parent && typeof index === "number") {
					if (isSsgMd) {
						// SSG-MD mode: Keep as plain markdown code block
						// Convert HAST to HTML then extract clean code by removing all tags
						const html = hastToHtml(hast);
						const cleanCode = html
							.replace(/<[^>]*>/g, "")
							.replace(/&lt;/g, "<")
							.replace(/&gt;/g, ">")
							.replace(/&amp;/g, "&")
							.replace(/&quot;/g, '"')
							.replace(/&#39;/g, "'")
							.trim();

						// Replace with clean markdown code block
						node.lang = "typescript";
						node.meta = undefined;
						node.value = cleanCode;
						// Don't replace the node, just modify it in place
					} else {
						// Regular mode: Use ApiExample component
						// Strip Twoslash directives from code for copy functionality
						const displayCode = stripTwoslashDirectives(code);
						// Pass HAST as a JSON string - the component parses it
						const hastJson = JSON.stringify(hast);
						const mdxNode: MdxJsxFlowElement = {
							type: "mdxJsxFlowElement",
							name: "ApiExample",
							attributes: [
								{
									type: "mdxJsxAttribute",
									name: "code",
									value: displayCode,
								},
								{
									type: "mdxJsxAttribute",
									name: "hast",
									value: hastJson,
								},
							],
							children: [],
						};
						parent.children[index] = mdxNode;
						needsApiExampleImport = true;
					}
				}

				// Clear error contexts after processing this block
				if (twoslashErrorStats) {
					twoslashErrorStats.clearContext();
				}
				if (prettierErrorStats) {
					prettierErrorStats.clearContext();
				}
			})();

			promises.push(promise);
		});

		await Promise.all(promises);

		// Inject ApiExample import if needed (when not in SSG mode and we have with-api blocks)
		if (needsApiExampleImport) {
			// Check if the import already exists (cast to unknown to handle MDX node types)
			const hasApiExampleImport = tree.children.some((node) => {
				const n = node as unknown as { type: string; value?: string };
				return n.type === "mdxjsEsm" && typeof n.value === "string" && n.value.includes("ApiExample");
			});

			if (!hasApiExampleImport) {
				// Insert import at the beginning of the document (after any frontmatter)
				const importNode = {
					type: "mdxjsEsm",
					value: 'import { ApiExample } from "rspress-plugin-api-extractor/runtime";',
					data: {
						estree: {
							type: "Program",
							body: [
								{
									type: "ImportDeclaration",
									specifiers: [
										{
											type: "ImportSpecifier",
											imported: { type: "Identifier", name: "ApiExample" },
											local: { type: "Identifier", name: "ApiExample" },
										},
									],
									source: { type: "Literal", value: "rspress-plugin-api-extractor/runtime" },
								},
							],
							sourceType: "module",
						},
					},
				};

				// Find the position to insert (after frontmatter if present)
				let insertIndex = 0;
				for (let i = 0; i < tree.children.length; i++) {
					const child = tree.children[i];
					if (child.type === "yaml") {
						insertIndex = i + 1;
						break;
					}
				}

				// Cast to unknown first to avoid type conflicts between mdast and mdx types
				tree.children.splice(insertIndex, 0, importNode as unknown as (typeof tree.children)[0]);
			}
		}

		const fileTime = performance.now() - fileStart;
		if (blockCount > 0 && logger) {
			logger.verbose(
				`⏱️  [remark-with-api] Processed ${blockCount} blocks in ${fileTime.toFixed(0)}ms (avg: ${(fileTime / blockCount).toFixed(0)}ms per block)`,
			);
		}
	};
};
