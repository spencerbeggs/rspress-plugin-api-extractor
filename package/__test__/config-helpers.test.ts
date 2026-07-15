import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fromDir, fromParentDir } from "../src/config-helpers.js";

/** Write a fake rslib-builder localPaths model folder under `root`. */
function writeModelFolder(
	root: string,
	dirname: string,
	opts: {
		packageName: string;
		version?: string;
		/** Defaults to `${packageName}.api.json`. */
		apiJsonName?: string;
		/** Additional *.api.json files to create. */
		extraApiJson?: string[];
		/** Write tsconfig.json (default true). */
		tsconfig?: boolean;
		/** Omit the "name" field from package.json. */
		noName?: boolean;
		/** Skip writing any *.api.json. */
		noModel?: boolean;
	},
): string {
	const dir = path.join(root, dirname);
	fs.mkdirSync(dir, { recursive: true });
	fs.writeFileSync(
		path.join(dir, "package.json"),
		JSON.stringify(
			opts.noName ? { version: opts.version ?? "1.0.0" } : { name: opts.packageName, version: opts.version ?? "1.0.0" },
		),
	);
	if (!opts.noModel) {
		fs.writeFileSync(path.join(dir, opts.apiJsonName ?? `${opts.packageName}.api.json`), "{}");
	}
	for (const extra of opts.extraApiJson ?? []) {
		fs.writeFileSync(path.join(dir, extra), "{}");
	}
	if (opts.tsconfig !== false) {
		fs.writeFileSync(path.join(dir, "tsconfig.json"), "{}");
	}
	return dir;
}

describe("api.fromDir", () => {
	let root: string;
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "ax-helpers-"));
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("derives packageName, model, packageJson, tsconfig and name", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir(path.join(root, "sdk"));
		expect(cfg.packageName).toBe("vitest-agent-sdk");
		expect(cfg.name).toBe("vitest-agent-sdk");
		expect(cfg.model).toBe(path.join(root, "sdk", "vitest-agent-sdk.api.json"));
		expect(cfg.packageJson).toBe(path.join(root, "sdk", "package.json"));
		expect(cfg.tsconfig).toBe(path.join(root, "sdk", "tsconfig.json"));
	});

	it("leaves baseRoute unset when omitted (plugin applies its own default)", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir(path.join(root, "sdk"));
		expect(cfg.baseRoute).toBeUndefined();
	});

	it("applies a template string baseRoute with {dirname}", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir(path.join(root, "sdk"), { baseRoute: "reference/{dirname}" });
		expect(cfg.baseRoute).toBe("/reference/sdk");
	});

	it("supports the {packageName} token", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir(path.join(root, "sdk"), { baseRoute: "reference/{packageName}" });
		expect(cfg.baseRoute).toBe("/reference/vitest-agent-sdk");
	});

	it("normalizes a leading slash in templates", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir(path.join(root, "sdk"), { baseRoute: "/reference/{dirname}" });
		expect(cfg.baseRoute).toBe("/reference/sdk");
	});

	it("supports a callback baseRoute receiving DirInfo", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk", version: "2.1.0" });
		const cfg = fromDir(path.join(root, "sdk"), {
			baseRoute: (info) => `reference/${info.dirname}/${info.version}`,
		});
		expect(cfg.baseRoute).toBe("/reference/sdk/2.1.0");
	});

	it("omits tsconfig when no tsconfig.json is present", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk", tsconfig: false });
		const cfg = fromDir(path.join(root, "sdk"));
		expect(cfg.tsconfig).toBeUndefined();
	});

	it("resolves a scoped package model via the unscoped name when ambiguous", () => {
		writeModelFolder(root, "bar", {
			packageName: "@scope/bar",
			apiJsonName: "bar.api.json",
			extraApiJson: ["legacy.api.json"],
		});
		const cfg = fromDir(path.join(root, "bar"));
		expect(cfg.packageName).toBe("@scope/bar");
		expect(cfg.model).toBe(path.join(root, "bar", "bar.api.json"));
	});

	it("lets caller overrides win over discovery and passes extra fields through", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir(path.join(root, "sdk"), {
			name: "SDK",
			apiFolder: "api",
			theme: { light: "github-light", dark: "github-dark" },
		});
		expect(cfg.name).toBe("SDK");
		expect(cfg.apiFolder).toBe("api");
		expect(cfg.theme).toEqual({ light: "github-light", dark: "github-dark" });
		expect(cfg.packageName).toBe("vitest-agent-sdk");
	});

	it("resolves a relative dir against the cwd option", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk" });
		const cfg = fromDir("sdk", { cwd: root });
		expect(cfg.model).toBe(path.join(root, "sdk", "vitest-agent-sdk.api.json"));
		expect((cfg as Record<string, unknown>).cwd).toBeUndefined();
	});

	it("throws when the directory does not exist", () => {
		expect(() => fromDir(path.join(root, "missing"))).toThrow(/directory not found/);
	});

	it("throws when package.json has no name", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk", noName: true });
		expect(() => fromDir(path.join(root, "sdk"))).toThrow(/no "name" field/);
	});

	it("throws when no *.api.json is present", () => {
		writeModelFolder(root, "sdk", { packageName: "vitest-agent-sdk", noModel: true });
		expect(() => fromDir(path.join(root, "sdk"))).toThrow(/no \*\.api\.json model found/);
	});

	it("throws when multiple *.api.json files match no name", () => {
		writeModelFolder(root, "sdk", {
			packageName: "vitest-agent-sdk",
			apiJsonName: "alpha.api.json",
			extraApiJson: ["beta.api.json"],
		});
		expect(() => fromDir(path.join(root, "sdk"))).toThrow(/multiple \*\.api\.json files/);
	});
});

describe("apis.fromDir", () => {
	let root: string;
	let models: string;
	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), "ax-helpers-"));
		models = path.join(root, "lib", "models");
		fs.mkdirSync(models, { recursive: true });
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it("scans every subfolder, applies shared defaults, and resolves per-entry baseRoute", () => {
		writeModelFolder(models, "sdk", { packageName: "vitest-agent-sdk" });
		writeModelFolder(models, "plugin", { packageName: "vitest-agent-plugin" });

		const configs = fromParentDir(models, {
			baseRoute: "reference/{dirname}",
			apiFolder: "api",
			theme: { light: "github-light", dark: "github-dark" },
		});

		expect(configs).toHaveLength(2);
		expect(configs.map((c) => c.packageName)).toEqual(["vitest-agent-plugin", "vitest-agent-sdk"]);
		expect(configs.map((c) => c.baseRoute)).toEqual(["/reference/plugin", "/reference/sdk"]);
		for (const cfg of configs) {
			expect(cfg.apiFolder).toBe("api");
			expect(cfg.theme).toEqual({ light: "github-light", dark: "github-dark" });
		}
	});

	it("leaves baseRoute unset per entry when omitted (plugin namespaces by package)", () => {
		writeModelFolder(models, "sdk", { packageName: "vitest-agent-sdk" });
		const configs = fromParentDir(models);
		expect(configs[0]?.baseRoute).toBeUndefined();
	});

	it("resolves parentDir against the cwd option", () => {
		writeModelFolder(models, "sdk", { packageName: "vitest-agent-sdk" });
		const configs = fromParentDir("lib/models", { cwd: root });
		expect(configs).toHaveLength(1);
		expect(configs[0]?.model).toBe(path.join(models, "sdk", "vitest-agent-sdk.api.json"));
	});

	it("skips dotfiles and stray non-directory entries", () => {
		writeModelFolder(models, "sdk", { packageName: "vitest-agent-sdk" });
		fs.writeFileSync(path.join(models, ".gitkeep"), "");
		fs.writeFileSync(path.join(models, "README.md"), "# models");
		fs.mkdirSync(path.join(models, ".cache"));
		const configs = fromParentDir(models);
		expect(configs).toHaveLength(1);
		expect(configs[0]?.packageName).toBe("vitest-agent-sdk");
	});

	it("throws when a subdirectory is not a valid model folder (strict)", () => {
		writeModelFolder(models, "sdk", { packageName: "vitest-agent-sdk" });
		fs.mkdirSync(path.join(models, "junk"));
		fs.writeFileSync(path.join(models, "junk", "notes.txt"), "hi");
		expect(() => fromParentDir(models)).toThrow(/"junk".*is not a valid model folder/);
	});

	it("throws when no model folders are found", () => {
		expect(() => fromParentDir(models)).toThrow(/no model folders found/);
	});

	it("throws when parentDir does not exist", () => {
		expect(() => fromParentDir(path.join(root, "nope"))).toThrow(/directory not found/);
	});
});
