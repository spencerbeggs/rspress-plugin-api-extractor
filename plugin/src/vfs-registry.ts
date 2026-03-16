/**
 * VFS Registry - Module-scoped registry for Virtual File System data.
 *
 * This registry stores VFS configurations keyed by output directory path prefix.
 * It is populated during the `beforeBuild` hook and accessed by the remark plugin
 * during MDX compilation for on-demand Twoslash rendering in development mode.
 *
 * @module vfs-registry
 */

import type { Highlighter, ShikiTransformer } from "shiki";
import type { VirtualFileSystem } from "type-registry-effect";
import type { ShikiThemeConfig } from "./markdown/shiki-utils.js";
import type { ShikiCrossLinker } from "./shiki-transformer.js";

/**
 * Configuration stored for each API in the registry.
 */
export interface VfsConfig {
	/** Virtual file system containing TypeScript declarations */
	vfs: Map<string, VirtualFileSystem>;
	/** Shiki highlighter instance */
	highlighter: Highlighter;
	/** Transformer for Twoslash type information */
	twoslashTransformer?: ShikiTransformer;
	/** Cross-linker instance for post-processing HAST (replaces crossLinkTransformer) */
	crossLinker?: ShikiCrossLinker;
	/** Transformer for hiding context lines in member signatures */
	hideCutTransformer?: ShikiTransformer;
	/** Transformer for hiding cut directive and preceding import lines */
	hideCutLinesTransformer?: ShikiTransformer;
	/** Package name for the API */
	packageName: string;
	/** API scope identifier (e.g., "claude-binary-plugin") */
	apiScope: string;
	/** Theme configuration for Shiki highlighting */
	theme?: ShikiThemeConfig;
}

/**
 * Module-scoped registry for VFS configurations.
 *
 * This is a singleton registry that stores VFS data keyed by:
 * - API scope (e.g., "claude-binary-plugin")
 *
 * The registry is designed to be:
 * - Written to during `beforeBuild` (when VFS is generated)
 * - Read from during MDX compilation (when remark plugin transforms code blocks)
 * - Thread-safe for reads (VFS is immutable after registration)
 */
class VfsRegistryImpl {
	/**
	 * Map of API scope -> VFS configuration
	 */
	private readonly configs = new Map<string, VfsConfig>();

	/**
	 * Register a VFS configuration for an API scope.
	 *
	 * @param apiScope - The API scope identifier (e.g., "claude-binary-plugin")
	 * @param config - The VFS configuration to register
	 */
	register(apiScope: string, config: VfsConfig): void {
		this.configs.set(apiScope, config);
	}

	/**
	 * Get the VFS configuration for an API scope.
	 *
	 * @param apiScope - The API scope to look up
	 * @returns The VFS configuration, or undefined if not found
	 */
	get(apiScope: string): VfsConfig | undefined {
		return this.configs.get(apiScope);
	}

	/**
	 * Get the VFS configuration by matching a file path to an API scope.
	 *
	 * This method extracts the API scope from a file path and returns
	 * the corresponding VFS configuration.
	 *
	 * @param filePath - The absolute file path being processed
	 * @returns The VFS configuration, or undefined if not found
	 */
	getByFilePath(filePath: string): VfsConfig | undefined {
		const apiScope = this.extractApiScope(filePath);
		if (!apiScope) {
			return undefined;
		}
		return this.get(apiScope);
	}

	/**
	 * Extract the API scope from a file path.
	 *
	 * Path patterns:
	 * - docs/en/{api}/**\/*.mdx
	 * - website/docs/en/{api}/**\/*.mdx
	 *
	 * @param filePath - The file path to extract from
	 * @returns The API scope, or undefined if not matched
	 */
	private extractApiScope(filePath: string): string | undefined {
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
	 * Check if any VFS configurations are registered.
	 *
	 * @returns True if at least one configuration is registered
	 */
	hasConfigs(): boolean {
		return this.configs.size > 0;
	}

	/**
	 * Get all registered API scopes.
	 *
	 * @returns Array of registered API scope identifiers
	 */
	getScopes(): string[] {
		return Array.from(this.configs.keys());
	}

	/**
	 * Clear all registered configurations.
	 *
	 * This should be called between builds to avoid stale data.
	 */
	clear(): void {
		this.configs.clear();
	}
}

/**
 * Global VFS Registry singleton instance.
 *
 * Use this to register and retrieve VFS configurations:
 *
 * @example
 * ```ts
 * // In beforeBuild hook:
 * VfsRegistry.register("claude-binary-plugin", {
 *   vfs: combinedVfs,
 *   highlighter,
 *   twoslashTransformer,
 *   crossLinker: shikiCrossLinker,
 *   packageName: "claude-binary-plugin",
 *   apiScope: "claude-binary-plugin",
 * });
 *
 * // In remark plugin:
 * const config = VfsRegistry.getByFilePath(file.path);
 * if (config) {
 *   // Generate HAST with Shiki, then post-process with cross-linker
 *   let hast = await generateShikiHast(code, config.highlighter, transformers);
 *   if (hast && config.crossLinker) {
 *     hast = config.crossLinker.transformHast(hast, config.apiScope);
 *   }
 * }
 * ```
 */
export const VfsRegistry: VfsRegistryImpl = new VfsRegistryImpl();
