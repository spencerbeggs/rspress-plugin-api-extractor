/* v8 ignore start -- page generator, tested via build-stages integration tests */
import type { ApiDeclaredItem, ApiItem, ApiNamespace } from "@microsoft/api-extractor-model";
import { ApiItemKind } from "@microsoft/api-extractor-model";
import { TypeSignatureFormatter } from "../../formatter.js";
import { ApiParser } from "../../loader.js";
import type { LlmsPlugin, SourceConfig } from "../../schemas/index.js";
import { TypeReferenceExtractor } from "../../type-reference-extractor.js";
import { markdownCrossLinker } from "../cross-linker.js";
import {
	escapeMdxGenerics,
	formatExampleCode,
	generateFrontmatter,
	prepareExampleCode,
	prependHiddenImports,
	stripTwoslashDirectives,
} from "../helpers.js";

/**
 * Grouped namespace members by type for organized documentation rendering.
 */
interface GroupedMembers {
	classes: ApiItem[];
	interfaces: ApiItem[];
	functions: ApiItem[];
	variables: ApiItem[];
	typeAliases: ApiItem[];
	enums: ApiItem[];
	namespaces: ApiItem[];
}

/**
 * Generates MDX documentation pages for TypeScript namespaces.
 *
 * This class transforms API Extractor namespace models into rich MDX documentation pages
 * with syntax-highlighted signatures, cross-linked type references, and member listings.
 *
 * **Page Structure:**
 * 1. Frontmatter with title, description, and Open Graph metadata
 * 2. Component imports (SourceCode, ApiSignature, etc.)
 * 3. Page title (H1) and summary
 * 4. Optional deprecation warning and release tag badge
 * 5. Source code link toolbar
 * 6. Full namespace signature block showing all members
 * 7. Member sections: Classes, Interfaces, Functions, Variables, Types, Enums, Namespaces
 * 8. Examples section with Twoslash-enabled code blocks
 * 9. See Also references
 *
 * **Member Rendering:**
 * Each member section lists members with links to their individual documentation pages.
 *
 * **Relationships:**
 * - Created and invoked by {@link ApiExtractorPlugin} during page generation
 * - Uses {@link TypeSignatureFormatter} for formatting type signatures
 * - Uses {@link ApiParser} for extracting documentation from API models
 * - Uses {@link MarkdownCrossLinker} for adding type reference links
 *
 * @example
 * ```ts
 * const generator = new NamespacePageGenerator();
 * const { routePath, content } = await generator.generate(
 *   apiNamespace,
 *   "/api/my-package",
 *   "my-package",
 *   "Namespace",
 *   "My Package",
 *   sourceConfig,
 *   true, // suppressExampleErrors
 *   undefined, // llmsPlugin
 *   "my-scope"
 * );
 * ```
 *
 * @see {@link ClassPageGenerator} for class documentation
 * @see {@link InterfacePageGenerator} for interface documentation
 */
export class NamespacePageGenerator {
	private readonly typeFormatter: TypeSignatureFormatter = new TypeSignatureFormatter();

	/**
	 * Generate a markdown page for a namespace
	 *
	 * @param apiScope - API scope identifier for VFS lookup
	 */
	public async generate(
		apiNamespace: ApiNamespace,
		baseRoute: string,
		packageName: string,
		singularName: string,
		apiScope: string,
		apiName?: string,
		sourceConfig?: SourceConfig,
		suppressExampleErrors?: boolean,
		llmsPlugin?: LlmsPlugin,
	): Promise<{ routePath: string; content: string }> {
		const shouldSuppressErrors = suppressExampleErrors ?? true;
		const name = apiNamespace.displayName;
		const summary = ApiParser.getSummary(apiNamespace) || "No description available.";
		const releaseTag = ApiParser.getReleaseTag(apiNamespace);

		let content = generateFrontmatter(name, summary, singularName, apiName);
		content += `import { SourceCode } from "@rspress/core/theme";\n`;
		content += `import { ApiSignature, ApiExample } from "rspress-plugin-api-extractor/runtime";\n\n`;

		content += `# ${name}\n\n`;

		// Add deprecation warning if present
		const deprecation = ApiParser.getDeprecation(apiNamespace);
		if (deprecation) {
			const message = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(deprecation.message));
			content += `> **Deprecated:** ${message}\n\n`;
		}

		// Add release tag badge
		if (releaseTag !== "Public") {
			content += `\`${releaseTag}\`\n\n`;
		}

		// Add summary
		content += `${summary}\n\n`;

		// Add toolbar with source code badge
		const sourceLink = ApiParser.getSourceLink(apiNamespace, sourceConfig);
		if (sourceLink) {
			content += `<div className="api-docs-toolbar">\n`;
			content += `  <div className="api-docs-toolbar-left">\n`;
			content += `    <SourceCode href="${sourceLink}" />\n`;
			content += `  </div>\n`;
			if (llmsPlugin?.enabled) {
				content += `  <div className="api-docs-toolbar-right">\n`;
				content += `  </div>\n`;
			}
			content += `</div>\n\n`;
		}

		// Add full namespace skeleton as signature using ApiSignature component
		const skeleton = this.generateNamespaceSkeletonWithTwoslash(apiNamespace, packageName);

		const displayCode = stripTwoslashDirectives(skeleton);
		content += `<ApiSignature code={${JSON.stringify(displayCode)}} source={${JSON.stringify(skeleton)}} apiScope={${JSON.stringify(apiScope)}} />\n\n`;

		// Group members by kind
		const grouped = this.groupNamespaceMembers(apiNamespace.members);

		// Generate member sections with links
		content += this.renderMemberSection("Classes", grouped.classes, baseRoute, "class", name);
		content += this.renderMemberSection("Interfaces", grouped.interfaces, baseRoute, "interface", name);
		content += this.renderMemberSection("Functions", grouped.functions, baseRoute, "function", name);
		content += this.renderMemberSection("Variables", grouped.variables, baseRoute, "variable", name);
		content += this.renderMemberSection("Types", grouped.typeAliases, baseRoute, "type", name);
		content += this.renderMemberSection("Enums", grouped.enums, baseRoute, "enum", name);
		content += this.renderMemberSection("Namespaces", grouped.namespaces, baseRoute, "namespace", name);

		// Add examples using ApiExample component
		const examples = ApiParser.getExamples(apiNamespace);
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
		const seeReferences = ApiParser.getSeeReferences(apiNamespace);
		if (seeReferences.length > 0) {
			content += `## See Also\n\n`;
			for (const reference of seeReferences) {
				const refText = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(reference.text));
				content += `- ${refText}\n`;
			}
			content += `\n`;
		}

		return {
			routePath: `${baseRoute}/namespace/${name.toLowerCase()}`,
			content,
		};
	}

	/**
	 * Group namespace members by their type
	 */
	private groupNamespaceMembers(members: readonly ApiItem[]): GroupedMembers {
		const classes: ApiItem[] = [];
		const interfaces: ApiItem[] = [];
		const functions: ApiItem[] = [];
		const variables: ApiItem[] = [];
		const typeAliases: ApiItem[] = [];
		const enums: ApiItem[] = [];
		const namespaces: ApiItem[] = [];

		for (const member of members) {
			switch (member.kind) {
				case ApiItemKind.Class:
					classes.push(member);
					break;
				case ApiItemKind.Interface:
					interfaces.push(member);
					break;
				case ApiItemKind.Function:
					functions.push(member);
					break;
				case ApiItemKind.Variable:
					variables.push(member);
					break;
				case ApiItemKind.TypeAlias:
					typeAliases.push(member);
					break;
				case ApiItemKind.Enum:
					enums.push(member);
					break;
				case ApiItemKind.Namespace:
					namespaces.push(member);
					break;
				default:
					// Skip other kinds
					break;
			}
		}

		return { classes, interfaces, functions, variables, typeAliases, enums, namespaces };
	}

	/**
	 * Render a section of members with links to their pages
	 * @param title - Section heading
	 * @param members - Array of API items to list
	 * @param baseRoute - Base API route (e.g., /api/package)
	 * @param categoryFolder - Category folder name (e.g., "class", "function")
	 * @param namespaceName - Parent namespace name for qualified routes
	 */
	private renderMemberSection(
		title: string,
		members: ApiItem[],
		baseRoute: string,
		categoryFolder: string,
		namespaceName: string,
	): string {
		if (members.length === 0) {
			return "";
		}

		let section = `## ${title}\n\n`;
		for (const member of members) {
			const memberName = member.displayName;
			const memberSummary = ApiParser.getSummary(member);
			// Use qualified name (namespace.member) for the route
			const qualifiedName = `${namespaceName}.${memberName}`.toLowerCase();
			const memberRoute = `${baseRoute}/${categoryFolder}/${qualifiedName}`;

			if (memberSummary) {
				const escapedSummary = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(memberSummary));
				section += `- [${memberName}](${memberRoute}) - ${escapedSummary}\n`;
			} else {
				section += `- [${memberName}](${memberRoute})\n`;
			}
		}
		section += `\n`;

		return section;
	}

	/**
	 * Generate a namespace skeleton for signature blocks
	 * Includes hidden imports with cut directive for external type resolution
	 */
	private generateNamespaceSkeletonWithTwoslash(apiNamespace: ApiNamespace, packageName: string): string {
		const skeleton = this.generateNamespaceSkeleton(apiNamespace);

		// Extract imports for external type references in the entire namespace
		const apiPackage = apiNamespace.getAssociatedPackage?.();
		if (apiPackage) {
			const extractor = new TypeReferenceExtractor(apiPackage, packageName);
			const imports = extractor.extractImportsForApiItem(apiNamespace);
			return prependHiddenImports(skeleton, imports);
		}

		return skeleton;
	}

	/**
	 * Generate a complete namespace skeleton showing all members
	 */
	private generateNamespaceSkeleton(apiNamespace: ApiNamespace): string {
		const lines: string[] = [];
		const namespaceName = apiNamespace.displayName;

		// Namespace declaration
		lines.push(`namespace ${namespaceName} {`);

		// Group members for organized output
		const grouped = this.groupNamespaceMembers(apiNamespace.members);

		// 1. Classes
		for (const cls of grouped.classes) {
			const clsItem = cls as ApiDeclaredItem;
			if (clsItem.excerpt?.text) {
				const signature = this.typeFormatter.format(clsItem.excerpt).trim();
				// Show abbreviated class declaration
				lines.push(`    ${this.abbreviateDeclaration(signature, "class")} { }`);
			}
		}

		// 2. Interfaces
		for (const iface of grouped.interfaces) {
			const ifaceItem = iface as ApiDeclaredItem;
			if (ifaceItem.excerpt?.text) {
				const signature = this.typeFormatter.format(ifaceItem.excerpt).trim();
				// Show abbreviated interface declaration
				lines.push(`    ${this.abbreviateDeclaration(signature, "interface")} { }`);
			}
		}

		// 3. Functions
		for (const func of grouped.functions) {
			const funcItem = func as ApiDeclaredItem;
			if (funcItem.excerpt?.text) {
				const signature = this.typeFormatter.format(funcItem.excerpt).trim();
				lines.push(`    ${signature}`);
			}
		}

		// 4. Variables
		for (const variable of grouped.variables) {
			const varItem = variable as ApiDeclaredItem;
			if (varItem.excerpt?.text) {
				const signature = this.typeFormatter.format(varItem.excerpt).trim();
				lines.push(`    ${signature}`);
			}
		}

		// 5. Type aliases
		for (const typeAlias of grouped.typeAliases) {
			const typeItem = typeAlias as ApiDeclaredItem;
			if (typeItem.excerpt?.text) {
				const signature = this.typeFormatter.format(typeItem.excerpt).trim();
				lines.push(`    ${signature}`);
			}
		}

		// 6. Enums
		for (const enumItem of grouped.enums) {
			const enumDeclItem = enumItem as ApiDeclaredItem;
			if (enumDeclItem.excerpt?.text) {
				const signature = this.typeFormatter.format(enumDeclItem.excerpt).trim();
				// Show abbreviated enum declaration
				lines.push(`    ${this.abbreviateDeclaration(signature, "enum")} { }`);
			}
		}

		// 7. Nested namespaces
		for (const ns of grouped.namespaces) {
			const nsItem = ns as ApiDeclaredItem;
			if (nsItem.excerpt?.text) {
				const signature = this.typeFormatter.format(nsItem.excerpt).trim();
				// Show abbreviated namespace declaration
				lines.push(`    ${this.abbreviateDeclaration(signature, "namespace")} { }`);
			}
		}

		lines.push("}");

		return lines.join("\n");
	}

	/**
	 * Abbreviate a full declaration to just its header
	 * For example, "class Foo extends Bar implements Baz { ... }" -> "class Foo extends Bar implements Baz"
	 */
	private abbreviateDeclaration(signature: string, _keyword: string): string {
		// Find the position where the body starts (opening brace)
		const braceIndex = signature.indexOf("{");
		if (braceIndex === -1) {
			return signature;
		}

		// Get everything before the opening brace
		return signature.substring(0, braceIndex).trim();
	}
}
