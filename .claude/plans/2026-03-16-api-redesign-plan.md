# API Redesign Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the plugin config API to support `api` (single, with multiVersion + i18n) and `apis` (multi, no versioning) modes, with automatic path derivation from RSPress config.

**Architecture:** Replace the current `apis: ApiModelConfig | VersionedApiModelConfig | Array<...>` with a discriminated `api` vs `apis` field. Extract path derivation into a dedicated module that reads RSPress config. Update plugin.ts config parsing to use the new types. All downstream code (page generation, markdown, runtime) is unchanged.

**Tech Stack:** TypeScript, Vitest, RSPress 2.0 plugin API

**Spec:** `.claude/plans/2026-03-16-api-redesign-spec.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `plugin/src/types.ts` | Modify | Replace config interfaces (new `SingleApiConfig`, `MultiApiConfig`; remove `VersionedApiModelConfig`, `docsDir` from configs) |
| `plugin/src/path-derivation.ts` | Create | Compute output dirs and routes from RSPress config + plugin config |
| `plugin/src/path-derivation.test.ts` | Create | Tests for path derivation logic |
| `plugin/src/config-validation.ts` | Create | Startup validation (mutual exclusion, version key matching, etc.) |
| `plugin/src/config-validation.test.ts` | Create | Tests for validation logic |
| `plugin/src/plugin.ts` | Modify | Update config hook and beforeBuild to use new types + path derivation |
| `plugin/src/index.ts` | Modify | Update type exports |
| `docs-site/rspress.config.ts` | Modify | Switch from `apis: [...]` to `api: { ... }` |

---

## Chunk 1: New Config Types

### Task 1: Define new config interfaces in types.ts

**Files:**
- Modify: `plugin/src/types.ts`

- [ ] **Step 1: Add SingleApiConfig interface**

Insert after the existing `TypeScriptConfigFields` interface (around line 87). This replaces the combination of `ApiModelConfig` + `VersionedApiModelConfig` for single-package sites:

```typescript
/**
 * Single API configuration (supports RSPress multiVersion + i18n).
 * Used with the `api` field in plugin options.
 */
export interface SingleApiConfig {
	/** Package name for display purposes */
	packageName: string;

	/** Human-readable display name for page titles. Defaults to packageName. */
	name?: string;

	/**
	 * Base route path. Defaults to "/".
	 * API docs appear at {baseRoute}/{apiFolder}/...
	 */
	baseRoute?: string;

	/** Subfolder for API docs. Defaults to "api". Null for flat routes. */
	apiFolder?: string | null;

	/**
	 * Path to .api.json file. Required for non-versioned sites.
	 * Ignored when RSPress multiVersion is active (each version provides its own model).
	 */
	model?: PathLike | (() => Promise<ApiModel | LoadedModel>);

	/** Path to package.json for type loading */
	packageJson?: PathLike | (() => Promise<PackageJson>);

	/**
	 * Per-version overrides. Required when RSPress multiVersion is active.
	 * Keys must exactly match config.multiVersion.versions.
	 * Accepts full VersionConfig or shorthand path/loader.
	 */
	versions?: Record<string, PathLike | (() => Promise<ApiModel | LoadedModel>) | VersionConfig>;

	theme?: string | { light: string; dark: string } | Record<string, unknown>;
	categories?: Record<string, CategoryConfig>;
	source?: SourceConfig;
	externalPackages?: ExternalPackageSpec[];
	autoDetectDependencies?: AutoDetectDependenciesOptions;
	ogImage?: OpenGraphImageConfig;
	llmsPlugin?: LlmsPluginOptions;
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
	compilerOptions?: TypeResolutionCompilerOptions;
}
```

- [ ] **Step 2: Add MultiApiConfig interface**

Insert after `SingleApiConfig`:

```typescript
/**
 * Multi-API configuration (no versioning support).
 * Used with the `apis` field in plugin options.
 */
export interface MultiApiConfig {
	/** Package name for display purposes */
	packageName: string;

	/** Human-readable display name for page titles. Defaults to packageName. */
	name?: string;

	/**
	 * Base route path. Defaults to unscoped packageName.
	 * "@spencerbeggs/foobar" -> "/foobar"
	 */
	baseRoute?: string;

	/** Subfolder for API docs. Defaults to "api". Null for flat routes. */
	apiFolder?: string | null;

	/** Path to .api.json file */
	model: PathLike | (() => Promise<ApiModel | LoadedModel>);

	/** Path to package.json for type loading */
	packageJson?: PathLike | (() => Promise<PackageJson>);

	theme?: string | { light: string; dark: string } | Record<string, unknown>;
	categories?: Record<string, CategoryConfig>;
	source?: SourceConfig;
	externalPackages?: ExternalPackageSpec[];
	autoDetectDependencies?: AutoDetectDependenciesOptions;
	ogImage?: OpenGraphImageConfig;
	llmsPlugin?: LlmsPluginOptions;
	tsconfig?: PathLike | (() => Promise<TypeResolutionCompilerOptions>);
	compilerOptions?: TypeResolutionCompilerOptions;
}
```

- [ ] **Step 3: Update ApiExtractorPluginOptions**

Replace the current `apis` field (line 904) with the new discriminated union. Remove top-level `tsconfig` and `compilerOptions`:

```typescript
export interface ApiExtractorPluginOptions {
	/** Single API mode (supports RSPress multiVersion + i18n) */
	api?: SingleApiConfig;

	/** Multi-API mode (no versioning) */
	apis?: MultiApiConfig[];

	siteUrl?: string;
	ogImage?: OpenGraphImageConfig;
	defaultCategories?: Record<string, CategoryConfig>;
	errors?: ErrorConfig;
	llmsPlugin?: boolean | LlmsPluginOptions;
	logLevel?: LogLevel;
	performance?: PerformanceConfig;
	logFile?: string;
}
```

- [ ] **Step 4: Remove old types and update type guards**

Delete these interfaces and functions (search by name, not line numbers, since earlier edits shift lines):
- Delete `ApiModelConfig` interface
- Delete `VersionedApiModelConfig` interface
- Delete `isVersionedApiModel` function
- Delete `normalizeApis` function

Keep these (still needed):
- `VersionConfig` — reused in `SingleApiConfig.versions`
- `isVersionConfig` — needed for version shorthand detection
- `isLoadedModel` — used in plugin.ts model loading

- [ ] **Step 6: Commit**

```bash
git add plugin/src/types.ts
git commit -m "refactor: replace config interfaces with SingleApiConfig and MultiApiConfig

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 2: Path Derivation

### Task 2: Create path derivation module with tests

**Files:**
- Create: `plugin/src/path-derivation.ts`
- Create: `plugin/src/path-derivation.test.ts`

- [ ] **Step 1: Write failing tests for path derivation**

```typescript
// plugin/src/path-derivation.test.ts
import { describe, expect, it } from "vitest";
import { deriveOutputPaths, normalizeBaseRoute, unscopedName } from "./path-derivation.js";

describe("unscopedName", () => {
	it("strips scope from scoped packages", () => {
		expect(unscopedName("@spencerbeggs/foobar")).toBe("foobar");
	});
	it("returns unscoped names as-is", () => {
		expect(unscopedName("foobar")).toBe("foobar");
	});
});

describe("normalizeBaseRoute", () => {
	it("adds leading slash", () => {
		expect(normalizeBaseRoute("foobar")).toBe("/foobar");
	});
	it("strips trailing slash", () => {
		expect(normalizeBaseRoute("/foobar/")).toBe("/foobar");
	});
	it("preserves clean routes", () => {
		expect(normalizeBaseRoute("/foobar")).toBe("/foobar");
	});
});

describe("deriveOutputPaths", () => {
	const docsRoot = "docs";

	describe("single-API mode", () => {
		it("no i18n, no versioning", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/api", routeBase: "/api", version: undefined, locale: undefined },
			]);
		});

		it("with i18n", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: ["en", "zh"],
				defaultLang: "en",
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/en/api", routeBase: "/api", version: undefined, locale: "en" },
				{ outputDir: "docs/zh/api", routeBase: "/zh/api", version: undefined, locale: "zh" },
			]);
		});

		it("with multiVersion", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: ["v1", "v2"],
				defaultVersion: "v2",
			});
			expect(result).toEqual([
				{ outputDir: "docs/v1/api", routeBase: "/v1/api", version: "v1", locale: undefined },
				{ outputDir: "docs/v2/api", routeBase: "/api", version: "v2", locale: undefined },
			]);
		});

		it("with i18n + multiVersion", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: "api",
				locales: ["en", "zh"],
				defaultLang: "en",
				versions: ["v1", "v2"],
				defaultVersion: "v2",
			});
			expect(result).toHaveLength(4);
			expect(result).toContainEqual(
				{ outputDir: "docs/v2/en/api", routeBase: "/api", version: "v2", locale: "en" },
			);
			expect(result).toContainEqual(
				{ outputDir: "docs/v1/zh/api", routeBase: "/v1/zh/api", version: "v1", locale: "zh" },
			);
		});

		it("with custom baseRoute", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/docs",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/docs/api", routeBase: "/docs/api", version: undefined, locale: undefined },
			]);
		});

		it("with apiFolder null", () => {
			const result = deriveOutputPaths({
				mode: "single",
				docsRoot,
				baseRoute: "/",
				apiFolder: null,
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs", routeBase: "/", version: undefined, locale: undefined },
			]);
		});
	});

	describe("multi-API mode", () => {
		it("derives path from baseRoute", () => {
			const result = deriveOutputPaths({
				mode: "multi",
				docsRoot,
				baseRoute: "/foobar",
				apiFolder: "api",
				locales: [],
				defaultLang: undefined,
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/foobar/api", routeBase: "/foobar/api", version: undefined, locale: undefined },
			]);
		});

		it("with i18n", () => {
			const result = deriveOutputPaths({
				mode: "multi",
				docsRoot,
				baseRoute: "/foobar",
				apiFolder: "api",
				locales: ["en", "zh"],
				defaultLang: "en",
				versions: [],
				defaultVersion: undefined,
			});
			expect(result).toEqual([
				{ outputDir: "docs/en/foobar/api", routeBase: "/foobar/api", version: undefined, locale: "en" },
				{ outputDir: "docs/zh/foobar/api", routeBase: "/zh/foobar/api", version: undefined, locale: "zh" },
			]);
		});
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run plugin/src/path-derivation.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement path derivation and utility functions**

```typescript
// plugin/src/path-derivation.ts
import path from "node:path";

/** Extract unscoped name from a potentially scoped package name */
export function unscopedName(packageName: string): string {
	return packageName.startsWith("@") ? packageName.split("/")[1] ?? packageName : packageName;
}

/** Normalize baseRoute: ensure leading slash, strip trailing slash */
export function normalizeBaseRoute(route: string): string {
	const withSlash = route.startsWith("/") ? route : `/${route}`;
	return withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
}

export interface PathDerivationInput {
	mode: "single" | "multi";
	docsRoot: string;
	baseRoute: string;
	apiFolder: string | null;
	locales: string[];
	defaultLang: string | undefined;
	versions: string[];
	defaultVersion: string | undefined;
}

export interface DerivedPath {
	outputDir: string;
	routeBase: string;
	version: string | undefined;
	locale: string | undefined;
}

export function deriveOutputPaths(input: PathDerivationInput): DerivedPath[] {
	const { docsRoot, baseRoute, apiFolder, locales, defaultLang, versions, defaultVersion } = input;
	const results: DerivedPath[] = [];

	const folder = apiFolder ?? undefined;
	const baseSegment = baseRoute === "/" ? undefined : baseRoute.replace(/^\//, "");

	const versionList = versions.length > 0 ? versions : [undefined];
	const localeList = locales.length > 0 ? locales : [undefined];

	for (const version of versionList) {
		for (const locale of localeList) {
			// Build filesystem path: {root}/{version}/{locale}/{baseRoute}/{apiFolder}
			const dirParts = [docsRoot, version, locale, baseSegment, folder].filter(
				(p): p is string => p !== undefined,
			);
			const outputDir = dirParts.length > 0 ? path.join(...dirParts) : docsRoot;

			// Build route: /{version}/{locale}/{baseRoute}/{apiFolder}
			// Default version and default locale prefixes are stripped
			const isDefaultVersion = version === defaultVersion;
			const isDefaultLocale = locale === defaultLang;

			const routeParts = [
				!isDefaultVersion ? version : undefined,
				!isDefaultLocale ? locale : undefined,
				baseSegment,
				folder,
			].filter((p): p is string => p !== undefined);

			const routeBase = routeParts.length > 0 ? `/${routeParts.join("/")}` : "/";

			results.push({ outputDir, routeBase, version, locale });
		}
	}

	return results;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run plugin/src/path-derivation.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/src/path-derivation.ts plugin/src/path-derivation.test.ts
git commit -m "feat: add path derivation module for automatic docsDir computation

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 3: Config Validation

### Task 3: Create config validation module with tests

**Files:**
- Create: `plugin/src/config-validation.ts`
- Create: `plugin/src/config-validation.test.ts`

- [ ] **Step 1: Write failing tests for validation**

```typescript
// plugin/src/config-validation.test.ts
import { describe, expect, it } from "vitest";
import { validatePluginOptions } from "./config-validation.js";

describe("validatePluginOptions", () => {
	it("errors when both api and apis provided", () => {
		expect(() =>
			validatePluginOptions(
				{ api: { packageName: "foo", model: "x" }, apis: [{ packageName: "bar", model: "y" }] } as any,
				{},
			),
		).toThrow("Cannot provide both 'api' and 'apis'");
	});

	it("errors when neither api nor apis provided", () => {
		expect(() => validatePluginOptions({} as any, {})).toThrow(
			"Must provide either 'api' or 'apis'",
		);
	});

	it("errors when apis used with multiVersion", () => {
		expect(() =>
			validatePluginOptions(
				{ apis: [{ packageName: "foo", model: "x" }] },
				{ multiVersion: { default: "v1", versions: ["v1"] } },
			),
		).toThrow("multiVersion is not supported with 'apis'");
	});

	it("errors when multiVersion active but no versions map", () => {
		expect(() =>
			validatePluginOptions(
				{ api: { packageName: "foo", model: "x" } },
				{ multiVersion: { default: "v1", versions: ["v1"] } },
			),
		).toThrow("'versions' is required when multiVersion is active");
	});

	it("errors when version keys don't match multiVersion.versions", () => {
		expect(() =>
			validatePluginOptions(
				{ api: { packageName: "foo", versions: { v1: { model: "x" } } } },
				{ multiVersion: { default: "v1", versions: ["v1", "v2"] } },
			),
		).toThrow("must exactly match");
	});

	it("errors when api.versions has extra keys", () => {
		expect(() =>
			validatePluginOptions(
				{ api: { packageName: "foo", versions: { v1: { model: "x" }, v2: { model: "y" }, v3: { model: "z" } } } },
				{ multiVersion: { default: "v1", versions: ["v1", "v2"] } },
			),
		).toThrow("must exactly match");
	});

	it("warns when versions provided without multiVersion", () => {
		const warnings: string[] = [];
		validatePluginOptions(
			{ api: { packageName: "foo", model: "x", versions: { v1: { model: "y" } } } },
			{},
			(msg: string) => warnings.push(msg),
		);
		expect(warnings[0]).toContain("versions");
	});

	it("errors when single-api model missing without multiVersion", () => {
		expect(() =>
			validatePluginOptions({ api: { packageName: "foo" } } as any, {}),
		).toThrow("'model' is required");
	});

	it("passes valid single-api config", () => {
		expect(() =>
			validatePluginOptions({ api: { packageName: "foo", model: "x" } }, {}),
		).not.toThrow();
	});

	it("passes valid multi-api config", () => {
		expect(() =>
			validatePluginOptions({ apis: [{ packageName: "foo", model: "x" }] }, {}),
		).not.toThrow();
	});

	it("passes valid versioned single-api config", () => {
		expect(() =>
			validatePluginOptions(
				{ api: { packageName: "foo", versions: { v1: { model: "x" }, v2: { model: "y" } } } },
				{ multiVersion: { default: "v2", versions: ["v1", "v2"] } },
			),
		).not.toThrow();
	});
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
pnpm vitest run plugin/src/config-validation.test.ts
```

Expected: FAIL (module not found)

- [ ] **Step 3: Implement validation**

```typescript
// plugin/src/config-validation.ts
import type { ApiExtractorPluginOptions } from "./types.js";

interface RspressMultiVersion {
	default: string;
	versions: string[];
}

interface RspressConfigSubset {
	multiVersion?: RspressMultiVersion;
}

export function validatePluginOptions(
	options: ApiExtractorPluginOptions,
	rspressConfig: RspressConfigSubset,
	warn: (msg: string) => void = console.warn,
): void {
	const { api, apis } = options;
	const { multiVersion } = rspressConfig;

	// Mutual exclusion
	if (api && apis) {
		throw new Error("Cannot provide both 'api' and 'apis'. Use 'api' for single-package sites or 'apis' for multi-package portals.");
	}
	if (!api && !apis) {
		throw new Error("Must provide either 'api' or 'apis'.");
	}

	// Multi-API mode validation
	if (apis) {
		if (multiVersion) {
			throw new Error("multiVersion is not supported with 'apis' (multi-API mode). Use 'api' (single-API mode) for versioned documentation.");
		}
		return;
	}

	// Single-API mode validation
	if (api) {
		if (multiVersion) {
			if (!api.versions) {
				throw new Error("'versions' is required when multiVersion is active. Each version in multiVersion.versions must have a corresponding entry.");
			}

			const pluginKeys = new Set(Object.keys(api.versions));
			const rspressKeys = new Set(multiVersion.versions);

			if (pluginKeys.size !== rspressKeys.size || ![...pluginKeys].every((k) => rspressKeys.has(k))) {
				throw new Error(
					`api.versions keys [${[...pluginKeys].join(", ")}] must exactly match multiVersion.versions [${[...rspressKeys].join(", ")}].`,
				);
			}
		} else {
			if (api.versions) {
				warn("api.versions is provided but RSPress multiVersion is not configured. Versions will be ignored.");
			}
			if (!api.model) {
				throw new Error("'model' is required when multiVersion is not active.");
			}
		}
	}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
pnpm vitest run plugin/src/config-validation.test.ts
```

Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add plugin/src/config-validation.ts plugin/src/config-validation.test.ts
git commit -m "feat: add config validation for api/apis mutual exclusion and version matching

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 4: Plugin Integration

### Task 4: Update plugin.ts to use new config types

**Files:**
- Modify: `plugin/src/plugin.ts`

This is the largest task. The changes are in two areas:
1. The `config` hook (lines 1884-1973) — where RSPress config is captured
2. The `beforeBuild` hook (lines 1323-1882) — where APIs are processed

- [ ] **Step 1: Update imports in plugin.ts**

At the top of plugin.ts, update imports from types.ts:

- Remove: `ApiModelConfig`, `VersionedApiModelConfig`, `isVersionedApiModel`, `normalizeApis`
- Add: `SingleApiConfig`, `MultiApiConfig`, `unscopedName`, `normalizeBaseRoute`
- Add: `import { validatePluginOptions } from "./config-validation.js"`
- Add: `import { deriveOutputPaths } from "./path-derivation.js"`

- [ ] **Step 2: Update the config hook (lines ~1884-1973)**

Replace the current `normalizeApis` + `docsDir`/`baseRoute` derivation. The config hook captures RSPress config and pre-creates directories.

**Delete:** `computeOutputDir` and `computeRouteBase` helper functions (lines ~99-116) — replaced by `path-derivation.ts`.

**New config hook logic:**

```typescript
config(userConfig) {
  // 1. Validate early
  validatePluginOptions(options, userConfig);

  // 2. Read RSPress config
  const docsRoot = userConfig.root ?? "docs";
  const locales = (userConfig.locales ?? []).map((l) => l.lang);
  const defaultLang = userConfig.lang;
  const multiVersion = userConfig.multiVersion;
  const versions = multiVersion?.versions ?? [];
  const defaultVersion = multiVersion?.default;

  // 3. Store for use in beforeBuild
  // (use module-level variables or closure, same pattern as current code)
  capturedDocsRoot = docsRoot;
  capturedLocales = locales;
  capturedDefaultLang = defaultLang;
  capturedMultiVersion = multiVersion;

  // 4. Derive paths and pre-create directories
  if (options.api) {
    const baseRoute = normalizeBaseRoute(options.api.baseRoute ?? "/");
    const paths = deriveOutputPaths({
      mode: "single",
      docsRoot,
      baseRoute,
      apiFolder: options.api.apiFolder ?? "api",
      locales,
      defaultLang,
      versions,
      defaultVersion,
    });
    for (const p of paths) {
      fs.mkdirSync(p.outputDir, { recursive: true });
    }
  } else if (options.apis) {
    for (const apiConfig of options.apis) {
      const baseRoute = normalizeBaseRoute(
        apiConfig.baseRoute ?? `/${unscopedName(apiConfig.packageName)}`,
      );
      const paths = deriveOutputPaths({
        mode: "multi",
        docsRoot,
        baseRoute,
        apiFolder: apiConfig.apiFolder ?? "api",
        locales,
        defaultLang,
        versions: [],
        defaultVersion: undefined,
      });
      for (const p of paths) {
        fs.mkdirSync(p.outputDir, { recursive: true });
      }
    }
  }

  // 5. Rest of config hook (remark plugins, etc.) stays the same
  return { /* existing remark plugin config */ };
}
```

- [ ] **Step 3: Update the beforeBuild hook (lines ~1323-1882)**

The beforeBuild hook is the main processing loop. The key variable used downstream is the `apiConfigs` array — an internal normalized representation with `baseRoute`, `outputDir`, `model`, etc. The goal is to populate `apiConfigs` from the new types while keeping all downstream processing unchanged.

**Replace the current `normalizeApis` + iteration block (lines ~1361-1582) with:**

```typescript
// Build the internal apiConfigs array from new config types
const apiConfigs: InternalApiConfig[] = [];

if (options.api) {
  const apiConfig = options.api;
  const baseRoute = normalizeBaseRoute(apiConfig.baseRoute ?? "/");

  if (capturedMultiVersion) {
    // Versioned single-API: one entry per version
    for (const [versionKey, versionValue] of Object.entries(apiConfig.versions!)) {
      const vConfig = isVersionConfig(versionValue)
        ? versionValue
        : { model: versionValue };

      const paths = deriveOutputPaths({
        mode: "single",
        docsRoot: capturedDocsRoot,
        baseRoute,
        apiFolder: apiConfig.apiFolder ?? "api",
        locales: capturedLocales,
        defaultLang: capturedDefaultLang,
        versions: [versionKey],
        defaultVersion: capturedMultiVersion.default,
      });

      // For each locale path (or single path if no i18n)
      for (const p of paths) {
        apiConfigs.push({
          // Merge parent config with version overrides
          name: apiConfig.name ?? apiConfig.packageName,
          packageName: apiConfig.packageName,
          model: vConfig.model,
          packageJson: vConfig.packageJson ?? apiConfig.packageJson,
          baseRoute: p.routeBase,
          outputDir: p.outputDir,
          docsRoot: capturedDocsRoot,
          theme: apiConfig.theme,
          categories: vConfig.categories ?? apiConfig.categories,
          source: vConfig.source ?? apiConfig.source,
          externalPackages: vConfig.externalPackages ?? apiConfig.externalPackages,
          autoDetectDependencies: vConfig.autoDetectDependencies ?? apiConfig.autoDetectDependencies,
          ogImage: vConfig.ogImage ?? apiConfig.ogImage,
          tsconfig: vConfig.tsconfig ?? apiConfig.tsconfig,
          compilerOptions: vConfig.compilerOptions ?? apiConfig.compilerOptions,
          version: p.version,
          locale: p.locale,
        });
      }
    }
  } else {
    // Non-versioned single-API
    const paths = deriveOutputPaths({
      mode: "single",
      docsRoot: capturedDocsRoot,
      baseRoute,
      apiFolder: apiConfig.apiFolder ?? "api",
      locales: capturedLocales,
      defaultLang: capturedDefaultLang,
      versions: [],
      defaultVersion: undefined,
    });

    for (const p of paths) {
      apiConfigs.push({
        name: apiConfig.name ?? apiConfig.packageName,
        packageName: apiConfig.packageName,
        model: apiConfig.model!,
        packageJson: apiConfig.packageJson,
        baseRoute: p.routeBase,
        outputDir: p.outputDir,
        docsRoot: capturedDocsRoot,
        theme: apiConfig.theme,
        categories: apiConfig.categories,
        source: apiConfig.source,
        externalPackages: apiConfig.externalPackages,
        autoDetectDependencies: apiConfig.autoDetectDependencies,
        ogImage: apiConfig.ogImage,
        tsconfig: apiConfig.tsconfig,
        compilerOptions: apiConfig.compilerOptions,
        version: undefined,
        locale: p.locale,
      });
    }
  }
} else if (options.apis) {
  // Multi-API mode
  for (const apiConfig of options.apis) {
    const baseRoute = normalizeBaseRoute(
      apiConfig.baseRoute ?? `/${unscopedName(apiConfig.packageName)}`,
    );
    const paths = deriveOutputPaths({
      mode: "multi",
      docsRoot: capturedDocsRoot,
      baseRoute,
      apiFolder: apiConfig.apiFolder ?? "api",
      locales: capturedLocales,
      defaultLang: capturedDefaultLang,
      versions: [],
      defaultVersion: undefined,
    });

    for (const p of paths) {
      apiConfigs.push({
        name: apiConfig.name ?? apiConfig.packageName,
        packageName: apiConfig.packageName,
        model: apiConfig.model,
        packageJson: apiConfig.packageJson,
        baseRoute: p.routeBase,
        outputDir: p.outputDir,
        docsRoot: capturedDocsRoot,
        theme: apiConfig.theme,
        categories: apiConfig.categories,
        source: apiConfig.source,
        externalPackages: apiConfig.externalPackages,
        autoDetectDependencies: apiConfig.autoDetectDependencies,
        ogImage: apiConfig.ogImage,
        tsconfig: apiConfig.tsconfig,
        compilerOptions: apiConfig.compilerOptions,
        version: undefined,
        locale: p.locale,
      });
    }
  }
}

// All downstream code uses apiConfigs — model loading, VFS, page generation unchanged
```

The `InternalApiConfig` type is the normalized internal representation that all downstream code already works with. Match its shape to whatever the current code uses in the `apiConfigs` array (check the object shape at lines ~1481-1502 and ~1555-1580).

**Key principle:** The refactor boundary is at the `apiConfigs` array. Everything above it (config parsing, path derivation) changes. Everything below it (model loading, VFS, Shiki, page generation) stays the same.

- [ ] **Step 4: Run the full build to verify**

```bash
pnpm --filter rspress-plugin-api-extractor run build
```

Expected: Build succeeds

- [ ] **Step 5: Run existing tests**

```bash
pnpm --filter rspress-plugin-api-extractor run test
```

Fix any failures caused by the type changes.

- [ ] **Step 6: Commit**

```bash
git add plugin/src/plugin.ts
git commit -m "refactor: update plugin.ts to use new api/apis config with path derivation

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 5: Update index.ts exports

**Files:**
- Modify: `plugin/src/index.ts`

- [ ] **Step 1: Update type exports**

Remove exports of `ApiModelConfig`, `VersionedApiModelConfig`, `isVersionedApiModel`, `normalizeApis`.

Add exports of `SingleApiConfig`, `MultiApiConfig`, `unscopedName`, `normalizeBaseRoute`.

Keep exports of `VersionConfig`, `isVersionConfig`, and all other existing exports.

- [ ] **Step 2: Commit**

```bash
git add plugin/src/index.ts
git commit -m "refactor: update public type exports for new config API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 5: Docs Site Update & Verification

### Task 6: Update docs-site to use new config

**Files:**
- Modify: `docs-site/rspress.config.ts`

- [ ] **Step 1: Switch from apis array to single api**

Replace the current config:

```typescript
ApiExtractorPlugin({
  logLevel: "debug",
  apis: [
    {
      name: "Example Module",
      packageName: "example-module",
      model: path.join(__dirname, "../example-module/dist/npm/example-module.api.json"),
      packageJson: path.join(__dirname, "../example-module/dist/npm/package.json"),
      tsconfig: path.join(__dirname, "../example-module/tsconfig.json"),
      docsDir: path.join(__dirname, "docs/example-module"),
      apiFolder: "api",
      baseRoute: "/example-module",
      theme: { ... },
    },
  ],
}),
```

With:

```typescript
ApiExtractorPlugin({
  logLevel: "debug",
  api: {
    name: "Example Module",
    packageName: "example-module",
    model: path.join(__dirname, "../example-module/dist/npm/example-module.api.json"),
    packageJson: path.join(__dirname, "../example-module/dist/npm/package.json"),
    tsconfig: path.join(__dirname, "../example-module/tsconfig.json"),
    apiFolder: "api",
    theme: {
      light: "github-light-default",
      dark: "github-dark-default",
    },
  },
}),
```

**Route change:** `docsDir` and `baseRoute` are removed — derived automatically. In single-API mode, baseRoute defaults to `"/"` so the API docs move from `/example-module/api/...` to `/api/...`. This is intentional — the docs-site is now a single-package site. Update the landing page link in `docs-site/docs/index.md` accordingly (change `/example-module/api/` to `/api/`).

Also update the `dev.mts` and `preview.mts` scripts to open `http://localhost:{PORT}/api/` instead of `http://localhost:{PORT}/example-module`.

- [ ] **Step 2: Commit**

```bash
git add docs-site/rspress.config.ts
git commit -m "refactor: update docs-site to use new single-api config

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 7: Full end-to-end verification

- [ ] **Step 1: Run all tests**

```bash
pnpm run test
```

- [ ] **Step 2: Build all workspaces**

```bash
pnpm run build
```

Expected: example-module builds, plugin builds, docs-site builds with generated API pages.

- [ ] **Step 3: Verify docs-site output**

```bash
ls docs-site/docs/api/ 2>/dev/null || ls docs-site/docs/example-module/api/
```

Verify API pages are generated in the correct derived directory.

- [ ] **Step 4: Run dev server to visually verify**

```bash
NO_OPEN=1 pnpm dev &
sleep 5
curl -s http://localhost:4173/api/ | head -5
kill %1
```

- [ ] **Step 5: Commit any fixes**

Stage only the specific files that were fixed (do not use `git add -A`):

```bash
git add plugin/src/ docs-site/
git commit -m "chore: verify end-to-end build with new config API

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
