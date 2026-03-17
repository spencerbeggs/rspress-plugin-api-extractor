/**
 * Configuration utility functions extracted from types.ts.
 * Handles dependency extraction, version conflict resolution, and config normalization.
 */

import type { PathLike } from "node:fs";
import type { ApiModel } from "@microsoft/api-extractor-model";
import { Effect } from "effect";
import { SemVer } from "semver-effect";
import type { LoadedModel, PackageJson } from "./internal-types.js";
import type { AutoDetectDependencies, ExternalPackageSpec, LlmsPlugin, VersionConfig } from "./schemas/index.js";

/**
 * Type guard to check if version value is a full VersionConfig
 */
export function isVersionConfig(
	value: PathLike | ((...args: Array<unknown>) => unknown) | VersionConfig,
): value is VersionConfig {
	return (
		typeof value === "object" &&
		value !== null &&
		!(value instanceof URL) &&
		!Buffer.isBuffer(value) &&
		"model" in value
	);
}

/**
 * Type guard to check if loader result includes source config
 */
export function isLoadedModel(result: ApiModel | LoadedModel): result is LoadedModel {
	return typeof result === "object" && result !== null && "model" in result;
}

/**
 * Normalize llmsPlugin config to always be an LlmsPlugin object
 */
export function normalizeLlmsPluginConfig(config: boolean | LlmsPlugin | undefined): LlmsPlugin {
	if (config === true) {
		return { enabled: true };
	}
	if (config === false || config === undefined) {
		return { enabled: false };
	}
	return { enabled: true, ...config };
}

/**
 * Merge LLM plugin configurations with precedence: version > API > global
 * Returns merged config with sensible defaults
 */
export function mergeLlmsPluginConfig(
	globalConfig?: boolean | LlmsPlugin,
	apiConfig?: LlmsPlugin,
	versionConfig?: LlmsPlugin,
): LlmsPlugin {
	const normalized = normalizeLlmsPluginConfig(globalConfig);
	const merged = {
		...normalized,
		...apiConfig,
		...versionConfig,
	};

	// Apply defaults if enabled
	if (merged.enabled) {
		return {
			enabled: true,
			showCopyButton: merged.showCopyButton ?? true,
			showViewOptions: merged.showViewOptions ?? true,
			copyButtonText: merged.copyButtonText ?? "Copy Markdown",
			viewOptions: merged.viewOptions ?? ["markdownLink", "chatgpt", "claude"],
		};
	}

	return { enabled: false };
}

/**
 * Common type utility packages to automatically load from devDependencies.
 * These packages provide type transformations and utilities commonly used in TypeScript projects.
 */
const TYPE_UTILITY_PACKAGES = ["type-fest", "ts-extras"] as const;

/**
 * Extract peerDependencies from PackageJson and convert to ExternalPackageSpec array.
 * This allows automatic loading of peer dependency types for documentation examples.
 *
 * @param packageJson - The parsed package.json object
 * @returns Array of external package specs from peerDependencies, or empty array if none
 *
 * @example
 * ```ts
 * const pkg = { name: "my-lib", peerDependencies: { "zod": "^3.22.4" } };
 * const external = extractPeerDependencies(pkg);
 * // Returns: [{ name: "zod", version: "^3.22.4" }]
 * ```
 */
export function extractPeerDependencies(packageJson: PackageJson | undefined): ExternalPackageSpec[] {
	if (!packageJson?.peerDependencies) {
		return [];
	}

	return Object.entries(packageJson.peerDependencies).map(([name, version]) => ({
		name,
		version,
	}));
}

/**
 * Extract type utility packages (type-fest, ts-extras) from devDependencies.
 * These packages are commonly used for type transformations and should be available in documentation examples.
 *
 * @param packageJson - The parsed package.json object
 * @returns Array of external package specs for type utilities found in devDependencies
 *
 * @example
 * ```ts
 * const pkg = { devDependencies: { "type-fest": "^4.0.0", "ts-extras": "^0.12.0" } };
 * const external = extractTypeUtilities(pkg);
 * // Returns: [{ name: "type-fest", version: "^4.0.0" }, { name: "ts-extras", version: "^0.12.0" }]
 * ```
 */
export function extractTypeUtilities(packageJson: PackageJson | undefined): ExternalPackageSpec[] {
	if (!packageJson?.devDependencies) {
		return [];
	}

	const utilities: ExternalPackageSpec[] = [];

	for (const utilityName of TYPE_UTILITY_PACKAGES) {
		const version = packageJson.devDependencies[utilityName];
		if (version) {
			utilities.push({ name: utilityName, version });
		}
	}

	return utilities;
}

/**
 * Extract all automatically-detected external packages from package.json.
 * Controlled by AutoDetectDependencies to determine which dependency types to include.
 *
 * @param packageJson - The parsed package.json object
 * @param options - Options controlling which dependency types to include
 * @returns Array of all external package specs to load for documentation
 *
 * @example
 * ```ts
 * const pkg = {
 *   dependencies: { "effect": "^3.0.0" },
 *   peerDependencies: { "zod": "^3.22.4" },
 *   devDependencies: { "type-fest": "^4.0.0" }
 * };
 *
 * // Default: only peerDependencies + type utilities
 * extractAutoDetectedPackages(pkg);
 * // Returns: [{ name: "zod", version: "^3.22.4" }, { name: "type-fest", version: "^4.0.0" }]
 *
 * // Include all dependency types
 * extractAutoDetectedPackages(pkg, { dependencies: true, peerDependencies: true, autoDependencies: true });
 * // Returns: [{ name: "effect", ... }, { name: "zod", ... }, { name: "type-fest", ... }]
 * ```
 */
export function extractAutoDetectedPackages(
	packageJson: PackageJson | undefined,
	options: AutoDetectDependencies = {},
): ExternalPackageSpec[] {
	const { dependencies = false, devDependencies = false, peerDependencies = true, autoDependencies = true } = options;

	const packages: ExternalPackageSpec[] = [];

	// Add dependencies
	if (dependencies && packageJson?.dependencies) {
		packages.push(...Object.entries(packageJson.dependencies).map(([name, version]) => ({ name, version })));
	}

	// Add devDependencies (excluding type utilities which are handled separately)
	if (devDependencies && packageJson?.devDependencies) {
		packages.push(
			...Object.entries(packageJson.devDependencies)
				.filter(
					([name]) =>
						!autoDependencies || !TYPE_UTILITY_PACKAGES.includes(name as (typeof TYPE_UTILITY_PACKAGES)[number]),
				)
				.map(([name, version]) => ({ name, version })),
		);
	}

	// Add peerDependencies
	if (peerDependencies) {
		packages.push(...extractPeerDependencies(packageJson));
	}

	// Add type utilities from devDependencies
	if (autoDependencies) {
		packages.push(...extractTypeUtilities(packageJson));
	}

	// Resolve version conflicts by picking the highest version
	return resolvePackageVersionConflicts(packages);
}

/**
 * Deduplicate external packages by name, resolving to the highest version when conflicts exist.
 * Uses semver-effect to pick the highest version from duplicates.
 *
 * @param packages - Array of external package specs (may contain duplicates)
 * @returns Deduplicated array with highest versions
 *
 * @example
 * ```ts
 * const packages = [
 *   { name: "zod", version: "^3.22.4" },
 *   { name: "zod", version: "^3.23.0" },
 *   { name: "effect", version: "^3.0.0" }
 * ];
 * const resolved = resolvePackageVersionConflicts(packages);
 * // Returns: [{ name: "zod", version: "^3.23.0" }, { name: "effect", version: "^3.0.0" }]
 * ```
 */
export function resolvePackageVersionConflicts(packages: ExternalPackageSpec[]): ExternalPackageSpec[] {
	const packageMap = new Map<string, string[]>();

	// Group versions by package name
	for (const pkg of packages) {
		const versions = packageMap.get(pkg.name) || [];
		versions.push(pkg.version);
		packageMap.set(pkg.name, versions);
	}

	// Resolve to highest version for each package
	const resolved: ExternalPackageSpec[] = [];
	for (const [name, versions] of packageMap) {
		// If only one version, use it
		if (versions.length === 1) {
			resolved.push({ name, version: versions[0] });
			continue;
		}

		// Use semver-effect to find the highest satisfying version
		const highestVersion = findHighestVersion(versions);
		resolved.push({ name, version: highestVersion });
	}

	return resolved;
}

/**
 * Strip range prefixes (^, ~, >=, etc.) from a version string to get a clean semver.
 */
function stripRangePrefix(version: string): string {
	return version.replace(/^[~^>=<]+\s*/, "");
}

/**
 * Find the highest version from a list of version specifiers using semver-effect.
 * Handles version ranges (^, ~, >, <, etc.) and exact versions.
 *
 * @param versions - Array of version strings (can be ranges or exact versions)
 * @returns The highest version specifier
 *
 * @example
 * ```ts
 * findHighestVersion(["^3.22.4", "^3.23.0", "3.22.5"])
 * // Returns: "^3.23.0"
 * ```
 */
function findHighestVersion(versions: string[]): string {
	// Parse all versions to get their base versions
	const parsedVersions: Array<{ original: string; version: SemVer.SemVer }> = [];

	for (const version of versions) {
		const cleaned = stripRangePrefix(version);
		const result = Effect.runSyncExit(SemVer.fromString(cleaned));
		if (result._tag === "Success") {
			parsedVersions.push({ original: version, version: result.value });
		}
	}

	// If we couldn't parse any versions, return the last one as fallback
	if (parsedVersions.length === 0) {
		return versions[versions.length - 1];
	}

	// Sort by version using semver-effect comparison (descending)
	parsedVersions.sort((a, b) => {
		if (SemVer.gt(a.version, b.version)) return -1;
		if (SemVer.lt(a.version, b.version)) return 1;
		return 0;
	});

	// Return the original version string with the highest version
	return parsedVersions[0].original;
}

/**
 * Validate that manually specified externalPackages don't conflict with peerDependencies.
 * Throws an error if a package appears in both with different versions.
 *
 * @param externalPackages - Manually specified external packages
 * @param packageJson - The parsed package.json object
 * @throws Error if versions conflict
 *
 * @example
 * ```ts
 * const external = [{ name: "zod", version: "3.22.4" }];
 * const pkg = { peerDependencies: { "zod": "^3.22.4" } };
 * validateExternalPackages(external, pkg);
 * // Throws if versions conflict
 * ```
 */
export function validateExternalPackages(
	externalPackages: ExternalPackageSpec[] | undefined,
	packageJson: PackageJson | undefined,
): void {
	if (!externalPackages || !packageJson?.peerDependencies) {
		return;
	}

	const conflicts: Array<{ name: string; external: string; peer: string }> = [];

	for (const pkg of externalPackages) {
		const peerVersion = packageJson.peerDependencies[pkg.name];
		if (peerVersion && peerVersion !== pkg.version) {
			conflicts.push({
				name: pkg.name,
				external: pkg.version,
				peer: peerVersion,
			});
		}
	}

	if (conflicts.length > 0) {
		const details = conflicts
			.map((c) => `  - ${c.name}: externalPackages="${c.external}" vs peerDependencies="${c.peer}"`)
			.join("\n");
		throw new Error(
			`Version conflict detected between externalPackages and peerDependencies:\n${details}\n\n` +
				`Remove conflicting entries from externalPackages to use peerDependencies versions automatically.`,
		);
	}
}
