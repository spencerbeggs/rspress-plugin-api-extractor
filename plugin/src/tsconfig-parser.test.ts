import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TsConfigParseError, parseTsConfig, parseTsConfigWithMetadata } from "./tsconfig-parser.js";

describe("parseTsConfig", () => {
	let tempDir: string;

	beforeEach(() => {
		// Create temporary directory for test config files
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsconfig-test-"));
	});

	afterEach(() => {
		// Clean up
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("parses a basic tsconfig.json", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				target: "ESNext",
				module: "ESNext",
				lib: ["ESNext", "DOM"],
				strict: false,
			},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.target).toBe(99); // ESNext
		expect(result.module).toBe(99); // ESNext
		// TypeScript resolves lib names to actual file names
		expect(result.lib).toBeDefined();
		expect(result.lib?.some((lib) => lib.includes("esnext"))).toBe(true);
		expect(result.lib?.some((lib) => lib.includes("dom"))).toBe(true);
		expect(result.strict).toBe(false);
	});

	it("handles ES version targets correctly", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				target: "ES2022",
				module: "NodeNext",
				moduleResolution: "NodeNext",
			},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.target).toBe(9); // ES2022
		expect(result.module).toBe(199); // NodeNext
		expect(result.moduleResolution).toBe(99); // NodeNext
	});

	it("handles boolean options", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				strict: true,
				skipLibCheck: true,
				esModuleInterop: true,
				allowSyntheticDefaultImports: true,
			},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.strict).toBe(true);
		expect(result.skipLibCheck).toBe(true);
		expect(result.esModuleInterop).toBe(true);
		expect(result.allowSyntheticDefaultImports).toBe(true);
	});

	it("handles jsx option", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				jsx: "react-jsx",
			},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.jsx).toBe(4); // ReactJSX
	});

	it("handles types array", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				types: ["node", "vitest"],
			},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.types).toEqual(["node", "vitest"]);
	});

	it("handles extends chain", () => {
		// Create base config
		const baseConfig = JSON.stringify({
			compilerOptions: {
				target: "ES2020",
				strict: true,
				lib: ["ES2020"],
			},
		});
		fs.writeFileSync(path.join(tempDir, "base.json"), baseConfig);

		// Create main config that extends base
		const mainConfig = JSON.stringify({
			extends: "./base.json",
			compilerOptions: {
				// Override target, keep strict from base
				target: "ESNext",
				lib: ["ESNext", "DOM"],
			},
		});
		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), mainConfig);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.target).toBe(99); // ESNext (overridden)
		expect(result.strict).toBe(true); // From base
		// TypeScript resolves lib names to actual file names
		expect(result.lib).toBeDefined();
		expect(result.lib?.some((lib) => lib.includes("esnext"))).toBe(true);
		expect(result.lib?.some((lib) => lib.includes("dom"))).toBe(true);
	});

	it("handles deeply nested extends chain", () => {
		// Create grandparent config
		const grandparentConfig = JSON.stringify({
			compilerOptions: {
				strict: true,
				skipLibCheck: true,
			},
		});
		fs.writeFileSync(path.join(tempDir, "grandparent.json"), grandparentConfig);

		// Create parent config
		const parentConfig = JSON.stringify({
			extends: "./grandparent.json",
			compilerOptions: {
				target: "ES2020",
			},
		});
		fs.writeFileSync(path.join(tempDir, "parent.json"), parentConfig);

		// Create child config
		const childConfig = JSON.stringify({
			extends: "./parent.json",
			compilerOptions: {
				target: "ESNext",
			},
		});
		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), childConfig);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.target).toBe(99); // ESNext (from child)
		expect(result.strict).toBe(true); // From grandparent
		expect(result.skipLibCheck).toBe(true); // From grandparent
	});

	it("handles absolute paths", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				target: "ESNext",
			},
		});

		const absolutePath = path.join(tempDir, "tsconfig.json");
		fs.writeFileSync(absolutePath, configContent);

		const result = parseTsConfig(absolutePath, "/some/other/dir");

		expect(result.target).toBe(99);
	});

	it("throws TsConfigParseError for missing file", () => {
		expect(() => {
			parseTsConfig("nonexistent.json", tempDir);
		}).toThrow(TsConfigParseError);

		expect(() => {
			parseTsConfig("nonexistent.json", tempDir);
		}).toThrow("File not found");
	});

	it("throws TsConfigParseError for invalid JSON", () => {
		fs.writeFileSync(path.join(tempDir, "invalid.json"), "{ invalid json }");

		expect(() => {
			parseTsConfig("invalid.json", tempDir);
		}).toThrow(TsConfigParseError);
	});

	it("handles empty compilerOptions", () => {
		const configContent = JSON.stringify({
			compilerOptions: {},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		// Should return an object with no properties
		expect(Object.keys(result).length).toBe(0);
	});

	it("handles tsconfig with no compilerOptions", () => {
		const configContent = JSON.stringify({
			include: ["src/**/*"],
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		// Should return an object with no properties
		expect(Object.keys(result).length).toBe(0);
	});

	it("handles JSONC (comments in JSON)", () => {
		const configContent = `{
			// This is a comment
			"compilerOptions": {
				/* Multi-line
				   comment */
				"target": "ESNext"
			}
		}`;

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfig("tsconfig.json", tempDir);

		expect(result.target).toBe(99);
	});
});

describe("parseTsConfigWithMetadata", () => {
	let tempDir: string;

	beforeEach(() => {
		tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "tsconfig-meta-test-"));
	});

	afterEach(() => {
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it("returns absolute config path", () => {
		const configContent = JSON.stringify({
			compilerOptions: { target: "ESNext" },
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfigWithMetadata("tsconfig.json", tempDir);

		expect(result.configPath).toBe(path.join(tempDir, "tsconfig.json"));
	});

	it("returns extended paths in resolution order", () => {
		// Create base config
		const baseConfig = JSON.stringify({
			compilerOptions: { strict: true },
		});
		fs.writeFileSync(path.join(tempDir, "base.json"), baseConfig);

		// Create main config
		const mainConfig = JSON.stringify({
			extends: "./base.json",
			compilerOptions: { target: "ESNext" },
		});
		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), mainConfig);

		const result = parseTsConfigWithMetadata("tsconfig.json", tempDir);

		expect(result.extendedPaths).toContain(path.join(tempDir, "tsconfig.json"));
		expect(result.extendedPaths.length).toBeGreaterThanOrEqual(1);
	});

	it("includes compiler options in result", () => {
		const configContent = JSON.stringify({
			compilerOptions: {
				target: "ESNext",
				lib: ["ESNext", "DOM"],
			},
		});

		fs.writeFileSync(path.join(tempDir, "tsconfig.json"), configContent);

		const result = parseTsConfigWithMetadata("tsconfig.json", tempDir);

		expect(result.compilerOptions.target).toBe(99);
		// TypeScript resolves lib names to actual file names
		expect(result.compilerOptions.lib).toBeDefined();
		expect(result.compilerOptions.lib?.some((lib) => lib.includes("esnext"))).toBe(true);
	});
});

describe("TsConfigParseError", () => {
	it("has correct error name", () => {
		const error = new TsConfigParseError("/path/to/config.json", "Test error");
		expect(error.name).toBe("TsConfigParseError");
	});

	it("includes config path in message", () => {
		const error = new TsConfigParseError("/path/to/config.json", "Test error");
		expect(error.message).toContain("/path/to/config.json");
		expect(error.message).toContain("Test error");
	});

	it("stores config path as property", () => {
		const error = new TsConfigParseError("/path/to/config.json", "Test error");
		expect(error.configPath).toBe("/path/to/config.json");
	});

	it("stores cause if provided", () => {
		const cause = new Error("Original error");
		const error = new TsConfigParseError("/path/to/config.json", "Test error", cause);
		expect(error.cause).toBe(cause);
	});
});
