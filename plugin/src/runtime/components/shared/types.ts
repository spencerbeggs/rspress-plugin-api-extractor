/**
 * Shape of scope metadata injected into themeConfig.apiExtractorScopes
 * by the plugin's config() hook. Used by both ApiLlmsPackageActions
 * (outline mode portals) and ApiLlmsViewOptions (title mode alias).
 */
export interface ApiScope {
	name: string;
	packageName: string;
	/** Broader package route for scope matching (e.g., "/kitchensink") */
	packageRoute: string;
	/** API-specific route (e.g., "/kitchensink/api") */
	baseRoute: string;
	version: string | null;
	locale: string | null;
	llmsTxt: string;
	llmsFullTxt: string;
	llmsDocsTxt: string;
	llmsApiTxt: string | null;
}
