import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import {
	OpenGraphImageConfig,
	OpenGraphImageMetadata,
	OpenGraphMetadata,
	PerformanceConfig,
	PerformanceThresholds,
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
