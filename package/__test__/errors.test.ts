import { describe, expect, it } from "vitest";
import {
	ApiModelLoadError,
	ConfigValidationError,
	PageGenerationError,
	PathDerivationError,
	PrettierFormatError,
	SnapshotDbError,
	TwoslashProcessingError,
	TypeRegistryError,
} from "../src/errors.js";

describe("TaggedError types", () => {
	it("ConfigValidationError has correct tag, fields, and message", () => {
		const err = new ConfigValidationError({
			field: "api.model",
			reason: "Required when multiVersion is not active",
		});
		expect(err._tag).toBe("ConfigValidationError");
		expect(err.field).toBe("api.model");
		expect(err.reason).toBe("Required when multiVersion is not active");
		expect(err.message).toBe("Config validation failed for 'api.model': Required when multiVersion is not active");
	});

	it("ApiModelLoadError has correct tag, fields, and message", () => {
		const err = new ApiModelLoadError({
			modelPath: "/path/to/model.api.json",
			reason: "File not found",
		});
		expect(err._tag).toBe("ApiModelLoadError");
		expect(err.modelPath).toBe("/path/to/model.api.json");
		expect(err.reason).toBe("File not found");
		expect(err.message).toBe("Failed to load API model at '/path/to/model.api.json': File not found");
	});

	it("SnapshotDbError has correct tag, fields, and message", () => {
		const err = new SnapshotDbError({
			operation: "upsert",
			dbPath: "/path/to/db",
			reason: "SQLITE_BUSY",
		});
		expect(err._tag).toBe("SnapshotDbError");
		expect(err.operation).toBe("upsert");
		expect(err.dbPath).toBe("/path/to/db");
		expect(err.reason).toBe("SQLITE_BUSY");
		expect(err.message).toBe("Snapshot DB error during 'upsert' at '/path/to/db': SQLITE_BUSY");
	});

	it("PathDerivationError has correct tag, fields, and message", () => {
		const err = new PathDerivationError({
			route: "/invalid//route",
			reason: "Double slash in route",
		});
		expect(err._tag).toBe("PathDerivationError");
		expect(err.route).toBe("/invalid//route");
		expect(err.reason).toBe("Double slash in route");
		expect(err.message).toBe("Path derivation error for route '/invalid//route': Double slash in route");
	});

	it("TypeRegistryError has correct tag, fields, and message", () => {
		const err = new TypeRegistryError({
			packageName: "zod",
			version: "^3.22.4",
			reason: "Network timeout",
		});
		expect(err._tag).toBe("TypeRegistryError");
		expect(err.packageName).toBe("zod");
		expect(err.version).toBe("^3.22.4");
		expect(err.reason).toBe("Network timeout");
		expect(err.message).toBe("Type registry error for 'zod@^3.22.4': Network timeout");
	});

	it("PageGenerationError has correct tag, fields, and message", () => {
		const err = new PageGenerationError({
			itemName: "MyClass",
			category: "class",
			reason: "Failed to generate signature",
		});
		expect(err._tag).toBe("PageGenerationError");
		expect(err.itemName).toBe("MyClass");
		expect(err.category).toBe("class");
		expect(err.reason).toBe("Failed to generate signature");
		expect(err.message).toBe("Page generation failed for class 'MyClass': Failed to generate signature");
	});

	it("TwoslashProcessingError has correct tag, fields, and message", () => {
		const err = new TwoslashProcessingError({
			file: "api/class/MyClass.mdx",
			errorCode: "TS2440",
			reason: "Import conflicts",
		});
		expect(err._tag).toBe("TwoslashProcessingError");
		expect(err.file).toBe("api/class/MyClass.mdx");
		expect(err.errorCode).toBe("TS2440");
		expect(err.reason).toBe("Import conflicts");
		expect(err.message).toBe("Twoslash error TS2440 in 'api/class/MyClass.mdx': Import conflicts");
	});

	it("PrettierFormatError has correct tag, fields, and message", () => {
		const err = new PrettierFormatError({
			file: "api/class/MyClass.mdx",
			reason: "Parse error",
		});
		expect(err._tag).toBe("PrettierFormatError");
		expect(err.file).toBe("api/class/MyClass.mdx");
		expect(err.reason).toBe("Parse error");
		expect(err.message).toBe("Prettier format error in 'api/class/MyClass.mdx': Parse error");
	});
});
