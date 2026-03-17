import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import ts from "typescript";
import type { TypeResolutionCompilerOptions } from "./internal-types.js";

/**
 * Error thrown when tsconfig.json parsing fails.
 */
export class TsConfigParseError extends Error {
	constructor(
		public readonly configPath: string,
		message: string,
		public readonly cause?: unknown,
	) {
		super(`Failed to parse tsconfig at ${configPath}: ${message}`);
		this.name = "TsConfigParseError";
	}
}

/**
 * Result of parsing a tsconfig.json file.
 */
export interface TsConfigParseResult {
	/** Resolved compiler options */
	compilerOptions: TypeResolutionCompilerOptions;
	/** Path to the resolved config file */
	configPath: string;
	/** All extended config paths in resolution order (base to derived) */
	extendedPaths: string[];
}

/**
 * Parse a tsconfig.json file and extract compiler options relevant for type resolution.
 *
 * This function uses TypeScript's native config parsing which automatically handles:
 * - `extends` chains (resolves and merges all extended configs)
 * - Comments in JSON (JSONC support)
 * - Relative path resolution
 *
 * @param configPath - Path to tsconfig.json (relative or absolute)
 * @param projectRoot - Project root directory for resolving relative paths
 * @returns Parsed compiler options
 * @throws TsConfigParseError if the config cannot be read or parsed
 *
 * @example
 * ```ts
 * const options = parseTsConfig("tsconfig.json", "/path/to/project");
 * // Returns: { target: 99, module: 99, lib: ["ESNext", "DOM"], ... }
 * ```
 */
export function parseTsConfig(configPath: string, projectRoot: string): TypeResolutionCompilerOptions {
	const result = parseTsConfigWithMetadata(configPath, projectRoot);
	return result.compilerOptions;
}

/**
 * Parse a tsconfig.json file and return detailed metadata including extended paths.
 *
 * @param configPath - Path to tsconfig.json (relative or absolute)
 * @param projectRoot - Project root directory for resolving relative paths
 * @returns Parse result with compiler options and metadata
 * @throws TsConfigParseError if the config cannot be read or parsed
 *
 * @example
 * ```ts
 * const result = parseTsConfigWithMetadata("tsconfig.json", "/path/to/project");
 * console.log(result.configPath);      // Absolute path to resolved config
 * console.log(result.extendedPaths);   // ["base.json", "tsconfig.json"]
 * console.log(result.compilerOptions); // Merged compiler options
 * ```
 */
export function parseTsConfigWithMetadata(configPath: string, projectRoot: string): TsConfigParseResult {
	// Resolve absolute path
	const absolutePath = isAbsolute(configPath) ? configPath : resolve(projectRoot, configPath);

	// Verify file exists
	if (!existsSync(absolutePath)) {
		throw new TsConfigParseError(absolutePath, "File not found");
	}

	// Read the config file
	const configFileContent = ts.readConfigFile(absolutePath, (path) => readFileSync(path, "utf-8"));

	if (configFileContent.error) {
		const message = ts.flattenDiagnosticMessageText(configFileContent.error.messageText, "\n");
		throw new TsConfigParseError(absolutePath, message, configFileContent.error);
	}

	// Parse JSON config content with extends chain resolution
	const configDir = dirname(absolutePath);
	const parsedConfig = ts.parseJsonConfigFileContent(
		configFileContent.config,
		ts.sys,
		configDir,
		undefined, // existing options
		absolutePath, // config file name for error messages
	);

	// Check for parsing errors (filtering out "no inputs found" which is expected
	// when parsing tsconfig in isolation for compiler options only)
	const significantErrors = parsedConfig.errors.filter((error) => {
		const message = ts.flattenDiagnosticMessageText(error.messageText, "\n");
		// TS18003: No inputs were found in config file
		return error.code !== 18003 && !message.includes("No inputs were found");
	});

	if (significantErrors.length > 0) {
		const errorMessages = significantErrors
			.map((error) => ts.flattenDiagnosticMessageText(error.messageText, "\n"))
			.join("; ");
		throw new TsConfigParseError(absolutePath, errorMessages, significantErrors);
	}

	// Track extended paths
	const extendedPaths: string[] = [absolutePath];

	// Extract and collect extended paths from the raw config
	collectExtendedPaths(configFileContent.config, configDir, extendedPaths);

	// Convert TypeScript CompilerOptions to our subset
	const tsOptions = parsedConfig.options;
	const compilerOptions = extractTypeResolutionOptions(tsOptions);

	return {
		compilerOptions,
		configPath: absolutePath,
		extendedPaths,
	};
}

/**
 * Recursively collect extended config paths.
 * @internal
 */
function collectExtendedPaths(config: unknown, baseDir: string, paths: string[]): void {
	if (!config || typeof config !== "object") {
		return;
	}

	const configObj = config as Record<string, unknown>;
	const extendsValue = configObj.extends;

	if (typeof extendsValue === "string") {
		const extendedPath = resolveExtendedPath(extendsValue, baseDir);
		if (extendedPath && !paths.includes(extendedPath)) {
			paths.unshift(extendedPath); // Add to beginning (base configs first)
		}
	} else if (Array.isArray(extendsValue)) {
		// TypeScript 5.0+ supports array extends
		for (const ext of extendsValue) {
			if (typeof ext === "string") {
				const extendedPath = resolveExtendedPath(ext, baseDir);
				if (extendedPath && !paths.includes(extendedPath)) {
					paths.unshift(extendedPath);
				}
			}
		}
	}
}

/**
 * Resolve an extended config path.
 * @internal
 */
function resolveExtendedPath(extendsValue: string, baseDir: string): string | null {
	try {
		// If it starts with ./ or ../, resolve relative to baseDir
		if (extendsValue.startsWith(".")) {
			return resolve(baseDir, extendsValue);
		}
		// If it's a package path, try to resolve it
		// TypeScript handles this internally, we just note it exists
		return extendsValue;
	} catch {
		return null;
	}
}

/**
 * Extract TypeResolutionCompilerOptions from full TypeScript CompilerOptions.
 * @internal
 */
function extractTypeResolutionOptions(tsOptions: ts.CompilerOptions): TypeResolutionCompilerOptions {
	const options: TypeResolutionCompilerOptions = {};

	// Map target
	if (tsOptions.target !== undefined) {
		options.target = tsOptions.target;
	}

	// Map module
	if (tsOptions.module !== undefined) {
		options.module = tsOptions.module;
	}

	// Map moduleResolution
	if (tsOptions.moduleResolution !== undefined) {
		options.moduleResolution = tsOptions.moduleResolution;
	}

	// Map lib (convert from enum values to string names)
	if (tsOptions.lib !== undefined && tsOptions.lib.length > 0) {
		options.lib = tsOptions.lib;
	}

	// Map boolean options
	if (tsOptions.strict !== undefined) {
		options.strict = tsOptions.strict;
	}

	if (tsOptions.skipLibCheck !== undefined) {
		options.skipLibCheck = tsOptions.skipLibCheck;
	}

	if (tsOptions.esModuleInterop !== undefined) {
		options.esModuleInterop = tsOptions.esModuleInterop;
	}

	if (tsOptions.allowSyntheticDefaultImports !== undefined) {
		options.allowSyntheticDefaultImports = tsOptions.allowSyntheticDefaultImports;
	}

	// Map jsx
	if (tsOptions.jsx !== undefined) {
		options.jsx = tsOptions.jsx;
	}

	// Map types
	if (tsOptions.types !== undefined && tsOptions.types.length > 0) {
		options.types = tsOptions.types;
	}

	return options;
}
