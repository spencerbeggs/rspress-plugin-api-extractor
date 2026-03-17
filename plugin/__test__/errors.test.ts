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
	it("ApiModelLoadError has correct tag and fields", () => {
		const err = new ApiModelLoadError({
			modelPath: "/path/to/model.api.json",
			reason: "File not found",
		});
		expect(err._tag).toBe("ApiModelLoadError");
		expect(err.modelPath).toBe("/path/to/model.api.json");
		expect(err.reason).toBe("File not found");
		expect(err.message).toContain("/path/to/model.api.json");
	});

	it("ConfigValidationError has correct tag", () => {
		const err = new ConfigValidationError({
			field: "api.model",
			reason: "Required when multiVersion is not active",
		});
		expect(err._tag).toBe("ConfigValidationError");
		expect(err.field).toBe("api.model");
	});

	it("SnapshotDbError has correct tag", () => {
		const err = new SnapshotDbError({
			operation: "upsert",
			dbPath: "/path/to/db",
			reason: "SQLITE_BUSY",
		});
		expect(err._tag).toBe("SnapshotDbError");
		expect(err.operation).toBe("upsert");
	});

	it("PageGenerationError has correct tag", () => {
		const err = new PageGenerationError({
			itemName: "MyClass",
			category: "class",
			reason: "Failed to generate signature",
		});
		expect(err._tag).toBe("PageGenerationError");
	});

	it("TwoslashProcessingError has correct tag", () => {
		const err = new TwoslashProcessingError({
			file: "api/class/MyClass.mdx",
			errorCode: "TS2440",
			reason: "Import conflicts",
		});
		expect(err._tag).toBe("TwoslashProcessingError");
	});

	it("TypeRegistryError has correct tag", () => {
		const err = new TypeRegistryError({
			packageName: "zod",
			version: "^3.22.4",
			reason: "Network timeout",
		});
		expect(err._tag).toBe("TypeRegistryError");
	});

	it("PathDerivationError has correct tag", () => {
		const err = new PathDerivationError({
			route: "/invalid//route",
			reason: "Double slash in route",
		});
		expect(err._tag).toBe("PathDerivationError");
	});

	it("PrettierFormatError has correct tag", () => {
		const err = new PrettierFormatError({
			file: "api/class/MyClass.mdx",
			reason: "Parse error",
		});
		expect(err._tag).toBe("PrettierFormatError");
	});
});
