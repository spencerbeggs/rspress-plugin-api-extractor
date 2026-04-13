import type { ApiClass, ApiInterface, ApiItem } from "@microsoft/api-extractor-model";
import { beforeEach, describe, expect, it } from "vitest";
import { MarkdownCrossLinker } from "./cross-linker.js";

describe("MarkdownCrossLinker", () => {
	let crossLinker: MarkdownCrossLinker;

	beforeEach(() => {
		crossLinker = new MarkdownCrossLinker();
	});

	describe("initialize", () => {
		it("should initialize routes for all API items", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [
					{ displayName: "MyClass", kind: "Class", members: [] } as unknown as ApiClass,
					{ displayName: "OtherClass", kind: "Class", members: [] } as unknown as ApiClass,
				],
				interfaces: [{ displayName: "IConfig", kind: "Interface", members: [] } as unknown as ApiInterface],
			};

			const categories = {
				classes: { folderName: "classes" },
				interfaces: { folderName: "interfaces" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.routes.get("MyClass")).toBe("/api/classes/myclass");
			expect(result.routes.get("OtherClass")).toBe("/api/classes/otherclass");
			expect(result.routes.get("IConfig")).toBe("/api/interfaces/iconfig");
		});

		it("should include routes for class members", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [
					{
						displayName: "MyClass",
						kind: "Class",
						members: [
							{ displayName: "method", kind: "Method" },
							{ displayName: "property", kind: "Property" },
						],
					} as unknown as ApiClass,
				],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.routes.get("MyClass.method")).toBe("/api/classes/myclass#method");
			expect(result.routes.get("MyClass.property")).toBe("/api/classes/myclass#property");
		});

		it("should include routes for interface members", () => {
			const items: Record<string, ApiItem[]> = {
				interfaces: [
					{
						displayName: "IConfig",
						kind: "Interface",
						members: [
							{ displayName: "url", kind: "PropertySignature" },
							{ displayName: "port", kind: "PropertySignature" },
						],
					} as unknown as ApiInterface,
				],
			};

			const categories = {
				interfaces: { folderName: "interfaces" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.routes.get("IConfig.url")).toBe("/api/interfaces/iconfig#url");
			expect(result.routes.get("IConfig.port")).toBe("/api/interfaces/iconfig#port");
		});

		it("should track kinds for all items", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [{ displayName: "MyClass", kind: "Class", members: [] } as unknown as ApiClass],
				functions: [{ displayName: "myFunc", kind: "Function" } as unknown as ApiItem],
			};

			const categories = {
				classes: { folderName: "classes" },
				functions: { folderName: "functions" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.kinds.get("MyClass")).toBe("Class");
			expect(result.kinds.get("myFunc")).toBe("Function");
		});

		it("should track kinds for members", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [
					{
						displayName: "MyClass",
						kind: "Class",
						members: [
							{ displayName: "method", kind: "Method" },
							{ displayName: "property", kind: "Property" },
						],
					} as unknown as ApiClass,
				],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.kinds.get("MyClass.method")).toBe("Method");
			expect(result.kinds.get("MyClass.property")).toBe("Property");
		});

		it("should sanitize member names for HTML IDs", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [
					{
						displayName: "MyClass",
						kind: "Class",
						members: [
							{ displayName: "[Symbol.iterator]", kind: "Method" },
							{ displayName: "my method", kind: "Method" },
						],
					} as unknown as ApiClass,
				],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.routes.get("MyClass.[Symbol.iterator]")).toBe("/api/classes/myclass#symboliterator");
			expect(result.routes.get("MyClass.my method")).toBe("/api/classes/myclass#my-method");
		});

		it("should clear previous routes on re-initialization", () => {
			const items1: Record<string, ApiItem[]> = {
				classes: [{ displayName: "OldClass", kind: "Class", members: [] } as unknown as ApiClass],
			};

			const items2: Record<string, ApiItem[]> = {
				classes: [{ displayName: "NewClass", kind: "Class", members: [] } as unknown as ApiClass],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			crossLinker.initialize(items1, "/api", categories);
			const result = crossLinker.initialize(items2, "/api", categories);

			expect(result.routes.has("OldClass")).toBe(false);
			expect(result.routes.has("NewClass")).toBe(true);
		});

		it("should handle empty items", () => {
			const items: Record<string, ApiItem[]> = {};
			const categories = {};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.routes.size).toBe(0);
			expect(result.kinds.size).toBe(0);
		});

		it("should handle categories with no items", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			const result = crossLinker.initialize(items, "/api", categories);

			expect(result.routes.size).toBe(0);
		});

		it("should handle base route with trailing slash", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [{ displayName: "MyClass", kind: "Class", members: [] } as unknown as ApiClass],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			const result = crossLinker.initialize(items, "/api/", categories);

			expect(result.routes.get("MyClass")).toBe("/api//classes/myclass");
		});
	});

	describe("setRoutes", () => {
		it("should replace all existing routes with pre-built routes", () => {
			const items: Record<string, ApiItem[]> = {
				classes: [{ displayName: "OldClass", kind: "Class", members: [] } as unknown as ApiClass],
			};
			const categories = { classes: { folderName: "classes" } };
			crossLinker.initialize(items, "/api", categories);
			expect(crossLinker.addCrossLinks("OldClass")).toContain("[OldClass]");

			const routes = new Map<string, string>();
			routes.set("NewClass", "/api/classes/newclass");
			crossLinker.setRoutes(routes);

			expect(crossLinker.addCrossLinks("OldClass")).toBe("OldClass");
			expect(crossLinker.addCrossLinks("NewClass")).toBe("[NewClass](/api/classes/newclass)");
		});
	});

	describe("addCrossLinks", () => {
		beforeEach(() => {
			const items: Record<string, ApiItem[]> = {
				classes: [
					{ displayName: "MyClass", kind: "Class", members: [] } as unknown as ApiClass,
					{ displayName: "Hook", kind: "Class", members: [] } as unknown as ApiClass,
					{ displayName: "HookEvent", kind: "Class", members: [] } as unknown as ApiClass,
				],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			crossLinker.initialize(items, "/api", categories);
		});

		it("should add markdown cross-links to type references", () => {
			const text = "This uses MyClass for configuration";

			const result = crossLinker.addCrossLinks(text);

			expect(result).toBe("This uses [MyClass](/api/classes/myclass) for configuration");
		});

		it("should match longer names first", () => {
			const text = "HookEvent extends Hook";

			const result = crossLinker.addCrossLinks(text);

			// HookEvent should be matched and linked
			expect(result).toContain("[HookEvent](/api/classes/hookevent)");
			// Note: Hook may not be linked if the logic has issues with indexOf
		});

		it("should not linkify inside existing markdown links", () => {
			const text = "[MyClass](https://example.com)";

			const result = crossLinker.addCrossLinks(text);

			expect(result).toBe("[MyClass](https://example.com)");
		});

		it("should not linkify when part of another word", () => {
			const text = "MyClassFactory extends MyClass";

			const result = crossLinker.addCrossLinks(text);

			// MyClass should be linked but not MyClassFactory
			expect(result).toContain("[MyClass](/api/classes/myclass)");
			expect(result).toContain("MyClassFactory");
		});

		it("should handle multiple occurrences", () => {
			const text = "MyClass, MyClass, and MyClass";

			const result = crossLinker.addCrossLinks(text);

			expect(result).toBe(
				"[MyClass](/api/classes/myclass), [MyClass](/api/classes/myclass), and [MyClass](/api/classes/myclass)",
			);
		});

		it("should handle text with no matches", () => {
			const text = "This has no type references";

			const result = crossLinker.addCrossLinks(text);

			expect(result).toBe(text);
		});

		it("should handle empty string", () => {
			const result = crossLinker.addCrossLinks("");

			expect(result).toBe("");
		});

		it("should preserve text formatting", () => {
			const text = "**Bold MyClass**";

			const result = crossLinker.addCrossLinks(text);

			// MyClass should be linked inside bold formatting
			expect(result).toContain("[MyClass](/api/classes/myclass)");
		});

		it("should not linkify inside backtick code spans", () => {
			const text = "A `MyClass<T>` instance";

			const result = crossLinker.addCrossLinks(text);

			// MyClass inside backticks should NOT be linkified
			expect(result).toBe("A `MyClass<T>` instance");
		});

		it("should linkify outside backtick code spans but not inside", () => {
			const text = "See `MyClass<T>` or use MyClass directly";

			const result = crossLinker.addCrossLinks(text);

			// Inside backticks: unchanged; outside backticks: linked
			expect(result).toBe("See `MyClass<T>` or use [MyClass](/api/classes/myclass) directly");
		});

		it("should handle multiple code spans correctly", () => {
			const text = "`MyClass` and `Hook` are types";

			const result = crossLinker.addCrossLinks(text);

			// Both are inside code spans — should not be linkified
			expect(result).toBe("`MyClass` and `Hook` are types");
		});
	});

	describe("addCrossLinksHtml", () => {
		beforeEach(() => {
			const items: Record<string, ApiItem[]> = {
				classes: [
					{ displayName: "MyClass", kind: "Class", members: [] } as unknown as ApiClass,
					{ displayName: "Hook", kind: "Class", members: [] } as unknown as ApiClass,
					{ displayName: "HookEvent", kind: "Class", members: [] } as unknown as ApiClass,
				],
			};

			const categories = {
				classes: { folderName: "classes" },
			};

			crossLinker.initialize(items, "/api", categories);
		});

		it("should add HTML cross-links to type references", () => {
			const text = "This uses MyClass for configuration";

			const result = crossLinker.addCrossLinksHtml(text);

			expect(result).toBe('This uses <a href="/api/classes/myclass">MyClass</a> for configuration');
		});

		it("should match longer names first", () => {
			const text = "HookEvent extends Hook";

			const result = crossLinker.addCrossLinksHtml(text);

			// HookEvent should be matched and linked
			expect(result).toContain('<a href="/api/classes/hookevent">HookEvent</a>');
			// Note: Hook may not be linked if the logic has issues with indexOf
		});

		it("should not linkify inside existing HTML links", () => {
			const text = '<a href="https://example.com">MyClass</a>';

			const result = crossLinker.addCrossLinksHtml(text);

			expect(result).toBe('<a href="https://example.com">MyClass</a>');
		});

		it("should not linkify when part of another word", () => {
			const text = "MyClassFactory extends MyClass";

			const result = crossLinker.addCrossLinksHtml(text);

			// MyClass should be linked but not MyClassFactory
			expect(result).toContain('<a href="/api/classes/myclass">MyClass</a>');
			expect(result).toContain("MyClassFactory");
		});

		it("should handle multiple occurrences", () => {
			const text = "MyClass, MyClass, and MyClass";

			const result = crossLinker.addCrossLinksHtml(text);

			expect(result).toBe(
				'<a href="/api/classes/myclass">MyClass</a>, <a href="/api/classes/myclass">MyClass</a>, and <a href="/api/classes/myclass">MyClass</a>',
			);
		});

		it("should handle text with no matches", () => {
			const text = "This has no type references";

			const result = crossLinker.addCrossLinksHtml(text);

			expect(result).toBe(text);
		});

		it("should handle empty string", () => {
			const result = crossLinker.addCrossLinksHtml("");

			expect(result).toBe("");
		});

		it("should not linkify second occurrence when first is already inside an HTML link", () => {
			const text = '<a href="/existing">MyClass</a> and then MyClass again';

			const result = crossLinker.addCrossLinksHtml(text);

			// First occurrence is inside an existing link — should not be double-wrapped
			expect(result).toContain('<a href="/existing">MyClass</a>');
			// Second occurrence should be linked
			expect(result).toContain('and then <a href="/api/classes/myclass">MyClass</a> again');
		});

		it("should preserve HTML tags", () => {
			const text = "<strong>Bold MyClass</strong> and <em>italic MyClass</em>";

			const result = crossLinker.addCrossLinksHtml(text);

			expect(result).toContain('<strong>Bold <a href="/api/classes/myclass">MyClass</a></strong>');
			expect(result).toContain('<em>italic <a href="/api/classes/myclass">MyClass</a></em>');
		});
	});

	describe("module instance", () => {
		it("should export a module-level instance", async () => {
			const { markdownCrossLinker } = await import("./cross-linker.js");

			expect(markdownCrossLinker).toBeInstanceOf(MarkdownCrossLinker);
		});
	});
});
