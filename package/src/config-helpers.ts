import fs from "node:fs";
import path from "node:path";
import { normalizeBaseRoute, unscopedName } from "./path-derivation.js";
import type { MultiApiConfig } from "./schemas/index.js";

/**
 * Metadata discovered from a single rslib-builder localPaths package folder.
 *
 * @public
 */
export interface DirInfo {
	/** Absolute path to the package folder. */
	dir: string;
	/** Last path segment of `dir`, e.g. "sdk". */
	dirname: string;
	/** package.json "name", e.g. "vitest-agent-sdk" or "\@scope/pkg". */
	packageName: string;
	/** package.json "version" (empty string if absent). */
	version: string;
	/** Absolute path to the resolved *.api.json model. */
	modelPath: string;
}

/**
 * How to derive an API's `baseRoute`. One of:
 *
 * - omitted — leaves `baseRoute` unset so the plugin applies its own
 *   context-aware default: the API folder root (`/api`) under the single-API
 *   `api:` option, or `/{packageName}/api` under the multi-API `apis:` option.
 * - a template string — supports the `{dirname}` and `{packageName}` tokens,
 *   e.g. `"reference/{dirname}"`. A leading slash is normalized in.
 * - a callback — `(info) => string` for full control.
 *
 * Note: the `{packageName}` token is interpolated verbatim, so for a scoped
 * package it yields the scope too (e.g. `@scope/bar`), which is rarely what you
 * want inside a URL path. Prefer `{dirname}` (the folder name, which is the
 * unscoped name in the rslib-builder layout) or the callback form.
 *
 * @public
 */
export type BaseRoute = string | ((info: DirInfo) => string);

/**
 * Overrides for `api.fromDir`. Any `MultiApiConfig` field wins over discovery.
 *
 * @public
 */
export type FromDirOptions = Omit<Partial<MultiApiConfig>, "baseRoute"> & {
	baseRoute?: BaseRoute;
	/** Base for resolving a relative `dir`. Defaults to process.cwd(). */
	cwd?: string;
};

const PREFIX = "[rspress-plugin-api-extractor]";

function discoverModel(dir: string, packageName: string): string {
	const apiJsonFiles = fs.readdirSync(dir).filter((f) => f.endsWith(".api.json"));
	if (apiJsonFiles.length === 1) {
		return path.join(dir, apiJsonFiles[0] as string);
	}
	if (apiJsonFiles.length === 0) {
		throw new Error(
			`${PREFIX} api.fromDir: no *.api.json model found in ${dir}. Pass an explicit \`model\` to override.`,
		);
	}
	const unscoped = unscopedName(packageName);
	const preferred = apiJsonFiles.find((f) => f === `${unscoped}.api.json`);
	if (preferred) {
		return path.join(dir, preferred);
	}
	throw new Error(
		`${PREFIX} api.fromDir: multiple *.api.json files in ${dir} (${apiJsonFiles.join(", ")}) and none match "${unscoped}.api.json". Pass an explicit \`model\`.`,
	);
}

function discoverDir(dir: string): DirInfo {
	let stat: fs.Stats;
	try {
		stat = fs.statSync(dir);
	} catch {
		throw new Error(`${PREFIX} api.fromDir: directory not found: ${dir}`);
	}
	if (!stat.isDirectory()) {
		throw new Error(`${PREFIX} api.fromDir: not a directory: ${dir}`);
	}
	let pkg: { name?: string; version?: string };
	try {
		pkg = JSON.parse(fs.readFileSync(path.join(dir, "package.json"), "utf8")) as { name?: string; version?: string };
	} catch {
		throw new Error(`${PREFIX} api.fromDir: missing or unreadable package.json in ${dir}`);
	}
	if (!pkg.name) {
		throw new Error(`${PREFIX} api.fromDir: package.json in ${dir} has no "name" field`);
	}
	return {
		dir,
		dirname: path.basename(dir),
		packageName: pkg.name,
		version: pkg.version ?? "",
		modelPath: discoverModel(dir, pkg.name),
	};
}

function resolveBaseRoute(baseRoute: Exclude<BaseRoute, undefined>, info: DirInfo): string {
	const raw = typeof baseRoute === "function" ? baseRoute(info) : baseRoute;
	const interpolated = raw.replace(/\{dirname\}/g, info.dirname).replace(/\{packageName\}/g, info.packageName);
	return normalizeBaseRoute(interpolated);
}

/**
 * Build a `MultiApiConfig` by discovering fields from a single package folder
 * produced by `@savvy-web/rslib-builder`'s `localPaths` option. Exposed as
 * `ApiExtractorPlugin.api.fromDir`; the returned config can be passed to the
 * single-API `api:` option or used as an element of the multi-API `apis:` array.
 *
 * `baseRoute` is intentionally left unset unless overridden, so the plugin
 * applies its own context-aware default (`/api` under `api:`,
 * `/{packageName}/api` under `apis:`). See {@link BaseRoute}.
 */
export function fromDir(dir: string, overrides: FromDirOptions = {}): MultiApiConfig {
	const { baseRoute, cwd, ...rest } = overrides;
	const info = discoverDir(path.resolve(cwd ?? process.cwd(), dir));

	const tsconfigPath = path.join(info.dir, "tsconfig.json");
	const discovered: MultiApiConfig = {
		packageName: info.packageName,
		name: info.packageName,
		model: info.modelPath,
		packageJson: path.join(info.dir, "package.json"),
		...(baseRoute !== undefined ? { baseRoute: resolveBaseRoute(baseRoute, info) } : {}),
		...(fs.existsSync(tsconfigPath) ? { tsconfig: tsconfigPath } : {}),
	};

	// Caller-supplied fields win over discovery (shallow merge). `baseRoute`/`cwd`
	// are consumed above and never passed through onto the config object.
	return { ...discovered, ...rest };
}

function isModelFolder(dir: string): boolean {
	if (!fs.existsSync(path.join(dir, "package.json"))) {
		return false;
	}
	try {
		return fs.readdirSync(dir).some((f) => f.endsWith(".api.json"));
	} catch {
		return false;
	}
}

/**
 * Strictly scan a parent directory of package folders and build one
 * `MultiApiConfig` per subfolder. Exposed as `ApiExtractorPlugin.apis.fromDir`;
 * the returned array is intended for the multi-API `apis:` option. Every
 * non-dotfile subdirectory MUST be a valid model folder. `options` (minus
 * `cwd`) is applied as shared defaults to each `api.fromDir` call.
 */
export function fromParentDir(parentDir: string, options: FromDirOptions = {}): MultiApiConfig[] {
	const { cwd, ...rest } = options;
	const absParent = path.resolve(cwd ?? process.cwd(), parentDir);

	let stat: fs.Stats;
	try {
		stat = fs.statSync(absParent);
	} catch {
		throw new Error(`${PREFIX} apis.fromDir: directory not found: ${absParent}`);
	}
	if (!stat.isDirectory()) {
		throw new Error(`${PREFIX} apis.fromDir: not a directory: ${absParent}`);
	}

	const subdirs = fs
		.readdirSync(absParent, { withFileTypes: true })
		.filter((e) => e.isDirectory() && !e.name.startsWith("."))
		.map((e) => e.name)
		.sort();

	const configs: MultiApiConfig[] = [];
	for (const name of subdirs) {
		const subdir = path.join(absParent, name);
		if (!isModelFolder(subdir)) {
			throw new Error(
				`${PREFIX} apis.fromDir: "${name}" in ${absParent} is not a valid model folder (needs package.json and a *.api.json). Use api.fromDir for selective inclusion.`,
			);
		}
		configs.push(fromDir(subdir, rest));
	}

	if (configs.length === 0) {
		throw new Error(
			`${PREFIX} apis.fromDir: no model folders found in ${absParent}. Have the package models been built?`,
		);
	}

	return configs;
}
