/** A candidate output route for collision detection. */
export interface RouteCandidate {
	/** Stable identity (e.g. "displayName::kind" or a namespace qualified name). */
	id: string;
	/** Human-readable name for error messages (original, non-lowercased). */
	displayName: string;
	/** Category folder name, e.g. "variable". */
	folder: string;
	/** Lowercased sanitized last path segment, e.g. "foo" — the value used in the route. */
	baseName: string;
	/** API item kind string, e.g. "Variable". */
	kind: string;
	/** canonicalReference string, used for deterministic ordering. */
	canonicalRef: string;
}

/** A set of distinct items that resolve to the same output route. */
export interface RouteCollision {
	/** The shared route key: `${folder}/${baseName}`. */
	readonly route: string;
	/** The distinct candidates that resolve to it (two or more). */
	readonly items: ReadonlyArray<RouteCandidate>;
}

/**
 * Group candidates by their final route (`${folder}/${baseName}`) and return the
 * groups with more than one distinct item. The route key is the lowercased path
 * the file is written to, so detection matches generation (and what a
 * case-insensitive filesystem would merge). Companion pairs (same name, different
 * folders) land under different keys and are never collisions.
 *
 * Output is deterministic: collisions ordered by route, items within a collision
 * ordered by canonicalReference.
 */
export function detectRouteCollisions(candidates: ReadonlyArray<RouteCandidate>): RouteCollision[] {
	const byKey = new Map<string, RouteCandidate[]>();
	for (const candidate of candidates) {
		const key = `${candidate.folder}/${candidate.baseName}`;
		const group = byKey.get(key) ?? [];
		group.push(candidate);
		byKey.set(key, group);
	}

	const collisions: RouteCollision[] = [];
	for (const [route, group] of byKey) {
		if (group.length > 1) {
			const items = [...group].sort((a, b) =>
				a.canonicalRef < b.canonicalRef ? -1 : a.canonicalRef > b.canonicalRef ? 1 : 0,
			);
			collisions.push({ route, items });
		}
	}
	collisions.sort((a, b) => (a.route < b.route ? -1 : a.route > b.route ? 1 : 0));
	return collisions;
}

/** Build an actionable build-time error message for one or more route collisions. */
export function formatRouteCollisionError(collisions: ReadonlyArray<RouteCollision>, baseRoute: string): string {
	const lines: string[] = [];
	for (const collision of collisions) {
		lines.push(
			`Route collision: ${collision.items.length} API items resolve to the same documentation path "${baseRoute}/${collision.route}":`,
		);
		for (const item of collision.items) {
			lines.push(`  - ${item.displayName} (${item.kind})  [${item.canonicalRef}]`);
		}
	}
	lines.push("");
	lines.push(
		"Item names must be unique per category folder. Paths are lowercased, so names differing only in case collide. Rename one of the items, or configure categories so they map to different folders.",
	);
	return `[rspress-plugin-api-extractor] ${lines.join("\n")}`;
}

/**
 * Throw a descriptive error if any distinct items resolve to the same route.
 * Called at build time before pages are generated, so collisions fail fast.
 */
export function assertNoRouteCollisions(candidates: ReadonlyArray<RouteCandidate>, baseRoute: string): void {
	const collisions = detectRouteCollisions(candidates);
	if (collisions.length > 0) {
		throw new Error(formatRouteCollisionError(collisions, baseRoute));
	}
}
