import { escapeYamlString } from "../helpers.js";

/**
 * Generator for main API index page with only frontmatter (no content)
 */
export class MainIndexPageGenerator {
	/**
	 * Generate the main API index page
	 */
	public generate(
		packageName: string,
		baseRoute: string,
		_categoryCounts: Record<string, number>,
	): { routePath: string; content: string } {
		const content = `---
title: API Reference
description: Auto-generated API documentation for ${escapeYamlString(packageName)}
overview: true
---

`;

		return {
			routePath: `${baseRoute}/index`,
			content,
		};
	}
}
