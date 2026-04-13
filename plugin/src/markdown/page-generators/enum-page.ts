import type { ApiDeclaredItem, ApiEnum, ApiEnumMember } from "@microsoft/api-extractor-model";
import { ApiParser } from "../../loader.js";
import type { LlmsPlugin, SourceConfig } from "../../schemas/index.js";
import { markdownCrossLinker } from "../cross-linker.js";
import {
	escapeMdxGenerics,
	formatExampleCode,
	generateAvailableFrom,
	generateFrontmatter,
	prepareExampleCode,
	stripTwoslashDirectives,
} from "../helpers.js";

/**
 * Generates MDX documentation pages for TypeScript enums.
 *
 * This class transforms API Extractor enum models into rich MDX documentation
 * pages with syntax-highlighted signatures, member tables, and cross-linked
 * type references.
 *
 * **Page Structure:**
 * 1. Frontmatter with title, description, and Open Graph metadata
 * 2. Component imports
 * 3. Page title (H1) and summary
 * 4. Optional deprecation warning and release tag badge
 * 5. Source code link toolbar
 * 6. Enum signature block
 * 7. Members table (Name, Value, Description)
 * 8. Examples section with Twoslash-enabled code blocks
 * 9. See Also references
 *
 * **Relationships:**
 * - Created and invoked by {@link ApiExtractorPlugin} during page generation
 * - Uses {@link TypeSignatureFormatter} for formatting type signatures
 * - Uses {@link ApiParser} for extracting documentation from API models
 * - Uses {@link MarkdownCrossLinker} for adding type reference links
 *
 * @see {@link TypeAliasPageGenerator} for type alias documentation
 * @see {@link VariablePageGenerator} for variable/constant documentation
 */
export class EnumPageGenerator {
	/**
	 * Generate a markdown page for an enum
	 *
	 * @param apiScope - API scope identifier for VFS lookup
	 */
	public async generate(
		apiEnum: ApiEnum,
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
		const name = apiEnum.displayName;
		const summary = ApiParser.getSummary(apiEnum) || "No description available.";
		const releaseTag = ApiParser.getReleaseTag(apiEnum);

		let content = generateFrontmatter(name, summary, singularName, apiName);
		content += `import { SourceCode } from "@rspress/core/theme";\n`;
		content += `import { EnumMembersTable } from "rspress-plugin-api-extractor/runtime";\n`;
		content += `import { ApiSignature, ApiExample } from "rspress-plugin-api-extractor/runtime";\n\n`;

		content += `# ${name}\n\n`;

		// Add deprecation warning if present
		const deprecation = ApiParser.getDeprecation(apiEnum);
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
		const sourceLink = ApiParser.getSourceLink(apiEnum, sourceConfig);
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

		// Add full enum skeleton as signature using wrapper component
		const skeleton = this.generateEnumSkeleton(apiEnum);
		const hasMembers = apiEnum.members.length > 0;

		if (skeleton) {
			const displayCode = stripTwoslashDirectives(skeleton);
			// Use single newline when hasMembers to keep table adjacent (no paragraph break)
			const signatureNewlines = hasMembers ? "\n" : "\n\n";
			content += `<ApiSignature code={${JSON.stringify(displayCode)}} source={${JSON.stringify(skeleton)}} apiScope={${JSON.stringify(apiScope)}} hasMembers={${hasMembers}} />${signatureNewlines}`;
		}

		// List enum members using EnumMembersTable component (adjacent to signature, no heading)
		if (hasMembers) {
			const membersData = apiEnum.members.map((member) => {
				const memberItem = member as ApiDeclaredItem;
				const memberSummary = ApiParser.getSummary(member) || "";

				// Extract value from excerpt text
				let value: string | undefined;
				if (memberItem.excerpt?.text) {
					const excerptText = memberItem.excerpt.text.trim();
					const equalsIndex = excerptText.indexOf("=");
					if (equalsIndex !== -1) {
						value = excerptText
							.substring(equalsIndex + 1)
							.trim()
							.replace(/,\s*$/, "");
					}
				}

				return {
					name: member.displayName,
					value,
					description: markdownCrossLinker.addCrossLinks(memberSummary),
				};
			});

			content += `<EnumMembersTable members={${JSON.stringify(membersData)}} />\n\n`;
		}

		// Add examples using ApiExample component
		const examples = ApiParser.getExamples(apiEnum);
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
		const seeReferences = ApiParser.getSeeReferences(apiEnum);
		if (seeReferences.length > 0) {
			content += `## See Also\n\n`;
			for (const reference of seeReferences) {
				const refText = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(reference.text));
				content += `- ${refText}\n`;
			}
			content += `\n`;
		}

		return {
			routePath: `${baseRoute}/enum/${name.toLowerCase()}`,
			content,
		};
	}

	/**
	 * Generate a complete enum skeleton showing all members
	 */
	private generateEnumSkeleton(apiEnum: ApiEnum): string {
		const lines: string[] = [];
		const enumName = apiEnum.displayName;

		// Enum declaration opening
		lines.push(`enum ${enumName} {`);

		// Add each member
		const members = apiEnum.members as readonly ApiEnumMember[];
		for (let i = 0; i < members.length; i++) {
			const member = members[i];
			const memberItem = member as ApiDeclaredItem;

			// Get the member's initializer value if available
			let memberLine = `    ${member.displayName}`;

			// Check if the member has an explicit initializer value
			if (memberItem.excerpt?.text) {
				const excerptText = memberItem.excerpt.text.trim();
				// The excerpt text is like "MemberName = value" or just "MemberName"
				// Extract just the value part if present
				const equalsIndex = excerptText.indexOf("=");
				if (equalsIndex !== -1) {
					const value = excerptText
						.substring(equalsIndex + 1)
						.trim()
						.replace(/,\s*$/, "");
					memberLine += ` = ${value}`;
				}
			}

			// Add comma for all but the last member
			if (i < members.length - 1) {
				memberLine += ",";
			}

			lines.push(memberLine);
		}

		lines.push("}");

		return lines.join("\n");
	}
}
