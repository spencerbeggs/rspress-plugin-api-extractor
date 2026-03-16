import { describe, expect, it } from "vitest";
import { addLogicalBlankLines } from "./code-post-processor.js";

describe("addLogicalBlankLines", () => {
	it("should insert blank line after single-line import block", () => {
		const input = ['import { Effect } from "effect";', 'import { Schema } from "@effect/schema";', "const x = 1;"].join(
			"\n",
		);

		const result = addLogicalBlankLines(input);

		expect(result).toBe(
			['import { Effect } from "effect";', 'import { Schema } from "@effect/schema";', "", "const x = 1;"].join("\n"),
		);
	});

	it("should insert blank line after multi-line import block", () => {
		const input = [
			"import {",
			"  Logger,",
			"  LogLevel,",
			"  Formatters,",
			'} from "example-module";',
			'import type { LogEntry } from "example-module";',
			"// Create a logger",
			"const logger = new Logger();",
		].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(
			[
				"import {",
				"  Logger,",
				"  LogLevel,",
				"  Formatters,",
				'} from "example-module";',
				'import type { LogEntry } from "example-module";',
				"",
				"// Create a logger",
				"const logger = new Logger();",
			].join("\n"),
		);
	});

	it("should not insert blank lines inside multi-line imports", () => {
		const input = ["import {", "  Logger,", "  LogLevel,", "  Formatters,", '} from "example-module";'].join("\n");

		const result = addLogicalBlankLines(input);

		// No blank lines should be inserted inside the multi-line import
		expect(result).toBe(input);
	});

	it("should handle multi-line import followed by code without comment", () => {
		const input = ["import {", "  Logger,", '} from "example-module";', "const logger = new Logger();"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(
			["import {", "  Logger,", '} from "example-module";', "", "const logger = new Logger();"].join("\n"),
		);
	});

	it("should insert blank line before section comments", () => {
		const input = ["const x = 1;", "// Create the service", "const svc = create();"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(["const x = 1;", "", "// Create the service", "const svc = create();"].join("\n"));
	});

	it("should insert blank line before return statements", () => {
		const input = ["const x = compute();", "return x;"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(["const x = compute();", "", "return x;"].join("\n"));
	});

	it("should not insert double blank lines", () => {
		const input = ["const x = 1;", "", "// Already spaced", "const y = 2;"].join("\n");

		const result = addLogicalBlankLines(input);

		// Should not add another blank line before the comment since prev is already blank
		expect(result).toBe(["const x = 1;", "", "// Already spaced", "const y = 2;"].join("\n"));
	});

	it("should not treat Twoslash directives as section comments", () => {
		const input = ['import { Effect } from "effect";', "// @noErrors", "// ---cut---", "const x = 1;"].join("\n");

		const result = addLogicalBlankLines(input);

		// Directives after imports should not get blank lines (isDirective check in Rule 1)
		// Directives should not be treated as section comments (isDirective check in Rule 2)
		expect(result).toBe(
			['import { Effect } from "effect";', "// @noErrors", "// ---cut---", "const x = 1;"].join("\n"),
		);
	});

	it("should not treat annotation markers as section comments", () => {
		const input = ["const x = 1;", "//    ^?", "const y = 2;", "//    ^|", "const z = 3;", "//    ^^^^"].join("\n");

		const result = addLogicalBlankLines(input);

		// Annotation markers (^?, ^|, ^^^) are Twoslash directives positioned
		// directly under code lines — no blank line should be inserted before them
		expect(result).toBe(input);
	});

	it("should not treat no-space directives as section comments", () => {
		const input = ['import { x } from "mod";', "//@noErrors", "//---cut---", "const a = 1;"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(input);
	});

	it("should not insert blank lines between consecutive imports", () => {
		const input = [
			'import { Effect } from "effect";',
			'import { Schema } from "@effect/schema";',
			'import { pipe } from "effect/Function";',
		].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(input);
	});

	it("should preserve import → directive → code flow", () => {
		const input = ['import { Effect } from "effect";', "// @noErrors", "const x = Effect.succeed(1);"].join("\n");

		const result = addLogicalBlankLines(input);

		// Import → directive: no blank line (directive is excluded from Rule 1)
		// Directive → code: no blank line (directive is a comment line)
		expect(result).toBe(
			['import { Effect } from "effect";', "// @noErrors", "const x = Effect.succeed(1);"].join("\n"),
		);
	});

	it("should return empty string unchanged", () => {
		expect(addLogicalBlankLines("")).toBe("");
	});

	it("should pass through code with no triggers unchanged", () => {
		const input = ["const x = 1;", "const y = 2;", "const z = x + y;"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(input);
	});

	it("should apply all three rules correctly together", () => {
		const input = [
			'import { Effect } from "effect";',
			'import { pipe } from "effect/Function";',
			"const program = pipe(",
			"  Effect.succeed(42),",
			"  Effect.map((n) => n * 2),",
			");",
			"// Return the result",
			"return program;",
		].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(
			[
				'import { Effect } from "effect";',
				'import { pipe } from "effect/Function";',
				"", // Rule 1: after imports
				"const program = pipe(",
				"  Effect.succeed(42),",
				"  Effect.map((n) => n * 2),",
				");",
				"", // Rule 2: before section comment
				"// Return the result",
				// No Rule 3 blank here: return preceded by comment is excluded
				"return program;",
			].join("\n"),
		);
	});

	it("should handle return with parenthesis", () => {
		const input = ["const x = 1;", "return(x);"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(["const x = 1;", "", "return(x);"].join("\n"));
	});

	it("should handle return with space", () => {
		const input = ["const x = 1;", "return x + 1;"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(["const x = 1;", "", "return x + 1;"].join("\n"));
	});

	it("should handle bare return semicolon", () => {
		const input = ["doSomething();", "return;"].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(["doSomething();", "", "return;"].join("\n"));
	});

	it("should not insert blank before return when preceded by comment", () => {
		const input = ["// Done", "return x;"].join("\n");

		const result = addLogicalBlankLines(input);

		// Rule 3 excludes return when previous line is a comment
		expect(result).toBe(["// Done", "return x;"].join("\n"));
	});

	it("should insert blank after import and before comment following import", () => {
		const input = ['import { x } from "mod";', "// This comment follows an import"].join("\n");

		const result = addLogicalBlankLines(input);

		// Rule 1 fires (prev is complete import, current is non-import, non-directive)
		// Rule 2 is excluded when prevIsImportEnd to avoid double blank
		expect(result).toBe(['import { x } from "mod";', "", "// This comment follows an import"].join("\n"));
	});

	it("should handle realistic multi-line example code", () => {
		const input = [
			"// @noErrors",
			"import {",
			"  Logger,",
			"  LogLevel,",
			"  Formatters,",
			"  AsyncTask,",
			"  runTask,",
			'} from "example-module";',
			'import type { LogEntry, Result, TaskOptions } from "example-module";',
			"// Create a logger with severity filtering",
			'const logger = new Logger({ minLevel: LogLevel.Info, defaultSource: "demo" });',
			"// Register a transport that formats entries",
			"logger.addTransport((entry: LogEntry) => {",
			"  console.log(Formatters.formatEntry(entry));",
			"});",
			'logger.info("Application started");',
			"// Run an async task with timeout and logging",
			"const result: Result<string> = await runTask(",
			"  {",
			'    label: "greet",',
			'    execute: async () => "Hello, world!",',
			"    timeoutMs: 5000,",
			"    logLevel: LogLevel.Debug,",
			"  },",
			"  logger,",
			");",
			"if (result.ok) {",
			"  console.log(result.value);",
			"}",
			"// Format the result summary",
			"console.log(Formatters.formatResult(result));",
		].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(
			[
				"// @noErrors",
				"import {",
				"  Logger,",
				"  LogLevel,",
				"  Formatters,",
				"  AsyncTask,",
				"  runTask,",
				'} from "example-module";',
				'import type { LogEntry, Result, TaskOptions } from "example-module";',
				"", // Rule 1: after import block
				"// Create a logger with severity filtering",
				'const logger = new Logger({ minLevel: LogLevel.Info, defaultSource: "demo" });',
				"", // Rule 2: before section comment
				"// Register a transport that formats entries",
				"logger.addTransport((entry: LogEntry) => {",
				"  console.log(Formatters.formatEntry(entry));",
				"});",
				'logger.info("Application started");',
				"", // Rule 2: before section comment
				"// Run an async task with timeout and logging",
				"const result: Result<string> = await runTask(",
				"  {",
				'    label: "greet",',
				'    execute: async () => "Hello, world!",',
				"    timeoutMs: 5000,",
				"    logLevel: LogLevel.Debug,",
				"  },",
				"  logger,",
				");",
				"if (result.ok) {",
				"  console.log(result.value);",
				"}",
				"", // Rule 2: before section comment
				"// Format the result summary",
				"console.log(Formatters.formatResult(result));",
			].join("\n"),
		);
	});

	it("should handle consecutive multi-line imports", () => {
		const input = [
			"import {",
			"  a,",
			"  b,",
			'} from "mod-a";',
			"import {",
			"  c,",
			"  d,",
			'} from "mod-b";',
			"const x = 1;",
		].join("\n");

		const result = addLogicalBlankLines(input);

		expect(result).toBe(
			[
				"import {",
				"  a,",
				"  b,",
				'} from "mod-a";',
				"import {",
				"  c,",
				"  d,",
				'} from "mod-b";',
				"",
				"const x = 1;",
			].join("\n"),
		);
	});
});
