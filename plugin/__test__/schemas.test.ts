import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
	AutoDetectDependencies,
	CategoryConfig,
	DEFAULT_CATEGORIES,
	ErrorConfig,
	ExternalPackageSpec,
	LlmsPlugin,
	LogLevel,
	MultiApiConfig,
	OpenGraphImageConfig,
	OpenGraphImageMetadata,
	OpenGraphMetadata,
	PerformanceConfig,
	PerformanceThresholds,
	PluginOptions,
	SingleApiConfig,
	SourceConfig,
	VersionConfig,
} from "../src/schemas/index.js";

describe("OpenGraph schemas", () => {
	it("decodes OpenGraphImageMetadata", () => {
		const decode = Schema.decodeUnknownSync(OpenGraphImageMetadata);
		const result = decode({ url: "https://example.com/og.png", width: 1200, height: 630 });
		expect(result.url).toBe("https://example.com/og.png");
		expect(result.width).toBe(1200);
	});

	it("decodes OpenGraphImageMetadata with only required fields", () => {
		const decode = Schema.decodeUnknownSync(OpenGraphImageMetadata);
		const result = decode({ url: "https://example.com/og.png" });
		expect(result.url).toBe("https://example.com/og.png");
		expect(result.width).toBeUndefined();
	});

	it("rejects OpenGraphImageMetadata without url", () => {
		const decode = Schema.decodeUnknownSync(OpenGraphImageMetadata);
		expect(() => decode({ width: 1200 })).toThrow();
	});

	it("decodes OpenGraphImageConfig as string", () => {
		const decode = Schema.decodeUnknownSync(OpenGraphImageConfig);
		const result = decode("/images/og.png");
		expect(result).toBe("/images/og.png");
	});

	it("decodes OpenGraphImageConfig as metadata object", () => {
		const decode = Schema.decodeUnknownSync(OpenGraphImageConfig);
		const result = decode({ url: "https://example.com/og.png", width: 1200 });
		expect(typeof result).toBe("object");
	});

	it("decodes OpenGraphMetadata", () => {
		const decode = Schema.decodeUnknownSync(OpenGraphMetadata);
		const result = decode({
			siteUrl: "https://example.com",
			pageRoute: "/api/class/foo",
			description: "Foo class",
			publishedTime: "2025-01-01T00:00:00.000Z",
			modifiedTime: "2025-01-01T00:00:00.000Z",
			section: "Classes",
			tags: ["TypeScript", "API"],
			ogType: "article",
		});
		expect(result.siteUrl).toBe("https://example.com");
		expect(result.tags).toHaveLength(2);
	});
});

describe("Performance schemas", () => {
	it("decodes PerformanceThresholds with defaults", () => {
		const decode = Schema.decodeUnknownSync(PerformanceThresholds);
		const result = decode({});
		expect(result.slowCodeBlock).toBe(100);
		expect(result.slowPageGeneration).toBe(500);
		expect(result.slowApiLoad).toBe(1000);
		expect(result.slowFileOperation).toBe(50);
		expect(result.slowHttpRequest).toBe(2000);
		expect(result.slowDbOperation).toBe(100);
	});

	it("decodes PerformanceThresholds with overrides", () => {
		const decode = Schema.decodeUnknownSync(PerformanceThresholds);
		const result = decode({ slowCodeBlock: 200 });
		expect(result.slowCodeBlock).toBe(200);
		expect(result.slowPageGeneration).toBe(500);
	});

	it("decodes PerformanceConfig with defaults", () => {
		const decode = Schema.decodeUnknownSync(PerformanceConfig);
		const result = decode({});
		expect(result.showInsights).toBe(true);
		expect(result.trackDetailedMetrics).toBe(false);
	});
});

describe("Config leaf schemas", () => {
	it("decodes LogLevel literals", () => {
		const decode = Schema.decodeUnknownSync(LogLevel);
		expect(decode("info")).toBe("info");
		expect(decode("debug")).toBe("debug");
		expect(decode("verbose")).toBe("verbose");
		expect(decode("none")).toBe("none");
		expect(() => decode("invalid")).toThrow();
	});

	it("decodes ExternalPackageSpec", () => {
		const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
		const result = decode({ name: "zod", version: "^3.22.4" });
		expect(result.name).toBe("zod");
		expect(result.version).toBe("^3.22.4");
	});

	it("decodes ExternalPackageSpec with tsconfig string", () => {
		const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
		const result = decode({ name: "zod", version: "3.0.0", tsconfig: "tsconfig.json" });
		expect(result.tsconfig).toBe("tsconfig.json");
	});

	it("decodes ExternalPackageSpec with tsconfig function", () => {
		const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
		const fn = async () => ({ target: 9 });
		const result = decode({ name: "zod", version: "3.0.0", tsconfig: fn });
		expect(typeof result.tsconfig).toBe("function");
	});

	it("rejects ExternalPackageSpec with tsconfig number", () => {
		const decode = Schema.decodeUnknownSync(ExternalPackageSpec);
		expect(() => decode({ name: "zod", version: "3.0.0", tsconfig: 42 })).toThrow();
	});

	it("decodes AutoDetectDependencies with defaults", () => {
		const decode = Schema.decodeUnknownSync(AutoDetectDependencies);
		const result = decode({});
		expect(result.dependencies).toBe(false);
		expect(result.devDependencies).toBe(false);
		expect(result.peerDependencies).toBe(true);
		expect(result.autoDependencies).toBe(true);
	});

	it("decodes AutoDetectDependencies with overrides", () => {
		const decode = Schema.decodeUnknownSync(AutoDetectDependencies);
		const result = decode({ dependencies: true, peerDependencies: false });
		expect(result.dependencies).toBe(true);
		expect(result.peerDependencies).toBe(false);
	});

	it("decodes ErrorConfig", () => {
		const decode = Schema.decodeUnknownSync(ErrorConfig);
		expect(decode({ example: "suppress" }).example).toBe("suppress");
		expect(decode({ example: "show" }).example).toBe("show");
		expect(decode({}).example).toBeUndefined();
		expect(() => decode({ example: "invalid" })).toThrow();
	});

	it("decodes LlmsPlugin with defaults", () => {
		const decode = Schema.decodeUnknownSync(LlmsPlugin);
		const result = decode({});
		expect(result.enabled).toBe(false);
		expect(result.showCopyButton).toBe(true);
		expect(result.showViewOptions).toBe(true);
		expect(result.copyButtonText).toBe("Copy Markdown");
		expect(result.viewOptions).toEqual(["markdownLink", "chatgpt", "claude"]);
	});

	it("decodes LlmsPlugin with overrides", () => {
		const decode = Schema.decodeUnknownSync(LlmsPlugin);
		const result = decode({ enabled: true, copyButtonText: "Copy" });
		expect(result.enabled).toBe(true);
		expect(result.copyButtonText).toBe("Copy");
	});

	it("decodes CategoryConfig with defaults", () => {
		const decode = Schema.decodeUnknownSync(CategoryConfig);
		const result = decode({ displayName: "Classes", singularName: "Class", folderName: "class" });
		expect(result.collapsible).toBe(true);
		expect(result.collapsed).toBe(true);
		expect(result.overviewHeaders).toEqual([2]);
		expect(result.itemKinds).toBeUndefined();
		expect(result.tsdocModifier).toBeUndefined();
	});

	it("decodes CategoryConfig with all fields", () => {
		const decode = Schema.decodeUnknownSync(CategoryConfig);
		const result = decode({
			displayName: "Classes",
			singularName: "Class",
			folderName: "class",
			itemKinds: [1, 2],
			tsdocModifier: "@public",
			collapsible: false,
			collapsed: false,
			overviewHeaders: [2, 3],
		});
		expect(result.itemKinds).toEqual([1, 2]);
		expect(result.tsdocModifier).toBe("@public");
		expect(result.collapsible).toBe(false);
	});

	it("decodes SourceConfig", () => {
		const decode = Schema.decodeUnknownSync(SourceConfig);
		const result = decode({ url: "https://github.com/org/repo" });
		expect(result.url).toBe("https://github.com/org/repo");
		expect(result.ref).toBeUndefined();
	});

	it("decodes SourceConfig with ref", () => {
		const decode = Schema.decodeUnknownSync(SourceConfig);
		const result = decode({ url: "https://github.com/org/repo", ref: "main" });
		expect(result.ref).toBe("main");
	});

	it("DEFAULT_CATEGORIES has 7 categories", () => {
		expect(Object.keys(DEFAULT_CATEGORIES)).toHaveLength(7);
		expect(DEFAULT_CATEGORIES.classes.folderName).toBe("class");
		expect(DEFAULT_CATEGORIES.interfaces.folderName).toBe("interface");
		expect(DEFAULT_CATEGORIES.functions.folderName).toBe("function");
		expect(DEFAULT_CATEGORIES.types.folderName).toBe("type");
		expect(DEFAULT_CATEGORIES.enums.folderName).toBe("enum");
		expect(DEFAULT_CATEGORIES.variables.folderName).toBe("variable");
		expect(DEFAULT_CATEGORIES.namespaces.folderName).toBe("namespace");
	});
});

describe("Config composite schemas", () => {
	it("decodes VersionConfig", () => {
		const decode = Schema.decodeUnknownSync(VersionConfig);
		const result = decode({ model: "temp/v1.api.json" });
		expect(result.model).toBe("temp/v1.api.json");
	});

	it("decodes VersionConfig with source", () => {
		const decode = Schema.decodeUnknownSync(VersionConfig);
		const result = decode({
			model: "temp/v1.api.json",
			source: { url: "https://github.com/org/repo", ref: "blob/v1" },
		});
		expect(result.source?.url).toBe("https://github.com/org/repo");
	});

	it("decodes SingleApiConfig minimal", () => {
		const decode = Schema.decodeUnknownSync(SingleApiConfig);
		const result = decode({ packageName: "my-lib", model: "temp/my-lib.api.json" });
		expect(result.packageName).toBe("my-lib");
	});

	it("decodes SingleApiConfig with versions", () => {
		const decode = Schema.decodeUnknownSync(SingleApiConfig);
		const result = decode({
			packageName: "my-lib",
			versions: {
				v1: "temp/v1.api.json",
				v2: { model: "temp/v2.api.json" },
			},
		});
		expect(result.versions).toBeDefined();
		expect(Object.keys(result.versions ?? {})).toHaveLength(2);
	});

	it("decodes SingleApiConfig with apiFolder null", () => {
		const decode = Schema.decodeUnknownSync(SingleApiConfig);
		const result = decode({ packageName: "my-lib", model: "x", apiFolder: null });
		expect(result.apiFolder).toBeNull();
	});

	it("decodes MultiApiConfig with required model", () => {
		const decode = Schema.decodeUnknownSync(MultiApiConfig);
		const result = decode({ packageName: "my-lib", model: "temp/my-lib.api.json" });
		expect(result.model).toBe("temp/my-lib.api.json");
	});

	it("rejects MultiApiConfig without model", () => {
		const decode = Schema.decodeUnknownSync(MultiApiConfig);
		expect(() => decode({ packageName: "my-lib" })).toThrow();
	});

	it("decodes PluginOptions single-api mode", () => {
		const decode = Schema.decodeUnknownSync(PluginOptions);
		const result = decode({
			api: { packageName: "my-lib", model: "temp/my-lib.api.json" },
		});
		expect(result.api?.packageName).toBe("my-lib");
	});

	it("decodes PluginOptions multi-api mode", () => {
		const decode = Schema.decodeUnknownSync(PluginOptions);
		const result = decode({
			apis: [{ packageName: "core", model: "temp/core.api.json" }],
		});
		expect(result.apis).toHaveLength(1);
	});

	it("decodes PluginOptions with llmsPlugin boolean", () => {
		const decode = Schema.decodeUnknownSync(PluginOptions);
		const result = decode({
			api: { packageName: "x", model: "y" },
			llmsPlugin: true,
		});
		expect(result.llmsPlugin).toBe(true);
	});

	it("decodes PluginOptions with llmsPlugin object", () => {
		const decode = Schema.decodeUnknownSync(PluginOptions);
		const result = decode({
			api: { packageName: "x", model: "y" },
			llmsPlugin: { enabled: true, showCopyButton: false },
		});
		expect(typeof result.llmsPlugin).toBe("object");
	});
});
