import * as fs from "node:fs";
import * as path from "node:path";
import { VirtualPackage } from "type-registry-effect";
import { describe, expect, it } from "vitest";
import { ApiExtractedPackage } from "./api-extracted-package.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "__fixtures__", "example-module");
const API_MODEL_PATH = path.join(FIXTURES_DIR, "example-module.api.json");
const EXPECTED_DTS_PATH = path.join(FIXTURES_DIR, "index.d.ts");

describe("ApiExtractedPackage", () => {
	const expectedDts = fs.readFileSync(EXPECTED_DTS_PATH, "utf-8");
	const apiExtractedPackage = ApiExtractedPackage.fromApiModel(API_MODEL_PATH);

	describe("fromApiModel", () => {
		it("should load from an API model JSON file", () => {
			expect(apiExtractedPackage).toBeInstanceOf(ApiExtractedPackage);
		});

		it("should be an instance of VirtualPackage (base class)", () => {
			expect(apiExtractedPackage).toBeInstanceOf(VirtualPackage);
		});
	});

	describe("generateVfs", () => {
		it("should generate both package.json and index.d.ts", () => {
			const vfs = apiExtractedPackage.generateVfs();
			expect(vfs.has("node_modules/example-module/package.json")).toBe(true);
			expect(vfs.has("node_modules/example-module/index.d.ts")).toBe(true);
		});

		it("should generate valid package.json", () => {
			const vfs = apiExtractedPackage.generateVfs();
			const raw = vfs.get("node_modules/example-module/package.json") ?? "";
			const pkgJson = JSON.parse(raw);
			expect(pkgJson.name).toBe("example-module");
			expect(pkgJson.version).toBe("1.0.0");
			expect(pkgJson.types).toBe("index.d.ts");
		});
	});

	describe("declaration output matches compiled .d.ts", () => {
		const generated = apiExtractedPackage.generateDeclarations();

		it("should produce output", () => {
			expect(generated.length).toBeGreaterThan(100);
		});

		// ────────────────────────────────────────────────────
		// Structural checks
		// ────────────────────────────────────────────────────

		it("should have balanced braces", () => {
			const open = (generated.match(/\{/g) || []).length;
			const close = (generated.match(/\}/g) || []).length;
			expect(open).toBe(close);
		});

		it("should have balanced parentheses", () => {
			const open = (generated.match(/\(/g) || []).length;
			const close = (generated.match(/\)/g) || []).length;
			expect(open).toBe(close);
		});

		it("should not contain double semicolons", () => {
			expect(generated).not.toContain(";;");
		});

		it("should end with export { }", () => {
			expect(generated.trimEnd()).toMatch(/export \{ \}\s*$/);
		});

		// ────────────────────────────────────────────────────
		// Export completeness: every export in the actual file
		// should be present in the generated output
		// ────────────────────────────────────────────────────

		it("should export all classes", () => {
			const expectedClasses = [...expectedDts.matchAll(/export declare class (\w+)/g)].map((m) => m[1]);
			for (const cls of expectedClasses) {
				expect(generated).toContain(`class ${cls}`);
			}
		});

		it("should export all interfaces", () => {
			const expectedInterfaces = [...expectedDts.matchAll(/export declare interface (\w+)/g)].map((m) => m[1]);
			for (const iface of expectedInterfaces) {
				expect(generated).toContain(`interface ${iface}`);
			}
		});

		it("should export all enums", () => {
			const expectedEnums = [...expectedDts.matchAll(/export declare enum (\w+)/g)].map((m) => m[1]);
			for (const enumName of expectedEnums) {
				expect(generated).toContain(`enum ${enumName}`);
			}
		});

		it("should export all functions", () => {
			const expectedFunctions = [...expectedDts.matchAll(/export declare function (\w+)/g)].map((m) => m[1]);
			for (const fn of expectedFunctions) {
				expect(generated).toContain(`function ${fn}`);
			}
		});

		it("should export all type aliases", () => {
			const expectedTypes = [...expectedDts.matchAll(/export declare type (\w+)/g)].map((m) => m[1]);
			for (const t of expectedTypes) {
				expect(generated).toContain(`type ${t}`);
			}
		});

		it("should export all namespaces", () => {
			const expectedNs = [...expectedDts.matchAll(/export declare namespace (\w+)/g)].map((m) => m[1]);
			for (const ns of expectedNs) {
				expect(generated).toContain(`namespace ${ns}`);
			}
		});

		it("should export all variables with const keyword", () => {
			const expectedVars = [...expectedDts.matchAll(/export declare const (\w+)/g)].map((m) => m[1]);
			for (const v of expectedVars) {
				expect(generated).toContain(`const ${v}`);
			}
		});

		// ────────────────────────────────────────────────────
		// Enum values
		// ────────────────────────────────────────────────────

		it("should include LogLevel enum member values", () => {
			expect(generated).toContain("Debug = 0");
			expect(generated).toContain("Info = 1");
			expect(generated).toContain("Warn = 2");
			expect(generated).toContain("Error = 3");
		});

		it("should include TaskStatus enum member string values", () => {
			expect(generated).toMatch(/Pending = "pending"/);
			expect(generated).toMatch(/Running = "running"/);
			expect(generated).toMatch(/Completed = "completed"/);
			expect(generated).toMatch(/Cancelled = "cancelled"/);
			expect(generated).toMatch(/Failed = "failed"/);
		});

		it("should include Formatters.Style enum member string values", () => {
			expect(generated).toMatch(/Compact = "compact"/);
			expect(generated).toMatch(/Verbose = "verbose"/);
		});

		// ────────────────────────────────────────────────────
		// Namespace structure
		// ────────────────────────────────────────────────────

		it("should declare namespaces with 'export declare namespace'", () => {
			expect(generated).toContain("export declare namespace Formatters {");
			expect(generated).toContain("export declare namespace Validators {");
		});

		it("should NOT use 'declare' inside namespace members", () => {
			// Extract content inside Formatters namespace
			const formattersMatch = generated.match(/export declare namespace Formatters \{([\s\S]*?)\n\}/);
			expect(formattersMatch).not.toBeNull();
			if (formattersMatch) {
				const content = formattersMatch[1];
				expect(content).not.toContain("export declare ");
				expect(content).toContain("export function");
				expect(content).toContain("export interface");
				expect(content).toContain("export enum");
			}
		});

		it("should include all Formatters namespace members", () => {
			expect(generated).toContain("export function formatEntry");
			expect(generated).toContain("export function formatDuration");
			expect(generated).toContain("export function formatResult");
			expect(generated).toContain("export function levelLabel");
			expect(generated).toContain("export interface FormatOptions");
			expect(generated).toContain("export enum Style");
		});

		it("should include all Validators namespace members", () => {
			expect(generated).toContain("export function isNonEmpty");
			expect(generated).toContain("export function isInRange");
			expect(generated).toContain("export function validateAll");
			expect(generated).toContain("export interface ValidationResult");
			expect(generated).toContain("export type ValidatorFn");
		});

		// ────────────────────────────────────────────────────
		// Variable declarations
		// ────────────────────────────────────────────────────

		it("should declare variables with 'export declare const'", () => {
			expect(generated).toMatch(/export declare const DEFAULT_LOGGER_OPTIONS/);
			expect(generated).toMatch(/export declare const VERSION/);
		});

		// ────────────────────────────────────────────────────
		// Class members
		// ────────────────────────────────────────────────────

		it("should include constructor declarations", () => {
			expect(generated).toContain("constructor(options: TaskOptions<T>");
			expect(generated).toContain("constructor(options?: LoggerOptions)");
		});

		it("should include method declarations", () => {
			expect(generated).toContain("run(): Promise<Result<T>>");
			expect(generated).toContain("cancel(): boolean");
			expect(generated).toContain("addTransport(transport: LogTransport): void");
		});

		it("should include property declarations", () => {
			expect(generated).toContain("readonly label: string");
			expect(generated).toContain("status: TaskStatus");
		});

		// ────────────────────────────────────────────────────
		// JSDoc
		// ────────────────────────────────────────────────────

		it("should include JSDoc for major exports", () => {
			// Classes should have JSDoc
			expect(generated).toMatch(/\/\*\*[\s\S]*?\*\/\s*export declare class AsyncTask/);
			expect(generated).toMatch(/\/\*\*[\s\S]*?\*\/\s*export declare class Logger/);

			// Enums should have JSDoc
			expect(generated).toMatch(/\/\*\*[\s\S]*?\*\/\s*export declare enum LogLevel/);

			// Namespaces should have JSDoc
			expect(generated).toMatch(/\/\*\*[\s\S]*?\*\/\s*export declare namespace Formatters/);
		});

		it("should include JSDoc for enum members", () => {
			expect(generated).toMatch(/\/\*\*.*Verbose diagnostic.*\*\/\s*\n\s*Debug/);
		});

		// ────────────────────────────────────────────────────
		// JSDoc cross-references ({@link} tags)
		// ────────────────────────────────────────────────────

		it("should reconstruct multi-level {@link} references", () => {
			expect(generated).toContain("{@link TaskStatus.Pending}");
			expect(generated).toContain("{@link Formatters.formatEntry}");
			expect(generated).toContain("{@link Logger.addTransport}");
			expect(generated).toContain("{@link LoggerOptions.defaultSource}");
			expect(generated).toContain("{@link Validators.ValidationResult}");
			expect(generated).toContain("{@link Validators.validateAll}");
		});

		it("should reconstruct {@link} with display text", () => {
			expect(generated).toContain("{@link LogLevel.Debug | debug}");
			expect(generated).toContain("{@link LogLevel.Info | info}");
			expect(generated).toContain("{@link LogLevel.Warn | warn}");
			expect(generated).toContain("{@link LogLevel.Error | error}");
			expect(generated).toContain("{@link LogTransport | transports}");
			expect(generated).toContain("{@link LogMeta | metadata}");
			expect(generated).toMatch(/\{@link Result \| Result\\<T\\>\}/);
		});

		it("should include @example blocks with fenced code", () => {
			expect(generated).toMatch(/@example\s*\n\s*\* ```typescript/);
			// AsyncTask example
			expect(generated).toContain('import { AsyncTask, TaskStatus } from "example-module"');
			// Logger example
			expect(generated).toContain('import { Logger, LogLevel } from "example-module"');
		});

		it("should include @public modifier tags", () => {
			// Top-level exports should have @public
			expect(generated).toMatch(/@public\s*\n\s*\*\/\s*\nexport declare class AsyncTask/);
			expect(generated).toMatch(/@public\s*\n\s*\*\/\s*\nexport declare class Logger/);
			expect(generated).toMatch(/@public\s*\n\s*\*\/\s*\nexport declare enum LogLevel/);
			expect(generated).toMatch(/@public\s*\n\s*\*\/\s*\nexport declare namespace Formatters/);
		});

		// ────────────────────────────────────────────────────
		// Signature interfaces (call, construct, index)
		// ────────────────────────────────────────────────────

		it("should export Callable interface", () => {
			expect(generated).toContain("export declare interface Callable");
		});

		it("should export Constructable interface", () => {
			expect(generated).toContain("export declare interface Constructable");
		});

		it("should export LogLevelMap interface", () => {
			expect(generated).toContain("export declare interface LogLevelMap");
		});

		it("Callable should contain call signature", () => {
			expect(generated).toContain("(input: string): number");
		});

		it("Constructable should contain construct signature", () => {
			expect(generated).toMatch(/new\s*\(label: string\)/);
			expect(generated).toContain("Result<string>");
		});

		it("LogLevelMap should contain index signature", () => {
			expect(generated).toContain("[component: string]");
			expect(generated).toContain("LogLevel");
		});

		// ────────────────────────────────────────────────────
		// Full content comparison (snapshot)
		// ────────────────────────────────────────────────────

		it("should match the expected .d.ts output (snapshot)", () => {
			expect(generated).toBe(expectedDts);
		});
	});
});
