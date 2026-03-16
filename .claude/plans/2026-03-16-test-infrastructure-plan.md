# Test Infrastructure Expansion Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand from 1 example module + 1 test site to 3 modules + 4 sites covering single-API, multi-API, multiVersion, and i18n.

**Architecture:** Move existing `example-module/` and `docs-site/` into `modules/` and `sites/` directories via `git mv`. Create two new versioned modules with TypeScript source. Scaffold three new RSPress test sites from the existing site template. Update workspace config, turbo, scripts, and gitignore.

**Tech Stack:** pnpm workspaces, Turborepo, RSPress 2.0, @savvy-web/rslib-builder, TypeScript

**Spec:** `.claude/plans/2026-03-16-test-infrastructure-spec.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `example-module/` | git mv to `modules/kitchensink/` | Rename + update package name |
| `docs-site/` | git mv to `sites/basic/` | Rename + update model paths |
| `modules/versioned-v1/` | Create | Lightweight v1 module |
| `modules/versioned-v2/` | Create | Breaking changes from v1 |
| `sites/versioned/` | Create | RSPress + multiVersion |
| `sites/i18n/` | Create | RSPress + locales |
| `sites/multi/` | Create | RSPress + multiple APIs |
| `pnpm-workspace.yaml` | Modify | `modules/*`, `sites/*`, `plugin` |
| `tsconfig.json` | Modify | References to all modules |
| `package.json` | Modify | New dev/preview scripts |
| `turbo.json` | Modify | Exclude sites from default build |
| `.gitignore` | Modify | Generated docs paths for new sites |
| `CLAUDE.md` | Modify | Updated workspace table |

---

## Chunk 1: Move Existing Workspaces

### Task 1: Move example-module to modules/kitchensink

**Files:**
- Move: `example-module/` -> `modules/kitchensink/`
- Modify: `modules/kitchensink/package.json`

- [ ] **Step 1: Create modules directory and git mv**

```bash
mkdir -p modules
git mv example-module modules/kitchensink
```

- [ ] **Step 2: Update package.json**

In `modules/kitchensink/package.json`:
- Change `"name"` from `"example-module"` to `"kitchensink"`
- Change `"description"` to `"Kitchen sink example module demonstrating all API Extractor features"`
- Change `"repository.directory"` from `"example-module"` to `"modules/kitchensink"`

- [ ] **Step 3: Commit**

```bash
git add modules/kitchensink/package.json
git commit -m "refactor: move example-module to modules/kitchensink

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 2: Move docs-site to sites/basic

**Files:**
- Move: `docs-site/` -> `sites/basic/`
- Modify: `sites/basic/rspress.config.ts`
- Modify: `sites/basic/package.json`

- [ ] **Step 1: Create sites directory and git mv**

```bash
mkdir -p sites
git mv docs-site sites/basic
```

- [ ] **Step 2: Update rspress.config.ts model paths**

Change all `../example-module/` references to `../../modules/kitchensink/`:
- `model: path.join(__dirname, "../../modules/kitchensink/dist/npm/kitchensink.api.json")`
- `packageJson: path.join(__dirname, "../../modules/kitchensink/dist/npm/package.json")`
- `tsconfig: path.join(__dirname, "../../modules/kitchensink/tsconfig.json")`

Also update `packageName` from `"example-module"` to `"kitchensink"` and `name` from `"Example Module"` to `"Kitchen Sink"`.

- [ ] **Step 3: Update package.json name**

Change `"name"` from `"docs-site"` to `"basic"`.

- [ ] **Step 4: Commit**

```bash
git add sites/basic/
git commit -m "refactor: move docs-site to sites/basic and update paths

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 3: Update workspace config and root files

**Files:**
- Modify: `pnpm-workspace.yaml`
- Modify: `tsconfig.json`
- Modify: `package.json`
- Modify: `.gitignore`

- [ ] **Step 1: Update pnpm-workspace.yaml**

Change from:
```yaml
packages:
  - plugin
  - example-module
  - docs-site
```

To:
```yaml
packages:
  - plugin
  - modules/*
  - sites/*
```

- [ ] **Step 2: Update root tsconfig.json**

Change references from `example-module` to `modules/kitchensink`:
```json
{
  "$schema": "https://json.schemastore.org/tsconfig.json",
  "files": [],
  "references": [
    { "path": "plugin" },
    { "path": "modules/kitchensink" }
  ]
}
```

- [ ] **Step 3: Update root package.json scripts**

Replace `docs-site` filter with `basic`:
- `"dev": "pnpm --filter basic run dev"`
- `"preview": "pnpm --filter basic run preview"`

Add new site-specific scripts:
- `"dev:basic": "pnpm --filter basic run dev"`
- `"dev:versioned": "pnpm --filter versioned run dev"`
- `"dev:i18n": "pnpm --filter i18n run dev"`
- `"dev:multi": "pnpm --filter multi run dev"`
- `"preview:basic": "pnpm --filter basic run preview"`
- `"preview:versioned": "pnpm --filter versioned run preview"`
- `"preview:i18n": "pnpm --filter i18n run preview"`
- `"preview:multi": "pnpm --filter multi run preview"`

- [ ] **Step 4: Update .gitignore**

Replace:
```
docs-site/docs/example-module/
docs-site/docs/api/
docs-site/.rspress/
```

With:
```
sites/*/docs/api/
sites/*/docs/*/api/
sites/*/.rspress/
```

- [ ] **Step 5: Run pnpm install to relink workspaces**

```bash
pnpm install
```

- [ ] **Step 6: Verify build still works**

```bash
pnpm --filter kitchensink run build
pnpm --filter rspress-plugin-api-extractor run build
pnpm --filter basic run build
```

- [ ] **Step 7: Commit**

```bash
git add pnpm-workspace.yaml tsconfig.json package.json .gitignore pnpm-lock.yaml
git commit -m "refactor: update workspace config for modules/sites structure

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 2: Versioned Modules

### Task 4: Create modules/versioned-v1

**Files:**
- Create: `modules/versioned-v1/package.json`
- Create: `modules/versioned-v1/tsconfig.json`
- Create: `modules/versioned-v1/tsdoc.json`
- Create: `modules/versioned-v1/rslib.config.ts`
- Create: `modules/versioned-v1/turbo.json`
- Create: `modules/versioned-v1/src/index.ts`

- [ ] **Step 1: Create package.json**

Based on `modules/kitchensink/package.json` but simplified:

```json
{
  "name": "versioned-v1",
  "version": "1.0.0",
  "private": true,
  "description": "Versioned module v1 — baseline API for version testing",
  "repository": {
    "type": "git",
    "url": "https://github.com/spencerbeggs/rspress-plugin-api-extractor.git",
    "directory": "modules/versioned-v1"
  },
  "license": "MIT",
  "author": {
    "name": "C. Spencer Beggs",
    "email": "spencer@beggs.codes",
    "url": "https://spencerbeg.gs"
  },
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "build": "turbo run build:dev build:prod",
    "build:dev": "rslib build --config-loader native --env-mode dev",
    "build:prod": "rslib build --config-loader native --env-mode npm",
    "types:check": "tsgo --noEmit"
  },
  "devDependencies": {
    "@microsoft/api-extractor": "^7.55.2",
    "@rslib/core": "^0.19.3",
    "@savvy-web/rslib-builder": "^0.7.0",
    "@types/node": "^25.1.0",
    "@typescript/native-preview": "7.0.0-dev.20260128.1"
  }
}
```

- [ ] **Step 2: Copy tsconfig.json and tsdoc.json from kitchensink**

```bash
cp modules/kitchensink/tsconfig.json modules/versioned-v1/tsconfig.json
cp modules/kitchensink/tsdoc.json modules/versioned-v1/tsdoc.json
```

- [ ] **Step 3: Copy and update turbo.json from kitchensink**

```bash
cp modules/kitchensink/turbo.json modules/versioned-v1/turbo.json
```

No changes needed — same task graph.

- [ ] **Step 4: Create rslib.config.ts with name transform**

```typescript
import { NodeLibraryBuilder } from "@savvy-web/rslib-builder";

export default NodeLibraryBuilder.create({
	apiModel: true,
	transform({ pkg }) {
		pkg.name = "versioned-module";
		delete pkg.devDependencies;
		delete pkg.scripts;
		return pkg;
	},
});
```

- [ ] **Step 5: Create src/index.ts**

```typescript
/**
 * Application configuration options.
 *
 * @public
 */
export interface Config {
	/** Application name */
	name: string;
	/** Port to listen on */
	port: number;
	/** Enable debug mode */
	debug?: boolean;
	/** Log output path */
	logPath?: string;
}

/**
 * Log severity levels.
 *
 * @public
 */
export enum LogLevel {
	/** Debug messages */
	Debug = 0,
	/** Informational messages */
	Info = 1,
	/** Warning messages */
	Warn = 2,
	/** Error messages */
	Error = 3,
}

/**
 * Application logger.
 *
 * @public
 */
export class Logger {
	private level: LogLevel;

	constructor(level: LogLevel = LogLevel.Info) {
		this.level = level;
	}

	/** Log a debug message */
	log(message: string): void {
		if (this.level <= LogLevel.Debug) {
			console.log(`[LOG] ${message}`);
		}
	}

	/** Log a warning message */
	warn(message: string): void {
		if (this.level <= LogLevel.Warn) {
			console.warn(`[WARN] ${message}`);
		}
	}

	/** Log an error message */
	error(message: string): void {
		console.error(`[ERROR] ${message}`);
	}
}

/**
 * Plugin function signature.
 *
 * @public
 */
export type Plugin = (config: Config) => void;

/**
 * Create and start the application.
 *
 * @param config - Application configuration
 * @returns A cleanup function
 *
 * @public
 */
export function createApp(config: Config): () => void {
	const logger = new Logger();
	logger.log(`Starting ${config.name} on port ${config.port}`);
	return () => {
		logger.log(`Stopping ${config.name}`);
	};
}
```

- [ ] **Step 6: Commit**

```bash
git add modules/versioned-v1/
git commit -m "feat: add versioned-v1 module — baseline API for version testing

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 5: Create modules/versioned-v2

**Files:**
- Create: `modules/versioned-v2/package.json`
- Create: `modules/versioned-v2/tsconfig.json`
- Create: `modules/versioned-v2/tsdoc.json`
- Create: `modules/versioned-v2/rslib.config.ts`
- Create: `modules/versioned-v2/turbo.json`
- Create: `modules/versioned-v2/src/index.ts`

- [ ] **Step 1: Create package.json**

Same as v1 but with name `"versioned-v2"` and version `"2.0.0"`:
- `"name": "versioned-v2"`
- `"version": "2.0.0"`
- `"description": "Versioned module v2 — breaking changes for version testing"`
- `"repository.directory": "modules/versioned-v2"`

- [ ] **Step 2: Copy tsconfig.json, tsdoc.json, turbo.json from v1**

```bash
cp modules/versioned-v1/tsconfig.json modules/versioned-v2/tsconfig.json
cp modules/versioned-v1/tsdoc.json modules/versioned-v2/tsdoc.json
cp modules/versioned-v1/turbo.json modules/versioned-v2/turbo.json
```

- [ ] **Step 3: Copy rslib.config.ts from v1**

Same config — `pkg.name = "versioned-module"` in transform.

```bash
cp modules/versioned-v1/rslib.config.ts modules/versioned-v2/rslib.config.ts
```

- [ ] **Step 4: Create src/index.ts with breaking changes**

```typescript
/**
 * Application configuration options.
 * Breaking change: `port` renamed to `listen`, `logPath` removed, new fields added.
 *
 * @public
 */
export interface Config {
	/** Application name */
	appName: string;
	/** Address and port to listen on */
	listen: { host: string; port: number };
	/** Enable verbose output */
	verbose?: boolean;
	/** Middleware stack to apply */
	middleware?: Middleware[];
}

/**
 * Log severity levels.
 * Breaking change: `Debug` removed, `Trace` and `Fatal` added.
 *
 * @public
 */
export enum LogLevel {
	/** Trace-level messages (most verbose) */
	Trace = 0,
	/** Informational messages */
	Info = 1,
	/** Warning messages */
	Warn = 2,
	/** Error messages */
	Error = 3,
	/** Fatal messages (application will exit) */
	Fatal = 4,
}

/**
 * Middleware function signature.
 * New in v2.
 *
 * @public
 */
export interface Middleware {
	/** Middleware name for debugging */
	name: string;
	/** Execute the middleware */
	execute(ctx: Record<string, unknown>): Promise<void>;
}

/**
 * Application logger.
 * Breaking change: `log()` replaced by `info()`, new `setLevel()` method.
 *
 * @public
 */
export class Logger {
	private level: LogLevel;

	constructor(level: LogLevel = LogLevel.Info) {
		this.level = level;
	}

	/** Set the current log level */
	setLevel(level: LogLevel): void {
		this.level = level;
	}

	/** Log an informational message (replaces v1 `log()`) */
	info(message: string): void {
		if (this.level <= LogLevel.Info) {
			console.info(`[INFO] ${message}`);
		}
	}

	/** Log a warning message */
	warn(message: string): void {
		if (this.level <= LogLevel.Warn) {
			console.warn(`[WARN] ${message}`);
		}
	}

	/** Log an error message */
	error(message: string): void {
		console.error(`[ERROR] ${message}`);
	}

	/** Log a fatal message */
	fatal(message: string): void {
		console.error(`[FATAL] ${message}`);
	}
}

/**
 * Plugin function signature.
 * Breaking change: now receives logger in addition to config.
 *
 * @public
 */
export type Plugin = (config: Config, logger: Logger) => void;

/**
 * Create and start the application.
 * Breaking change: requires `middleware` parameter.
 *
 * @param config - Application configuration
 * @param middleware - Middleware stack to apply at startup
 * @returns A cleanup function
 *
 * @public
 */
export function createApp(config: Config, middleware: Middleware[] = []): () => void {
	const logger = new Logger();
	logger.info(`Starting ${config.appName} on ${config.listen.host}:${config.listen.port}`);
	for (const mw of middleware) {
		logger.info(`Applying middleware: ${mw.name}`);
	}
	return () => {
		logger.info(`Stopping ${config.appName}`);
	};
}
```

- [ ] **Step 5: Commit**

```bash
git add modules/versioned-v2/
git commit -m "feat: add versioned-v2 module — breaking changes for version testing

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 6: Update tsconfig references and verify module builds

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: Add new module references**

```json
{
  "$schema": "https://json.schemastore.org/tsconfig.json",
  "files": [],
  "references": [
    { "path": "plugin" },
    { "path": "modules/kitchensink" },
    { "path": "modules/versioned-v1" },
    { "path": "modules/versioned-v2" }
  ]
}
```

- [ ] **Step 2: Install dependencies**

```bash
pnpm install
```

- [ ] **Step 3: Build all modules**

```bash
pnpm --filter kitchensink run build
pnpm --filter versioned-v1 run build
pnpm --filter versioned-v2 run build
```

Verify each produces `dist/npm/*.api.json`.

- [ ] **Step 4: Commit**

```bash
git add tsconfig.json pnpm-lock.yaml
git commit -m "chore: add versioned module references and verify builds

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 3: New Test Sites

### Task 7: Create sites/versioned

**Files:**
- Create: `sites/versioned/package.json`
- Create: `sites/versioned/rspress.config.ts`
- Create: `sites/versioned/tsconfig.json`
- Create: `sites/versioned/turbo.json`
- Create: `sites/versioned/docs/v1/index.md`
- Create: `sites/versioned/docs/v2/index.md`
- Create: `sites/versioned/lib/scripts/dev.mts`
- Create: `sites/versioned/lib/scripts/preview.mts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "versioned",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "rspress build",
    "dev": "node lib/scripts/dev.mts",
    "preview": "node lib/scripts/preview.mts",
    "types:check": "tsgo --noEmit"
  },
  "dependencies": {
    "rspress-plugin-api-extractor": "workspace:*"
  },
  "devDependencies": {
    "@rspress/core": "^2.0.0",
    "@types/react": "^19.2.10",
    "@typescript/native-preview": "7.0.0-dev.20260128.1",
    "open": "^11.0.0",
    "react": "^19.2.4",
    "react-dom": "^19.2.4"
  }
}
```

- [ ] **Step 2: Create rspress.config.ts**

```typescript
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "Versioned API Test",
	outDir: "dist",
	multiVersion: {
		default: "v2",
		versions: ["v1", "v2"],
	},
	builderConfig: {
		source: {
			define: { "import.meta.env": "import.meta.env" },
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "debug",
			api: {
				packageName: "versioned-module",
				versions: {
					v1: {
						model: path.join(__dirname, "../../modules/versioned-v1/dist/npm/versioned-v1.api.json"),
						packageJson: path.join(__dirname, "../../modules/versioned-v1/dist/npm/package.json"),
					},
					v2: {
						model: path.join(__dirname, "../../modules/versioned-v2/dist/npm/versioned-v2.api.json"),
						packageJson: path.join(__dirname, "../../modules/versioned-v2/dist/npm/package.json"),
					},
				},
				theme: { light: "github-light-default", dark: "github-dark-default" },
			},
		}),
	],
	route: { cleanUrls: true },
});
```

- [ ] **Step 3: Copy tsconfig.json, turbo.json from sites/basic**

```bash
cp sites/basic/tsconfig.json sites/versioned/tsconfig.json
cp sites/basic/turbo.json sites/versioned/turbo.json
```

- [ ] **Step 4: Copy dev/preview scripts from sites/basic**

```bash
mkdir -p sites/versioned/lib/scripts
cp sites/basic/lib/scripts/dev.mts sites/versioned/lib/scripts/dev.mts
cp sites/basic/lib/scripts/preview.mts sites/versioned/lib/scripts/preview.mts
```

- [ ] **Step 5: Create version landing pages**

`sites/versioned/docs/v1/index.md`:
```markdown
# Versioned Module API (v1)

Browse the [API Reference](/v1/api/) for version 1.
```

`sites/versioned/docs/v2/index.md`:
```markdown
# Versioned Module API (v2)

Browse the [API Reference](/api/) for version 2 (latest).
```

- [ ] **Step 6: Commit**

```bash
git add sites/versioned/
git commit -m "feat: add versioned test site with multiVersion support

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 8: Create sites/i18n

**Files:**
- Create: `sites/i18n/package.json`
- Create: `sites/i18n/rspress.config.ts`
- Create: `sites/i18n/tsconfig.json`
- Create: `sites/i18n/turbo.json`
- Create: `sites/i18n/docs/en/index.md`
- Create: `sites/i18n/docs/zh/index.md`
- Create: `sites/i18n/lib/scripts/dev.mts`
- Create: `sites/i18n/lib/scripts/preview.mts`

- [ ] **Step 1: Create package.json**

Same as sites/versioned but `"name": "i18n"`.

- [ ] **Step 2: Create rspress.config.ts**

```typescript
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "i18n API Test",
	outDir: "dist",
	lang: "en",
	locales: [
		{ lang: "en", label: "English" },
		{ lang: "zh", label: "中文" },
	],
	builderConfig: {
		source: {
			define: { "import.meta.env": "import.meta.env" },
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "debug",
			api: {
				packageName: "kitchensink",
				model: path.join(__dirname, "../../modules/kitchensink/dist/npm/kitchensink.api.json"),
				packageJson: path.join(__dirname, "../../modules/kitchensink/dist/npm/package.json"),
				tsconfig: path.join(__dirname, "../../modules/kitchensink/tsconfig.json"),
				theme: { light: "github-light-default", dark: "github-dark-default" },
			},
		}),
	],
	route: { cleanUrls: true },
});
```

- [ ] **Step 3: Copy tsconfig.json, turbo.json, dev/preview scripts**

```bash
cp sites/basic/tsconfig.json sites/i18n/tsconfig.json
cp sites/basic/turbo.json sites/i18n/turbo.json
mkdir -p sites/i18n/lib/scripts
cp sites/basic/lib/scripts/dev.mts sites/i18n/lib/scripts/dev.mts
cp sites/basic/lib/scripts/preview.mts sites/i18n/lib/scripts/preview.mts
```

- [ ] **Step 4: Create locale landing pages**

`sites/i18n/docs/en/index.md`:
```markdown
# Kitchen Sink API (English)

Browse the [API Reference](/api/) to see generated documentation.
```

`sites/i18n/docs/zh/index.md`:
```markdown
# Kitchen Sink API (Chinese)

Browse the [API Reference](/zh/api/) to see generated documentation.
```

- [ ] **Step 5: Commit**

```bash
git add sites/i18n/
git commit -m "feat: add i18n test site with locale support

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 9: Create sites/multi

**Files:**
- Create: `sites/multi/package.json`
- Create: `sites/multi/rspress.config.ts`
- Create: `sites/multi/tsconfig.json`
- Create: `sites/multi/turbo.json`
- Create: `sites/multi/docs/index.md`
- Create: `sites/multi/lib/scripts/dev.mts`
- Create: `sites/multi/lib/scripts/preview.mts`

- [ ] **Step 1: Create package.json**

Same as other sites but `"name": "multi"`.

- [ ] **Step 2: Create rspress.config.ts**

```typescript
import path, { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@rspress/core";
import { ApiExtractorPlugin } from "rspress-plugin-api-extractor";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	root: "docs",
	title: "Multi-API Portal Test",
	outDir: "dist",
	builderConfig: {
		source: {
			define: { "import.meta.env": "import.meta.env" },
		},
	},
	plugins: [
		ApiExtractorPlugin({
			logLevel: "debug",
			apis: [
				{
					packageName: "kitchensink",
					model: path.join(__dirname, "../../modules/kitchensink/dist/npm/kitchensink.api.json"),
					packageJson: path.join(__dirname, "../../modules/kitchensink/dist/npm/package.json"),
					tsconfig: path.join(__dirname, "../../modules/kitchensink/tsconfig.json"),
					theme: { light: "github-light-default", dark: "github-dark-default" },
				},
				{
					packageName: "versioned-module",
					baseRoute: "/versioned",
					model: path.join(__dirname, "../../modules/versioned-v1/dist/npm/versioned-v1.api.json"),
					packageJson: path.join(__dirname, "../../modules/versioned-v1/dist/npm/package.json"),
					theme: { light: "github-light-default", dark: "github-dark-default" },
				},
			],
		}),
	],
	route: { cleanUrls: true },
});
```

- [ ] **Step 3: Copy tsconfig.json, turbo.json, dev/preview scripts**

```bash
cp sites/basic/tsconfig.json sites/multi/tsconfig.json
cp sites/basic/turbo.json sites/multi/turbo.json
mkdir -p sites/multi/lib/scripts
cp sites/basic/lib/scripts/dev.mts sites/multi/lib/scripts/dev.mts
cp sites/basic/lib/scripts/preview.mts sites/multi/lib/scripts/preview.mts
```

- [ ] **Step 4: Create landing page**

`sites/multi/docs/index.md`:
```markdown
# Multi-API Portal

- [Kitchen Sink API](/kitchensink/api/)
- [Versioned Module API](/versioned/api/)
```

- [ ] **Step 5: Commit**

```bash
git add sites/multi/
git commit -m "feat: add multi-API portal test site

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

---

## Chunk 4: Finalization

### Task 10: Update turbo.json to exclude sites from default build

**Files:**
- Modify: `turbo.json`

- [ ] **Step 1: Add site exclusion**

The root `turbo.json` `build` task currently builds all workspaces via `dependsOn: ["^build"]`. To exclude sites, we need to ensure the root `build` script only targets modules and plugin.

Update root `package.json` build script:
```json
"build": "turbo run build --filter=plugin --filter='./modules/*' --log-order=grouped"
```

Similarly for ci:build:
```json
"ci:build": "CI=\"true\" turbo run build --filter=plugin --filter='./modules/*' --log-order=grouped --output-logs=full"
```

- [ ] **Step 2: Commit**

```bash
git add package.json
git commit -m "chore: exclude sites from default build, target only plugin + modules

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 11: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update workspace table and commands**

Update the Workspaces table to reflect the new structure:

| Workspace | Package Name | Private | Purpose |
|-----------|-------------|---------|---------|
| `plugin/` | `rspress-plugin-api-extractor` | Publishable | The main RSPress plugin |
| `modules/kitchensink/` | `kitchensink` | Yes | Full API Extractor feature coverage |
| `modules/versioned-v1/` | `versioned-v1` | Yes | Version testing — v1 baseline |
| `modules/versioned-v2/` | `versioned-v2` | Yes | Version testing — v2 breaking changes |
| `sites/basic/` | `basic` | Yes | Single API, no versioning, no i18n |
| `sites/versioned/` | `versioned` | Yes | Single API + multiVersion |
| `sites/i18n/` | `i18n` | Yes | Single API + i18n |
| `sites/multi/` | `multi` | Yes | Multi-API portal |

Update the commands section with the new dev/preview scripts.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for expanded test infrastructure

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```

### Task 12: Install, build, and verify

- [ ] **Step 1: Clean install**

```bash
pnpm install
```

- [ ] **Step 2: Build modules and plugin**

```bash
pnpm run build
```

Verify all modules produce API models and plugin compiles.

- [ ] **Step 3: Verify each site builds**

```bash
pnpm --filter basic run build
pnpm --filter versioned run build
pnpm --filter i18n run build
pnpm --filter multi run build
```

- [ ] **Step 4: Commit lockfile and any fixes**

```bash
git add pnpm-lock.yaml
git commit -m "chore: verify all modules and sites build successfully

Signed-off-by: C. Spencer Beggs <spencer@beggs.codes>"
```
