import path from "node:path";

/** Extract unscoped name from a potentially scoped package name */
export function unscopedName(packageName: string): string {
	return packageName.startsWith("@") ? (packageName.split("/")[1] ?? packageName) : packageName;
}

/** Normalize baseRoute: ensure leading slash, strip trailing slash, preserve root "/" */
export function normalizeBaseRoute(route: string): string {
	const withSlash = route.startsWith("/") ? route : `/${route}`;
	const stripped = withSlash.endsWith("/") ? withSlash.slice(0, -1) : withSlash;
	return stripped === "" ? "/" : stripped;
}

export interface PathDerivationInput {
	mode: "single" | "multi";
	docsRoot: string;
	baseRoute: string;
	apiFolder: string | null;
	locales: string[];
	defaultLang: string | undefined;
	versions: string[];
	defaultVersion: string | undefined;
}

export interface DerivedPath {
	outputDir: string;
	routeBase: string;
	version: string | undefined;
	locale: string | undefined;
}

export function deriveOutputPaths(input: PathDerivationInput): DerivedPath[] {
	const { docsRoot, baseRoute, apiFolder, locales, defaultLang, versions, defaultVersion } = input;
	const results: DerivedPath[] = [];

	const folder = apiFolder ?? undefined;
	const baseSegment = baseRoute === "/" ? undefined : baseRoute.replace(/^\//, "");

	const versionList = versions.length > 0 ? versions : [undefined];
	const localeList = locales.length > 0 ? locales : [undefined];

	for (const version of versionList) {
		for (const locale of localeList) {
			const dirParts = [docsRoot, version, locale, baseSegment, folder].filter((p): p is string => p !== undefined);
			const outputDir = dirParts.length > 0 ? path.join(...dirParts) : docsRoot;

			const isDefaultVersion = version === defaultVersion;
			const isDefaultLocale = locale === defaultLang;

			const routeParts = [
				!isDefaultVersion ? version : undefined,
				!isDefaultLocale ? locale : undefined,
				baseSegment,
				folder,
			].filter((p): p is string => p !== undefined);

			const routeBase = routeParts.length > 0 ? `/${routeParts.join("/")}` : "/";

			results.push({ outputDir, routeBase, version, locale });
		}
	}

	return results;
}
