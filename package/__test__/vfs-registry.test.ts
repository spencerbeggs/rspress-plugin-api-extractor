import { beforeEach, describe, expect, it } from "vitest";
import type { VfsConfig } from "../src/vfs-registry.js";
import { VfsRegistry } from "../src/vfs-registry.js";

// Minimal mock VfsConfig for testing
function makeConfig(overrides: Partial<VfsConfig> = {}): VfsConfig {
	return {
		vfs: new Map(),
		// biome-ignore lint/suspicious/noExplicitAny: test mock
		highlighter: {} as any,
		packageName: overrides.packageName ?? "test-package",
		apiScope: overrides.apiScope ?? "test-scope",
		...overrides,
	};
}

describe("VfsRegistry", () => {
	beforeEach(() => {
		VfsRegistry.clear();
	});

	it("register() stores a config by scope", () => {
		const config = makeConfig({ apiScope: "my-api" });
		VfsRegistry.register("my-api", config);
		expect(VfsRegistry.get("my-api")).toBe(config);
	});

	it("get() returns undefined for unknown scope", () => {
		expect(VfsRegistry.get("nonexistent")).toBeUndefined();
	});

	it("get() retrieves the correct config when multiple are registered", () => {
		const config1 = makeConfig({ apiScope: "api-1", packageName: "pkg-1" });
		const config2 = makeConfig({ apiScope: "api-2", packageName: "pkg-2" });
		VfsRegistry.register("api-1", config1);
		VfsRegistry.register("api-2", config2);

		expect(VfsRegistry.get("api-1")).toBe(config1);
		expect(VfsRegistry.get("api-2")).toBe(config2);
	});

	it("clear() removes all entries", () => {
		VfsRegistry.register("a", makeConfig());
		VfsRegistry.register("b", makeConfig());
		expect(VfsRegistry.hasConfigs()).toBe(true);

		VfsRegistry.clear();
		expect(VfsRegistry.hasConfigs()).toBe(false);
		expect(VfsRegistry.get("a")).toBeUndefined();
	});

	it("hasConfigs() returns false when empty", () => {
		expect(VfsRegistry.hasConfigs()).toBe(false);
	});

	it("hasConfigs() returns true after registration", () => {
		VfsRegistry.register("scope", makeConfig());
		expect(VfsRegistry.hasConfigs()).toBe(true);
	});

	it("getScopes() returns all registered scopes", () => {
		VfsRegistry.register("alpha", makeConfig());
		VfsRegistry.register("beta", makeConfig());
		VfsRegistry.register("gamma", makeConfig());

		const scopes = VfsRegistry.getScopes();
		expect(scopes).toHaveLength(3);
		expect(scopes).toContain("alpha");
		expect(scopes).toContain("beta");
		expect(scopes).toContain("gamma");
	});

	it("getScopes() returns empty array when no configs registered", () => {
		expect(VfsRegistry.getScopes()).toEqual([]);
	});

	it("getByFilePath() returns config for matching path", () => {
		const config = makeConfig({ apiScope: "my-pkg" });
		VfsRegistry.register("my-pkg", config);

		const result = VfsRegistry.getByFilePath("/project/docs/en/my-pkg/class/Foo.mdx");
		expect(result).toBe(config);
	});

	it("getByFilePath() returns undefined for non-matching path", () => {
		VfsRegistry.register("my-pkg", makeConfig());

		const result = VfsRegistry.getByFilePath("/some/random/path.ts");
		expect(result).toBeUndefined();
	});

	it("getByFilePath() handles Windows-style paths", () => {
		const config = makeConfig({ apiScope: "my-pkg" });
		VfsRegistry.register("my-pkg", config);

		const result = VfsRegistry.getByFilePath("C:\\project\\docs\\en\\my-pkg\\class\\Foo.mdx");
		expect(result).toBe(config);
	});

	it("getByFilePath() handles website/docs/en pattern", () => {
		const config = makeConfig({ apiScope: "my-pkg" });
		VfsRegistry.register("my-pkg", config);

		const result = VfsRegistry.getByFilePath("/project/website/docs/en/my-pkg/interface/Bar.mdx");
		expect(result).toBe(config);
	});

	it("register() overwrites existing config for same scope", () => {
		const config1 = makeConfig({ packageName: "old" });
		const config2 = makeConfig({ packageName: "new" });

		VfsRegistry.register("scope", config1);
		VfsRegistry.register("scope", config2);

		expect(VfsRegistry.get("scope")).toBe(config2);
		expect(VfsRegistry.getScopes()).toHaveLength(1);
	});
});
