import { describe, expect, it } from "vitest";
import type { TypeResolutionCompilerOptions, TypeScriptConfig } from "./types.js";
import {
	DEFAULT_COMPILER_OPTIONS,
	hasTypeScriptConfig,
	mergeCompilerOptions,
	resolveTypeScriptConfig,
	resolveTypeScriptConfigSingle,
	resolveTypeScriptConfigSingleAsync,
} from "./typescript-config.js";

describe("DEFAULT_COMPILER_OPTIONS", () => {
	it("has sensible defaults for documentation", () => {
		expect(DEFAULT_COMPILER_OPTIONS.target).toBe(99); // ESNext
		expect(DEFAULT_COMPILER_OPTIONS.module).toBe(99); // ESNext
		expect(DEFAULT_COMPILER_OPTIONS.moduleResolution).toBe(100); // Bundler
		expect(DEFAULT_COMPILER_OPTIONS.lib).toEqual(["ESNext", "DOM"]);
		expect(DEFAULT_COMPILER_OPTIONS.strict).toBe(false);
		expect(DEFAULT_COMPILER_OPTIONS.skipLibCheck).toBe(true);
		expect(DEFAULT_COMPILER_OPTIONS.esModuleInterop).toBe(true);
		expect(DEFAULT_COMPILER_OPTIONS.allowSyntheticDefaultImports).toBe(true);
	});
});

describe("mergeCompilerOptions", () => {
	it("returns a copy of base when override is undefined", () => {
		const base: TypeResolutionCompilerOptions = { target: 99, lib: ["ESNext"] };
		const result = mergeCompilerOptions(base, undefined);

		expect(result).toEqual(base);
		expect(result).not.toBe(base); // Should be a new object
	});

	it("merges override properties on top of base", () => {
		const base: TypeResolutionCompilerOptions = {
			target: 99,
			lib: ["ESNext"],
			strict: true,
		};
		const override: TypeResolutionCompilerOptions = {
			lib: ["ESNext", "DOM"],
			strict: false,
		};

		const result = mergeCompilerOptions(base, override);

		expect(result).toEqual({
			target: 99, // From base
			lib: ["ESNext", "DOM"], // From override
			strict: false, // From override
		});
	});

	it("does not include undefined properties from override", () => {
		const base: TypeResolutionCompilerOptions = {
			target: 99,
			module: 99,
			strict: true,
		};
		const override: TypeResolutionCompilerOptions = {
			strict: false,
			// target and module not specified
		};

		const result = mergeCompilerOptions(base, override);

		expect(result.target).toBe(99);
		expect(result.module).toBe(99);
		expect(result.strict).toBe(false);
	});

	it("handles all TypeResolutionCompilerOptions properties", () => {
		const base: TypeResolutionCompilerOptions = {};
		const override: TypeResolutionCompilerOptions = {
			target: 99,
			module: 99,
			moduleResolution: 100,
			lib: ["ESNext", "DOM"],
			strict: false,
			skipLibCheck: true,
			esModuleInterop: true,
			allowSyntheticDefaultImports: true,
			jsx: 4,
			types: ["node"],
		};

		const result = mergeCompilerOptions(base, override);

		expect(result).toEqual(override);
	});

	it("replaces entire lib array rather than merging", () => {
		const base: TypeResolutionCompilerOptions = {
			lib: ["ES2020", "DOM"],
		};
		const override: TypeResolutionCompilerOptions = {
			lib: ["ESNext"],
		};

		const result = mergeCompilerOptions(base, override);

		expect(result.lib).toEqual(["ESNext"]);
	});

	it("replaces entire types array rather than merging", () => {
		const base: TypeResolutionCompilerOptions = {
			types: ["node", "jest"],
		};
		const override: TypeResolutionCompilerOptions = {
			types: ["vitest"],
		};

		const result = mergeCompilerOptions(base, override);

		expect(result.types).toEqual(["vitest"]);
	});
});

describe("resolveTypeScriptConfigSingle", () => {
	it("returns empty object for undefined config", () => {
		const result = resolveTypeScriptConfigSingle(undefined, "/project");
		expect(result).toEqual({});
	});

	it("returns empty object for config with no properties", () => {
		const config: TypeScriptConfig = {};
		const result = resolveTypeScriptConfigSingle(config, "/project");
		expect(result).toEqual({});
	});

	it("returns compilerOptions directly when no tsconfig", () => {
		const config: TypeScriptConfig = {
			compilerOptions: {
				target: 99,
				lib: ["ESNext"],
			},
		};

		const result = resolveTypeScriptConfigSingle(config, "/project");

		expect(result).toEqual({
			target: 99,
			lib: ["ESNext"],
		});
	});
});

describe("resolveTypeScriptConfig", () => {
	it("returns defaults when no config provided", async () => {
		const result = await resolveTypeScriptConfig("/project");
		expect(result).toEqual(DEFAULT_COMPILER_OPTIONS);
	});

	it("merges global config on top of defaults", async () => {
		const global: TypeScriptConfig = {
			compilerOptions: {
				strict: true,
			},
		};

		const result = await resolveTypeScriptConfig("/project", global);

		expect(result.strict).toBe(true);
		expect(result.target).toBe(99); // From defaults
		expect(result.module).toBe(99); // From defaults
	});

	it("merges API config on top of global", async () => {
		const global: TypeScriptConfig = {
			compilerOptions: {
				target: 99,
				strict: true,
			},
		};
		const api: TypeScriptConfig = {
			compilerOptions: {
				strict: false,
			},
		};

		const result = await resolveTypeScriptConfig("/project", global, api);

		expect(result.target).toBe(99); // From global
		expect(result.strict).toBe(false); // Overridden by API
	});

	it("merges version config on top of API", async () => {
		const global: TypeScriptConfig = {
			compilerOptions: { target: 99 },
		};
		const api: TypeScriptConfig = {
			compilerOptions: { module: 99 },
		};
		const version: TypeScriptConfig = {
			compilerOptions: { target: 9 }, // ES2022
		};

		const result = await resolveTypeScriptConfig("/project", global, api, version);

		expect(result.target).toBe(9); // Overridden by version
		expect(result.module).toBe(99); // From API
	});

	it("merges package override on top of version", async () => {
		const global: TypeScriptConfig = {
			compilerOptions: { target: 99 },
		};
		const api: TypeScriptConfig = {
			compilerOptions: { module: 99 },
		};
		const version: TypeScriptConfig = {
			compilerOptions: { moduleResolution: 100 },
		};
		const packageOverride: TypeScriptConfig = {
			compilerOptions: { module: 1 }, // CommonJS
		};

		const result = await resolveTypeScriptConfig("/project", global, api, version, packageOverride);

		expect(result.target).toBe(99); // From global
		expect(result.module).toBe(1); // Overridden by package
		expect(result.moduleResolution).toBe(100); // From version
	});

	it("handles undefined configs in cascade", async () => {
		const version: TypeScriptConfig = {
			compilerOptions: { strict: true },
		};

		// Skip global and API
		const result = await resolveTypeScriptConfig("/project", undefined, undefined, version);

		expect(result.strict).toBe(true);
		expect(result.target).toBe(99); // From defaults
	});

	it("handles async function for tsconfig", async () => {
		const global: TypeScriptConfig = {
			tsconfig: async () => ({
				target: 99,
				lib: ["ESNext", "DOM"],
			}),
		};

		const result = await resolveTypeScriptConfig("/project", global);

		expect(result.target).toBe(99);
		expect(result.lib).toEqual(["ESNext", "DOM"]);
	});

	it("merges compilerOptions on top of async tsconfig function", async () => {
		const global: TypeScriptConfig = {
			tsconfig: async () => ({
				target: 99,
				strict: true,
			}),
			compilerOptions: {
				strict: false, // Override the async function result
			},
		};

		const result = await resolveTypeScriptConfig("/project", global);

		expect(result.target).toBe(99); // From async function
		expect(result.strict).toBe(false); // Overridden by compilerOptions
	});
});

describe("resolveTypeScriptConfigSingleAsync", () => {
	it("returns empty object for undefined config", async () => {
		const result = await resolveTypeScriptConfigSingleAsync(undefined, "/project");
		expect(result).toEqual({});
	});

	it("calls async function and returns result", async () => {
		const config: TypeScriptConfig = {
			tsconfig: async () => ({
				target: 99,
				lib: ["ESNext"],
			}),
		};

		const result = await resolveTypeScriptConfigSingleAsync(config, "/project");

		expect(result).toEqual({
			target: 99,
			lib: ["ESNext"],
		});
	});

	it("merges compilerOptions on top of async function result", async () => {
		const config: TypeScriptConfig = {
			tsconfig: async () => ({
				target: 99,
				strict: true,
			}),
			compilerOptions: {
				strict: false,
				module: 99,
			},
		};

		const result = await resolveTypeScriptConfigSingleAsync(config, "/project");

		expect(result.target).toBe(99); // From async function
		expect(result.strict).toBe(false); // Overridden by compilerOptions
		expect(result.module).toBe(99); // From compilerOptions
	});
});

describe("hasTypeScriptConfig", () => {
	it("returns false for undefined", () => {
		expect(hasTypeScriptConfig(undefined)).toBe(false);
	});

	it("returns false for empty config", () => {
		expect(hasTypeScriptConfig({})).toBe(false);
	});

	it("returns true if tsconfig is specified", () => {
		expect(hasTypeScriptConfig({ tsconfig: "tsconfig.json" })).toBe(true);
	});

	it("returns true if compilerOptions is specified", () => {
		expect(hasTypeScriptConfig({ compilerOptions: { target: 99 } })).toBe(true);
	});

	it("returns true if both are specified", () => {
		expect(
			hasTypeScriptConfig({
				tsconfig: "tsconfig.json",
				compilerOptions: { target: 99 },
			}),
		).toBe(true);
	});
});
