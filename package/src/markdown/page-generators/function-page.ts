import type { ApiFunction } from "@microsoft/api-extractor-model";
import { TypeSignatureFormatter } from "../../formatter.js";
import { ApiParser } from "../../loader.js";
import type { LlmsPlugin, SourceConfig } from "../../schemas/index.js";
import { TypeReferenceExtractor } from "../../type-reference-extractor.js";
import { markdownCrossLinker } from "../cross-linker.js";
import {
	escapeMdxGenerics,
	formatExampleCode,
	generateAvailableFrom,
	generateFrontmatter,
	prepareExampleCode,
	prependHiddenImports,
	stripTwoslashDirectives,
} from "../helpers.js";

/**
 * Generates MDX documentation pages for TypeScript/JavaScript functions.
 *
 * This class transforms API Extractor function models into rich MDX documentation
 * pages with syntax-highlighted signatures and cross-linked type references.
 *
 * **Page Structure:**
 * 1. Frontmatter with title, description, and Open Graph metadata
 * 2. Component imports
 * 3. Page title (H1) and summary
 * 4. Optional deprecation warning and release tag badge
 * 5. Source code link toolbar
 * 6. Function signature block
 * 7. Parameters documentation
 * 8. Returns documentation
 * 9. Examples section with Twoslash-enabled code blocks
 * 10. See Also references
 *
 * **Relationships:**
 * - Created and invoked by {@link ApiExtractorPlugin} during page generation
 * - Uses {@link TypeSignatureFormatter} for formatting type signatures
 * - Uses {@link ApiParser} for extracting documentation from API models
 * - Uses {@link MarkdownCrossLinker} for adding type reference links
 *
 * @see {@link ClassPageGenerator} for class documentation
 * @see {@link TypeAliasPageGenerator} for type alias documentation
 */
export class FunctionPageGenerator {
	private readonly typeFormatter: TypeSignatureFormatter = new TypeSignatureFormatter();

	/**
	 * Generate a markdown page for a function
	 *
	 * @param apiScope - API scope identifier for VFS lookup
	 */
	public async generate(
		apiFunction: ApiFunction,
		baseRoute: string,
		packageName: string,
		singularName: string,
		apiScope: string,
		apiName?: string,
		sourceConfig?: SourceConfig,
		suppressExampleErrors?: boolean,
		llmsPlugin?: LlmsPlugin,
		availableFrom?: string[],
	): Promise<{ routePath: string; content: string }> {
		const shouldSuppressErrors = suppressExampleErrors ?? true;
		const name = apiFunction.displayName;
		const summary = ApiParser.getSummary(apiFunction) || "No description available.";
		const releaseTag = ApiParser.getReleaseTag(apiFunction);

		let content = generateFrontmatter(name, summary, singularName, apiName);
		content += `import { SourceCode } from "@rspress/core/theme";\n`;
		content += `import { ParametersTable } from "rspress-plugin-api-extractor/runtime";\n`;
		content += `import { ApiSignature, ApiExample } from "rspress-plugin-api-extractor/runtime";\n\n`;

		content += `# ${name}\n\n`;

		// Add deprecation warning if present
		const deprecation = ApiParser.getDeprecation(apiFunction);
		if (deprecation) {
			const message = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(deprecation.message));
			content += `> ⚠️ **Deprecated:** ${message}\n\n`;
		}

		// Add release tag badge
		if (releaseTag !== "Public") {
			content += `\`${releaseTag}\`\n\n`;
		}

		// Add summary
		content += `${summary}\n\n`;

		// Add "Available from" for multi-entry items
		content += generateAvailableFrom(packageName, availableFrom);

		// Add toolbar with source code badge
		const sourceLink = ApiParser.getSourceLink(apiFunction, sourceConfig);
		if (sourceLink) {
			content += `<div className="api-docs-toolbar">\n`;
			content += `  <div className="api-docs-toolbar-left">\n`;
			content += `    <SourceCode href="${sourceLink}" />\n`;
			content += `  </div>\n`;
			if (llmsPlugin?.enabled) {
				content += `  <div className="api-docs-toolbar-right">\n`;
				// TODO: Re-enable after fixing SSG rendering issues
				// content += `    <ApiDocsLlmsTools showCopyButton={${llmsPlugin.showCopyButton}} showViewOptions={${llmsPlugin.showViewOptions}} copyButtonText={${JSON.stringify(llmsPlugin.copyButtonText)}} viewOptions={${JSON.stringify(llmsPlugin.viewOptions)}} />\n`;
				content += `  </div>\n`;
			}
			content += `</div>\n\n`;
		}

		// Add signature using ApiSignature component
		const params = ApiParser.getParams(apiFunction);
		const hasParameters = params.length > 0;

		if (apiFunction.excerpt.text) {
			const signature = this.typeFormatter.format(apiFunction.excerpt).trim();

			// Extract imports for external type references in this function
			let signatureWithImports = signature;
			const apiPackage = apiFunction.getAssociatedPackage?.();
			if (apiPackage) {
				const extractor = new TypeReferenceExtractor(apiPackage, packageName);
				const imports = extractor.extractImportsForApiItem(apiFunction);
				signatureWithImports = prependHiddenImports(signature, imports);
			}

			const displayCode = stripTwoslashDirectives(signatureWithImports);
			content += `<ApiSignature code={${JSON.stringify(displayCode)}} source={${JSON.stringify(signatureWithImports)}} apiScope={${JSON.stringify(apiScope)}} hasParameters={${hasParameters}} />\n\n`;
		}

		// Add parameters table (connected to signature block, no heading)
		if (hasParameters) {
			const parametersData = params.map((param) => ({
				name: param.name,
				type: param.type,
				description: escapeMdxGenerics(markdownCrossLinker.addCrossLinks(param.description)),
			}));
			content += `<ParametersTable parameters={${JSON.stringify(parametersData)}} />\n\n`;
		}

		// Add returns documentation
		const returns = ApiParser.getReturns(apiFunction);
		if (returns) {
			const description = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(returns.description));
			content += `## Returns\n\n${description}\n\n`;
		}

		// Add examples using ApiExample component
		const examples = ApiParser.getExamples(apiFunction);
		if (examples.length > 0) {
			content += `## Examples\n\n`;
			for (const example of examples) {
				const prepared = prepareExampleCode(example, name, packageName, shouldSuppressErrors);

				// Format code with Prettier for consistent styling
				const formattedCode = await formatExampleCode(prepared.code, prepared.language, {
					api: packageName,
					blockType: "example",
				});

				if (prepared.isTypeScript) {
					const displayCode = stripTwoslashDirectives(formattedCode);
					content += `<ApiExample code={${JSON.stringify(displayCode)}} source={${JSON.stringify(formattedCode)}} apiScope={${JSON.stringify(apiScope)}} />\n\n`;
				} else {
					// Non-TypeScript examples: output plain code block
					content += `\`\`\`${prepared.language}\n${formattedCode}\n\`\`\`\n\n`;
				}
			}
		}

		// Add see also references
		const seeReferences = ApiParser.getSeeReferences(apiFunction);
		if (seeReferences.length > 0) {
			content += `## See Also\n\n`;
			for (const reference of seeReferences) {
				const refText = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(reference.text));
				content += `- ${refText}\n`;
			}
			content += `\n`;
		}

		return {
			routePath: `${baseRoute}/function/${name.toLowerCase()}`,
			content,
		};
	}
}
