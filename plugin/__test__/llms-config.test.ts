/**
 * Tests for LlmsPlugin schema defaults and config normalization/merge utilities.
 *
 * The design principle is "enabled by default, opt out" — when a user sets
 * `llms: true` in their RSPress config, all LLMs features activate without
 * extra configuration.
 */

import { Schema } from "effect";
import { describe, expect, it } from "vitest";
import { mergeLlmsPluginConfig, normalizeLlmsPluginConfig } from "../src/config-utils.js";
import { LlmsPlugin } from "../src/schemas/index.js";

describe("LlmsPlugin schema", () => {
	const decode = Schema.decodeUnknownSync(LlmsPlugin);

	it("defaults enabled to true", () => {
		const result = decode({});
		expect(result.enabled).toBe(true);
	});

	it("defaults scopes to true", () => {
		const result = decode({});
		expect(result.scopes).toBe(true);
	});

	it("defaults apiTxt to true", () => {
		const result = decode({});
		expect(result.apiTxt).toBe(true);
	});

	it("allows opting out of enabled", () => {
		const result = decode({ enabled: false });
		expect(result.enabled).toBe(false);
	});

	it("allows opting out of scopes", () => {
		const result = decode({ scopes: false });
		expect(result.scopes).toBe(false);
	});

	it("allows opting out of apiTxt", () => {
		const result = decode({ apiTxt: false });
		expect(result.apiTxt).toBe(false);
	});

	it("preserves other defaults when overriding a single field", () => {
		const result = decode({ scopes: false });
		expect(result.enabled).toBe(true);
		expect(result.apiTxt).toBe(true);
		expect(result.showCopyButton).toBe(true);
	});
});

describe("normalizeLlmsPluginConfig", () => {
	it("treats undefined as enabled", () => {
		const result = normalizeLlmsPluginConfig(undefined);
		expect(result.enabled).toBe(true);
	});

	it("treats true as enabled", () => {
		const result = normalizeLlmsPluginConfig(true);
		expect(result.enabled).toBe(true);
	});

	it("treats false as disabled", () => {
		const result = normalizeLlmsPluginConfig(false);
		expect(result.enabled).toBe(false);
	});

	it("passes through an LlmsPlugin object with enabled: true", () => {
		const result = normalizeLlmsPluginConfig({ enabled: true, showCopyButton: false });
		expect(result.enabled).toBe(true);
		expect(result.showCopyButton).toBe(false);
	});

	it("passes through an LlmsPlugin object with enabled: false", () => {
		const result = normalizeLlmsPluginConfig({ enabled: false });
		expect(result.enabled).toBe(false);
	});
});

describe("mergeLlmsPluginConfig", () => {
	it("has all features enabled when no config provided", () => {
		const result = mergeLlmsPluginConfig();
		expect(result.enabled).toBe(true);
		expect(result.showCopyButton).toBe(true);
		expect(result.showViewOptions).toBe(true);
		expect(result.scopes).toBe(true);
		expect(result.apiTxt).toBe(true);
	});

	it("has all features enabled when global is true", () => {
		const result = mergeLlmsPluginConfig(true);
		expect(result.enabled).toBe(true);
		expect(result.scopes).toBe(true);
		expect(result.apiTxt).toBe(true);
	});

	it("is disabled when global is false", () => {
		const result = mergeLlmsPluginConfig(false);
		expect(result.enabled).toBe(false);
	});

	it("version config overrides api config", () => {
		const result = mergeLlmsPluginConfig(true, { showCopyButton: true }, { showCopyButton: false });
		expect(result.showCopyButton).toBe(false);
	});

	it("api config overrides global config", () => {
		const result = mergeLlmsPluginConfig({ enabled: true, copyButtonText: "Global" }, { copyButtonText: "API" });
		expect(result.copyButtonText).toBe("API");
	});

	it("version can override scopes and apiTxt", () => {
		const result = mergeLlmsPluginConfig(true, undefined, { scopes: false, apiTxt: false });
		expect(result.scopes).toBe(false);
		expect(result.apiTxt).toBe(false);
	});

	it("defaults scopes and apiTxt when enabled and not specified", () => {
		const result = mergeLlmsPluginConfig({ enabled: true }, {});
		expect(result.scopes).toBe(true);
		expect(result.apiTxt).toBe(true);
	});
});
