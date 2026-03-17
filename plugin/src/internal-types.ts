import type { PathLike } from "node:fs";
import type { ApiModel } from "@microsoft/api-extractor-model";
import type ts from "typescript";

/**
 * Compiler options relevant to type resolution.
 * Subset of TypeScript's CompilerOptions used by the type registry and Twoslash.
 */
export interface TypeResolutionCompilerOptions {
	target?: ts.ScriptTarget;
	module?: ts.ModuleKind;
	moduleResolution?: ts.ModuleResolutionKind;
	lib?: string[];
	types?: string[];
	typeRoots?: string[];
	strict?: boolean;
	skipLibCheck?: boolean;
	esModuleInterop?: boolean;
	allowSyntheticDefaultImports?: boolean;
	jsx?: ts.JsxEmit;
}

/**
 * TypeScript configuration fields for Twoslash and type resolution.
 * Used internally by the resolution functions.
 * @internal
 */
export interface TypeScriptConfig {
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Mixin type for TypeScript configuration fields.
 * Add these fields to any configuration interface that needs TypeScript options.
 */
export interface TypeScriptConfigFields {
	/**
	 * Path to tsconfig.json file OR an async function that returns compiler options.
	 *
	 * When a path is provided:
	 * - Supports relative paths (resolved from project root)
	 * - Supports extends chains in tsconfig.json
	 * - Uses TypeScript's built-in config parsing
	 *
	 * When a function is provided:
	 * - Called during plugin initialization
	 * - Should return resolved TypeResolutionCompilerOptions
	 * - Useful for dynamic configuration or custom loading logic
	 *
	 * @example Path string
	 * ```ts
	 * tsconfig: "tsconfig.json"
	 * ```
	 *
	 * @example Async function
	 * ```ts
	 * tsconfig: async () => {
	 *   const config = await loadExternalConfig();
	 *   return { target: config.target, lib: config.libs };
	 * }
	 * ```
	 */
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);

	/**
	 * Direct compiler options to merge on top of tsconfig values.
	 * When both tsconfig and compilerOptions are provided,
	 * compilerOptions take precedence.
	 *
	 * @example
	 * ```ts
	 * compilerOptions: {
	 *   target: 99,  // ESNext
	 *   lib: ["ESNext", "DOM"],
	 *   strict: false  // Lenient for docs
	 * }
	 * ```
	 */
	compilerOptions?: TypeResolutionCompilerOptions;
}

/**
 * Result from a model loader function
 */
export interface LoadedModel {
	/** The API model */
	model: ApiModel;

	/** Optional source config returned by the loader */
	source?: import("./schemas/index.js").SourceConfig;
}

/**
 * Package.json structure (partial)
 */
export interface PackageJson {
	name?: string;
	version?: string;
	dependencies?: Record<string, string>;
	devDependencies?: Record<string, string>;
	peerDependencies?: Record<string, string>;
	[key: string]: unknown;
}
