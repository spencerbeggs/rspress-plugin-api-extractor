import { describe, expect, it } from "vitest";
import { validatePluginOptions } from "./config-validation.js";
import type { ApiExtractorPluginOptions } from "./types.js";

describe("validatePluginOptions", () => {
	it("errors when both api and apis provided", () => {
		expect(() =>
			validatePluginOptions(
				{
					api: { packageName: "foo", model: "x" },
					apis: [{ packageName: "bar", model: "y" }],
				} as unknown as ApiExtractorPluginOptions,
				{},
			),
		).toThrow("Cannot provide both");
	});

	it("errors when neither api nor apis provided", () => {
		expect(() => validatePluginOptions({} as unknown as ApiExtractorPluginOptions, {})).toThrow("Must provide either");
	});

	it("errors when apis used with multiVersion", () => {
		expect(() =>
			validatePluginOptions(
				{ apis: [{ packageName: "foo", model: "x" }] },
				{ multiVersion: { default: "v1", versions: ["v1"] } },
			),
		).toThrow("not supported");
	});

	it("errors when multiVersion active but no versions map", () => {
		expect(() =>
			validatePluginOptions(
				{ api: { packageName: "foo", model: "x" } },
				{ multiVersion: { default: "v1", versions: ["v1"] } },
			),
		).toThrow("required when multiVersion");
	});

	it("errors when version keys don't match multiVersion.versions", () => {
		expect(() =>
			validatePluginOptions(
				{
					api: {
						packageName: "foo",
						versions: { v1: { model: "x" } },
					},
				},
				{ multiVersion: { default: "v1", versions: ["v1", "v2"] } },
			),
		).toThrow("must exactly match");
	});

	it("errors when api.versions has extra keys", () => {
		expect(() =>
			validatePluginOptions(
				{
					api: {
						packageName: "foo",
						versions: {
							v1: { model: "x" },
							v2: { model: "y" },
							v3: { model: "z" },
						},
					},
				},
				{ multiVersion: { default: "v1", versions: ["v1", "v2"] } },
			),
		).toThrow("must exactly match");
	});

	it("warns when versions provided without multiVersion", () => {
		const warnings: string[] = [];
		validatePluginOptions(
			{
				api: {
					packageName: "foo",
					model: "x",
					versions: { v1: { model: "y" } },
				},
			},
			{},
			(msg: string) => warnings.push(msg),
		);
		expect(warnings[0]).toContain("versions");
	});

	it("errors when single-api model missing without multiVersion", () => {
		expect(() =>
			validatePluginOptions({ api: { packageName: "foo" } } as unknown as ApiExtractorPluginOptions, {}),
		).toThrow("model");
	});

	it("passes valid single-api config", () => {
		expect(() => validatePluginOptions({ api: { packageName: "foo", model: "x" } }, {})).not.toThrow();
	});

	it("passes valid multi-api config", () => {
		expect(() => validatePluginOptions({ apis: [{ packageName: "foo", model: "x" }] }, {})).not.toThrow();
	});

	it("passes valid versioned single-api config", () => {
		expect(() =>
			validatePluginOptions(
				{
					api: {
						packageName: "foo",
						versions: {
							v1: { model: "x" },
							v2: { model: "y" },
						},
					},
				},
				{
					multiVersion: {
						default: "v2",
						versions: ["v1", "v2"],
					},
				},
			),
		).not.toThrow();
	});
});
