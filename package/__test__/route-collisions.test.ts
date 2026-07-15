import { describe, expect, it } from "vitest";
import type { RouteCandidate, RouteCollision } from "../src/route-collisions.js";
import { assertNoRouteCollisions, detectRouteCollisions, formatRouteCollisionError } from "../src/route-collisions.js";

function c(over: Partial<RouteCandidate> & { id: string }): RouteCandidate {
	return {
		displayName: over.id,
		folder: "variable",
		baseName: "foo",
		kind: "Variable",
		canonicalRef: over.id,
		...over,
	};
}

describe("detectRouteCollisions", () => {
	it("returns no collisions for companion pairs (different folders)", () => {
		const collisions = detectRouteCollisions([
			c({ id: "Foo::Variable", displayName: "Foo", folder: "variable", baseName: "foo", kind: "Variable" }),
			c({ id: "Foo::TypeAlias", displayName: "Foo", folder: "type", baseName: "foo", kind: "TypeAlias" }),
		]);
		expect(collisions).toEqual([]);
	});

	it("returns no collisions when all routes are unique", () => {
		const collisions = detectRouteCollisions([
			c({ id: "A", displayName: "A", folder: "class", baseName: "a", kind: "Class" }),
			c({ id: "B", displayName: "B", folder: "class", baseName: "b", kind: "Class" }),
		]);
		expect(collisions).toEqual([]);
	});

	it("detects a case-only clash (same folder + baseName + kind)", () => {
		const collisions = detectRouteCollisions([
			c({
				id: "Foo::Variable",
				displayName: "Foo",
				folder: "variable",
				baseName: "foo",
				kind: "Variable",
				canonicalRef: "pkg!Foo:var",
			}),
			c({
				id: "foo::Variable",
				displayName: "foo",
				folder: "variable",
				baseName: "foo",
				kind: "Variable",
				canonicalRef: "pkg!foo:var",
			}),
		]);
		expect(collisions).toHaveLength(1);
		expect(collisions[0]?.route).toBe("variable/foo");
		expect(collisions[0]?.items.map((i) => i.displayName).sort()).toEqual(["Foo", "foo"]);
	});

	it("detects a custom merged-category collision (same folder, different kinds)", () => {
		const collisions = detectRouteCollisions([
			c({
				id: "run::Variable",
				displayName: "run",
				folder: "values",
				baseName: "run",
				kind: "Variable",
				canonicalRef: "pkg!run:var",
			}),
			c({
				id: "run::Function",
				displayName: "run",
				folder: "values",
				baseName: "run",
				kind: "Function",
				canonicalRef: "pkg!run:func",
			}),
		]);
		expect(collisions).toHaveLength(1);
		expect(collisions[0]?.items).toHaveLength(2);
	});

	it("returns multiple independent collisions deterministically", () => {
		const collisions = detectRouteCollisions([
			c({ id: "b1", displayName: "B", folder: "class", baseName: "b", kind: "Class", canonicalRef: "3" }),
			c({ id: "b2", displayName: "b", folder: "class", baseName: "b", kind: "Class", canonicalRef: "4" }),
			c({ id: "a1", displayName: "A", folder: "type", baseName: "a", kind: "TypeAlias", canonicalRef: "1" }),
			c({ id: "a2", displayName: "a", folder: "type", baseName: "a", kind: "TypeAlias", canonicalRef: "2" }),
		]);
		expect(collisions.map((x) => x.route)).toEqual(["class/b", "type/a"]);
	});
});

describe("formatRouteCollisionError", () => {
	it("includes each item's name, kind, canonicalRef, the shared route, and guidance", () => {
		const collisions: RouteCollision[] = [
			{
				route: "variable/foo",
				items: [
					c({
						id: "Foo::Variable",
						displayName: "Foo",
						folder: "variable",
						baseName: "foo",
						kind: "Variable",
						canonicalRef: "pkg!Foo:var",
					}),
					c({
						id: "foo::Variable",
						displayName: "foo",
						folder: "variable",
						baseName: "foo",
						kind: "Variable",
						canonicalRef: "pkg!foo:var",
					}),
				],
			},
		];
		const msg = formatRouteCollisionError(collisions, "/api");
		expect(msg).toContain("/api/variable/foo");
		expect(msg).toContain("Foo (Variable)");
		expect(msg).toContain("foo (Variable)");
		expect(msg).toContain("pkg!Foo:var");
		expect(msg).toMatch(/unique per category folder/i);
	});
});

describe("assertNoRouteCollisions", () => {
	it("does not throw when routes are unique", () => {
		expect(() =>
			assertNoRouteCollisions(
				[
					c({ id: "A", displayName: "A", folder: "class", baseName: "a", kind: "Class" }),
					c({ id: "Foo::Variable", displayName: "Foo", folder: "variable", baseName: "foo", kind: "Variable" }),
					c({ id: "Foo::TypeAlias", displayName: "Foo", folder: "type", baseName: "foo", kind: "TypeAlias" }),
				],
				"/api",
			),
		).not.toThrow();
	});

	it("throws a Route collision error when distinct items share a route", () => {
		expect(() =>
			assertNoRouteCollisions(
				[
					c({
						id: "Foo::Variable",
						displayName: "Foo",
						folder: "variable",
						baseName: "foo",
						kind: "Variable",
						canonicalRef: "pkg!Foo:var",
					}),
					c({
						id: "foo::Variable",
						displayName: "foo",
						folder: "variable",
						baseName: "foo",
						kind: "Variable",
						canonicalRef: "pkg!foo:var",
					}),
				],
				"/api",
			),
		).toThrow(/Route collision/);
	});
});
