/* v8 ignore start -- page generator, tested via build-stages integration tests */
import type { ApiDeclaredItem, ApiInterface, ApiItem } from "@microsoft/api-extractor-model";
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
	sanitizeId,
	stripTwoslashDirectives,
} from "../helpers.js";

/**
 * Generates MDX documentation pages for TypeScript interfaces.
 *
 * This class transforms API Extractor interface models into rich MDX documentation
 * pages with syntax-highlighted signatures, cross-linked type references, and
 * interactive features.
 *
 * **Page Structure:**
 * 1. Frontmatter with title, description, and Open Graph metadata
 * 2. Component imports (SourceCode, ParametersTable, ApiSignature, etc.)
 * 3. Page title (H1) and summary
 * 4. Optional deprecation warning and release tag badge
 * 5. Source code link toolbar
 * 6. Full interface signature block showing all members
 * 7. Member sections: Call Signatures, Construct Signatures, Index Signatures, Properties, Methods
 * 8. Examples section with Twoslash-enabled code blocks
 * 9. See Also references
 *
 * **Interface-Specific Features:**
 * - Handles type parameters (generics) in interface declarations
 * - Supports call signatures for callable interfaces
 * - Supports construct signatures for constructable interfaces
 * - Supports index signatures for dictionary-like interfaces
 * - Handles extends clauses for interface inheritance
 *
 * **Relationships:**
 * - Created and invoked by {@link ApiExtractorPlugin} during page generation
 * - Uses {@link TypeSignatureFormatter} for formatting type signatures
 * - Uses {@link ApiParser} for extracting documentation from API models
 * - Uses {@link MarkdownCrossLinker} for adding type reference links
 *
 * @example
 * ```ts
 * const generator = new InterfacePageGenerator();
 * const { routePath, content } = await generator.generate(
 *   apiInterface,
 *   "/api/my-package",
 *   "my-package",
 *   "Interface",
 *   "My Package",
 *   sourceConfig,
 *   true, // suppressExampleErrors
 *   undefined, // llmsPlugin
 *   "claude-binary-plugin", // apiScope
 * );
 * ```
 *
 * @see {@link ClassPageGenerator} for class documentation
 * @see {@link TypeAliasPageGenerator} for type alias documentation
 */
export class InterfacePageGenerator {
	private readonly typeFormatter: TypeSignatureFormatter = new TypeSignatureFormatter();

	/**
	 * Generate a markdown page for an interface
	 *
	 * @param apiScope - API scope identifier for VFS lookup
	 */
	public async generate(
		apiInterface: ApiInterface,
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
		const name = apiInterface.displayName;
		const summary = ApiParser.getSummary(apiInterface) || "No description available.";
		const releaseTag = ApiParser.getReleaseTag(apiInterface);

		let content = generateFrontmatter(name, summary, singularName, apiName);
		content += `import { SourceCode } from "@rspress/core/theme";\n`;
		content += `import { ParametersTable } from "rspress-plugin-api-extractor/runtime";\n`;
		content += `import { ApiSignature, ApiMember, ApiExample } from "rspress-plugin-api-extractor/runtime";\n\n`;

		content += `# ${name}\n\n`;

		// Add deprecation warning if present
		const deprecation = ApiParser.getDeprecation(apiInterface);
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

		// Add toolbar with source code badge
		const sourceLink = ApiParser.getSourceLink(apiInterface, sourceConfig);
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

		// Add full interface skeleton as signature with Shiki HAST
		const skeleton = this.generateInterfaceSkeletonWithTwoslash(apiInterface, packageName);

		const displayCode = stripTwoslashDirectives(skeleton);
		content += `<ApiSignature code={${JSON.stringify(displayCode)}} source={${JSON.stringify(skeleton)}} apiScope={${JSON.stringify(apiScope)}} />\n\n`;

		// Inheritance is now shown in the signature, no need for separate section

		// List call signatures
		const callSignatures = apiInterface.members.filter((m) => m.kind === "CallSignature");
		if (callSignatures.length > 0) {
			content += `## Call Signatures\n\n`;
			for (const callSig of callSignatures) {
				const callSigSummary = ApiParser.getSummary(callSig);
				const callSigId = sanitizeId("call-signature");
				// Add call signature if available
				const callSigItem = callSig as ApiDeclaredItem;
				if (callSigItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(callSigItem.excerpt).trim();
					const skeletonWithContext = this.generateInterfaceMemberWithContext(apiInterface, callSig, packageName);
					const summaryMd = callSigSummary
						? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(callSigSummary))
						: undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName="Call Signature"${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(callSigId)}} />\n\n`;
				}
			}
		}

		// List construct signatures
		const constructSignatures = apiInterface.members.filter((m) => m.kind === "ConstructSignature");
		if (constructSignatures.length > 0) {
			content += `## Construct Signatures\n\n`;
			for (const constructSig of constructSignatures) {
				const constructSigSummary = ApiParser.getSummary(constructSig);
				const constructSigId = sanitizeId("construct-signature");
				// Add construct signature if available
				const constructSigItem = constructSig as ApiDeclaredItem;
				if (constructSigItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(constructSigItem.excerpt).trim();
					const skeletonWithContext = this.generateInterfaceMemberWithContext(apiInterface, constructSig, packageName);
					const summaryMd = constructSigSummary
						? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(constructSigSummary))
						: undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName="Construct Signature"${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(constructSigId)}} />\n\n`;
				}
			}
		}

		// List index signatures
		const indexSignatures = apiInterface.members.filter((m) => m.kind === "IndexSignature");
		if (indexSignatures.length > 0) {
			content += `## Index Signature\n\n`;
			for (const indexSig of indexSignatures) {
				const indexSigSummary = ApiParser.getSummary(indexSig);
				const indexSigId = sanitizeId("index-signature");
				// Add index signature if available
				const indexSigItem = indexSig as ApiDeclaredItem;
				if (indexSigItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(indexSigItem.excerpt).trim();
					const skeletonWithContext = this.generateInterfaceMemberWithContext(apiInterface, indexSig, packageName);
					const summaryMd = indexSigSummary
						? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(indexSigSummary))
						: undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName="Index Signature"${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(indexSigId)}} />\n\n`;
				}
			}
		}

		// List properties
		const properties = apiInterface.members.filter((m) => m.kind === "PropertySignature");
		if (properties.length > 0) {
			content += `## Properties\n\n`;
			for (const prop of properties) {
				const propSummary = ApiParser.getSummary(prop);
				const propId = sanitizeId(prop.displayName);
				// Add property signature if available
				const propItem = prop as ApiDeclaredItem;
				if (propItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(propItem.excerpt).trim();
					const skeletonWithContext = this.generateInterfaceMemberWithContext(apiInterface, prop, packageName);
					const summaryMd = propSummary ? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(propSummary)) : undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName={${JSON.stringify(prop.displayName)}}${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(propId)}} />\n\n`;
				}
			}
		}

		// List methods
		const methods = apiInterface.members.filter((m) => m.kind === "MethodSignature");
		if (methods.length > 0) {
			content += `## Methods\n\n`;
			for (const method of methods) {
				const methodSummary = ApiParser.getSummary(method);
				const methodId = sanitizeId(method.displayName);
				// Add method signature if available
				const methodItem = method as ApiDeclaredItem;
				if (methodItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(methodItem.excerpt).trim();
					const skeletonWithContext = this.generateInterfaceMemberWithContext(apiInterface, method, packageName);
					const params = ApiParser.getParams(method);
					const hasParameters = params.length > 0;
					const summaryMd = methodSummary
						? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(methodSummary))
						: undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName={${JSON.stringify(method.displayName)}}${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(methodId)}} hasParameters={${hasParameters}} />\n\n`;
				}
				// Add parameters documentation
				const params = ApiParser.getParams(method);
				if (params.length > 0) {
					content += `<ParametersTable parameters={${JSON.stringify(
						params.map((p) => ({
							name: p.name,
							type: p.type,
							description: markdownCrossLinker.addCrossLinks(p.description),
						})),
					)}} />\n\n`;
				}
				// Add returns documentation
				const returns = ApiParser.getReturns(method);
				if (returns) {
					const description = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(returns.description));
					content += `**Returns:** ${description}\n\n`;
				}
			}
		}

		// Add examples - pre-render with Shiki and Twoslash for better build performance
		const examples = ApiParser.getExamples(apiInterface);
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
		const seeReferences = ApiParser.getSeeReferences(apiInterface);
		if (seeReferences.length > 0) {
			content += `## See Also\n\n`;
			for (const reference of seeReferences) {
				const refText = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(reference.text));
				content += `- ${refText}\n`;
			}
			content += `\n`;
		}

		return {
			routePath: `${baseRoute}/interface/${name.toLowerCase()}`,
			content,
		};
	}

	/**
	 * Generate an interface member signature with full interface context
	 * Includes hidden imports with cut directive for external type resolution
	 * Uses the simplified approach: 3 lines (interface opening, member, closing)
	 */
	private generateInterfaceMemberWithContext(
		apiInterface: ApiInterface,
		targetMember: ApiItem,
		packageName: string,
	): string {
		const interfaceName = apiInterface.displayName;

		// Build interface declaration with type parameters
		const inheritance = ApiParser.getInheritance(apiInterface);
		let declaration = `interface ${interfaceName}`;

		// Add type parameters if present
		if (apiInterface.typeParameters && apiInterface.typeParameters.length > 0) {
			const typeParams = apiInterface.typeParameters.map((tp) => tp.name).join(", ");
			declaration += `<${typeParams}>`;
		}

		if (inheritance.extends && inheritance.extends.length > 0) {
			declaration += ` extends ${inheritance.extends.join(", ")}`;
		}
		declaration += " {";

		// Get the target member signature
		const memberItem = targetMember as ApiDeclaredItem;
		const memberSignature = memberItem.excerpt?.text ? this.typeFormatter.format(memberItem.excerpt).trim() : "";

		// Build the simplified structure: interface opening, target member, closing
		// The hide-cut transformer will hide the first and third lines
		const skeleton = `${declaration}\n${memberSignature}\n}`;

		// Extract imports for external type references in this member
		const apiPackage = apiInterface.getAssociatedPackage?.();
		if (apiPackage) {
			const extractor = new TypeReferenceExtractor(apiPackage, packageName);
			const imports = extractor.extractImportsForApiItem(targetMember);
			return prependHiddenImports(skeleton, imports);
		}

		return skeleton;
	}

	/**
	 * Generate an interface skeleton for signature blocks
	 * Includes hidden imports with cut directive for external type resolution
	 */
	private generateInterfaceSkeletonWithTwoslash(apiInterface: ApiInterface, packageName: string): string {
		const skeleton = this.generateInterfaceSkeleton(apiInterface);

		// Extract imports for external type references in the entire interface
		const apiPackage = apiInterface.getAssociatedPackage?.();
		if (apiPackage) {
			const extractor = new TypeReferenceExtractor(apiPackage, packageName);
			const imports = extractor.extractImportsForApiItem(apiInterface);
			return prependHiddenImports(skeleton, imports);
		}

		return skeleton;
	}

	/**
	 * Generate a complete interface skeleton showing all members
	 */
	private generateInterfaceSkeleton(apiInterface: ApiInterface): string {
		const lines: string[] = [];
		const interfaceName = apiInterface.displayName;

		// Interface declaration with type parameters and extends clause
		const inheritance = ApiParser.getInheritance(apiInterface);
		let declaration = `interface ${interfaceName}`;

		// Add type parameters if present
		if (apiInterface.typeParameters && apiInterface.typeParameters.length > 0) {
			const typeParams = apiInterface.typeParameters.map((tp) => tp.name).join(", ");
			declaration += `<${typeParams}>`;
		}

		if (inheritance.extends && inheritance.extends.length > 0) {
			declaration += ` extends ${inheritance.extends.join(", ")}`;
		}
		declaration += " {";
		lines.push(declaration);

		// Call signatures (callable interfaces)
		const callSignatures = apiInterface.members.filter((m) => m.kind === "CallSignature");
		if (callSignatures.length > 0) {
			for (const callSig of callSignatures) {
				const callSigItem = callSig as ApiDeclaredItem;
				if (callSigItem.excerpt?.text) {
					const signature = this.typeFormatter.format(callSigItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// Construct signatures (constructable interfaces)
		const constructSignatures = apiInterface.members.filter((m) => m.kind === "ConstructSignature");
		if (constructSignatures.length > 0) {
			for (const constructSig of constructSignatures) {
				const constructSigItem = constructSig as ApiDeclaredItem;
				if (constructSigItem.excerpt?.text) {
					const signature = this.typeFormatter.format(constructSigItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// Index signatures
		const indexSignatures = apiInterface.members.filter((m) => m.kind === "IndexSignature");
		if (indexSignatures.length > 0) {
			for (const indexSig of indexSignatures) {
				const indexSigItem = indexSig as ApiDeclaredItem;
				if (indexSigItem.excerpt?.text) {
					const signature = this.typeFormatter.format(indexSigItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// Properties
		const properties = apiInterface.members.filter((m) => m.kind === "PropertySignature");
		if (properties.length > 0) {
			for (const prop of properties) {
				const propItem = prop as ApiDeclaredItem;
				if (propItem.excerpt?.text) {
					const signature = this.typeFormatter.format(propItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// Methods
		const methods = apiInterface.members.filter((m) => m.kind === "MethodSignature");
		if (methods.length > 0) {
			for (const method of methods) {
				const methodItem = method as ApiDeclaredItem;
				if (methodItem.excerpt?.text) {
					const signature = this.typeFormatter.format(methodItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		lines.push("}");

		return lines.join("\n");
	}
}
