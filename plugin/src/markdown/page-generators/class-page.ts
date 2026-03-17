import type { ApiClass, ApiDeclaredItem, ApiItem } from "@microsoft/api-extractor-model";
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
 * Grouped class members by type for organized documentation rendering.
 */
interface GroupedMembers {
	staticMethods: ApiItem[];
	instanceMethods: ApiItem[];
	getters: ApiItem[];
}

/**
 * Generates MDX documentation pages for TypeScript/JavaScript classes.
 *
 * This class transforms API Extractor class models into rich MDX documentation pages
 * with syntax-highlighted signatures, cross-linked type references, and interactive
 * features like copy-to-clipboard and line wrapping.
 *
 * **Page Structure:**
 * 1. Frontmatter with title, description, and Open Graph metadata
 * 2. Component imports (SourceCode, ParametersTable, ApiSignature, etc.)
 * 3. Page title (H1) and summary
 * 4. Optional deprecation warning and release tag badge
 * 5. Source code link toolbar
 * 6. Full class signature block showing all members
 * 7. Member sections: Constructors, Static Properties, Static Methods, Properties, Getters/Setters, Methods
 * 8. Examples section with Twoslash-enabled code blocks
 * 9. See Also references
 *
 * **Member Rendering:**
 * Each member is rendered with:
 * - An `ApiMember` component showing the signature in class context
 * - Optional `ParametersTable` for methods with parameters
 * - Return type documentation
 * - Cross-linked type references
 *
 * **Relationships:**
 * - Created and invoked by {@link ApiExtractorPlugin} during page generation
 * - Uses {@link TypeSignatureFormatter} for formatting type signatures
 * - Uses {@link ApiParser} for extracting documentation from API models
 * - Uses {@link MarkdownCrossLinker} for adding type reference links
 *
 * @example
 * ```ts
 * const generator = new ClassPageGenerator();
 * const { routePath, content } = await generator.generate(
 *   apiClass,
 *   "/api/my-package",
 *   "my-package",
 *   "Class",
 *   "My Package",
 *   sourceConfig,
 *   true, // suppressExampleErrors
 *   undefined, // llmsPlugin
 *   "claude-binary-plugin", // apiScope
 * );
 * ```
 *
 * @see {@link InterfacePageGenerator} for interface documentation
 * @see {@link FunctionPageGenerator} for function documentation
 */
export class ClassPageGenerator {
	private readonly typeFormatter: TypeSignatureFormatter = new TypeSignatureFormatter();

	/**
	 * Generate a markdown page for a class
	 *
	 * @param apiScope - API scope identifier for VFS lookup
	 */
	public async generate(
		apiClass: ApiClass,
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
		const name = apiClass.displayName;
		const summary = ApiParser.getSummary(apiClass) || "No description available.";
		const releaseTag = ApiParser.getReleaseTag(apiClass);

		let content = generateFrontmatter(name, summary, singularName, apiName);
		content += `import { SourceCode } from "@rspress/core/theme";\n`;
		content += `import { ParametersTable } from "rspress-plugin-api-extractor/runtime";\n`;
		content += `import { ApiSignature, ApiMember, ApiExample } from "rspress-plugin-api-extractor/runtime";\n\n`;

		content += `# ${name}\n\n`;

		// Add deprecation warning if present
		const deprecation = ApiParser.getDeprecation(apiClass);
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
		const sourceLink = ApiParser.getSourceLink(apiClass, sourceConfig);
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

		// Add full class skeleton as signature using wrapper component
		const skeleton = this.generateClassSkeletonWithTwoslash(apiClass, packageName);

		const displayCode = stripTwoslashDirectives(skeleton);
		// Output heading as markdown for proper spacing (JSX whitespace is ignored in SSG-MD)
		content += `<ApiSignature code={${JSON.stringify(displayCode)}} source={${JSON.stringify(skeleton)}} apiScope={${JSON.stringify(apiScope)}} />\n\n`;

		// Inheritance is now shown in the signature, no need for separate section

		// 1. Constructors
		const constructors = apiClass.members.filter((m) => m.kind === "Constructor");
		if (constructors.length > 0) {
			content += `## Constructors\n\n`;
			for (const ctor of constructors) {
				const ctorSummary = ApiParser.getSummary(ctor);
				const ctorId = sanitizeId("constructor");
				const ctorItem = ctor as ApiDeclaredItem;
				const params = ApiParser.getParams(ctor);
				const hasParameters = params.length > 0;

				if (ctorItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(ctorItem.excerpt).trim();
					const skeletonWithContext = this.generateClassMemberWithContext(apiClass, ctor, packageName);
					const summaryMd = ctorSummary ? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(ctorSummary)) : undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName="constructor"${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(ctorId)}} hasParameters={${hasParameters}} />\n\n`;
				}
				if (hasParameters) {
					content += `<ParametersTable parameters={${JSON.stringify(
						params.map((p) => ({
							name: p.name,
							type: p.type,
							description: markdownCrossLinker.addCrossLinks(p.description),
						})),
					)}} />\n\n`;
				}
			}
		}

		// Prepare properties and methods for grouped rendering
		const properties = apiClass.members.filter((m) => m.kind === "Property" || m.kind === "PropertySignature");
		const methods = apiClass.members.filter((m) => m.kind === "Method" || m.kind === "MethodSignature");
		const grouped =
			methods.length > 0 ? this.groupClassMembers(methods) : { staticMethods: [], instanceMethods: [], getters: [] };

		// Detect naming conflicts to determine ID prefixes
		const staticProperties = properties.filter((m) => {
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			return (m as any).isStatic === true;
		});
		const instanceProperties = properties.filter((m) => {
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			const isStatic = (m as any).isStatic === true;
			const isGetter = m.displayName.startsWith("get ") || m.displayName.startsWith("set ");
			return !isStatic && !isGetter;
		});

		const prefixMap = this.detectMemberConflicts(
			staticProperties,
			grouped.staticMethods,
			instanceProperties,
			grouped.instanceMethods,
			grouped.getters,
		);

		// Helper to render properties
		const renderProperties = async (title: string, propList: typeof properties): Promise<void> => {
			if (propList.length === 0) return;

			content += `## ${title}\n\n`;
			for (const prop of propList) {
				const propSummary = ApiParser.getSummary(prop);
				const baseName = sanitizeId(prop.displayName);
				const prefix = prefixMap.get(baseName) || "";
				const propId = sanitizeId(prop.displayName, prefix);
				const propItem = prop as ApiDeclaredItem;
				if (propItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(propItem.excerpt).trim();
					const skeletonWithContext = this.generateClassMemberWithContext(apiClass, prop, packageName);
					const summaryMd = propSummary ? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(propSummary)) : undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName={${JSON.stringify(prop.displayName)}}${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(propId)}} />\n\n`;
				}
			}
		};

		// Helper to render methods
		const renderMethods = async (title: string, methodList: typeof methods): Promise<void> => {
			if (methodList.length === 0) return;

			content += `## ${title}\n\n`;
			for (const method of methodList) {
				const methodSummary = ApiParser.getSummary(method);
				const baseName = sanitizeId(method.displayName);
				const prefix = prefixMap.get(baseName) || "";
				const methodId = sanitizeId(method.displayName, prefix);
				const methodItem = method as ApiDeclaredItem;
				const params = ApiParser.getParams(method);
				const hasParameters = params.length > 0;

				if (methodItem.excerpt?.text) {
					const memberSignature = this.typeFormatter.format(methodItem.excerpt).trim();
					const skeletonWithContext = this.generateClassMemberWithContext(apiClass, method, packageName);
					const summaryMd = methodSummary
						? escapeMdxGenerics(markdownCrossLinker.addCrossLinks(methodSummary))
						: undefined;
					content += `<ApiMember code={${JSON.stringify(memberSignature)}} source={${JSON.stringify(skeletonWithContext)}} apiScope={${JSON.stringify(apiScope)}} memberName={${JSON.stringify(method.displayName)}}${summaryMd ? ` summary={${JSON.stringify(summaryMd)}}` : ""} id={${JSON.stringify(methodId)}} hasParameters={${hasParameters}} />\n\n`;
				}
				if (hasParameters) {
					content += `<ParametersTable parameters={${JSON.stringify(
						params.map((p) => ({
							name: p.name,
							type: p.type,
							description: markdownCrossLinker.addCrossLinks(p.description),
						})),
					)}} />\n\n`;
				}
				const returns = ApiParser.getReturns(method);
				if (returns) {
					const description = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(returns.description));
					content += `**Returns:** ${description}\n\n`;
				}
			}
		};

		// 2. Static Properties
		await renderProperties("Static Properties", staticProperties);

		// 3. Static Methods
		await renderMethods("Static Methods", grouped.staticMethods);

		// 4. Instance Properties
		await renderProperties("Properties", instanceProperties);

		// 5. Getters & Setters
		await renderMethods("Getters & Setters", grouped.getters);

		// 6. Instance Methods
		await renderMethods("Methods", grouped.instanceMethods);

		// Add examples - pre-render with Shiki and Twoslash for better build performance
		const examples = ApiParser.getExamples(apiClass);
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
		const seeReferences = ApiParser.getSeeReferences(apiClass);
		if (seeReferences.length > 0) {
			content += `## See Also\n\n`;
			for (const reference of seeReferences) {
				const refText = escapeMdxGenerics(markdownCrossLinker.addCrossLinks(reference.text));
				content += `- ${refText}\n`;
			}
			content += `\n`;
		}

		return {
			routePath: `${baseRoute}/class/${name.toLowerCase()}`,
			content,
		};
	}

	/**
	 * Group class members by their type (static, instance, getters/setters)
	 */
	private groupClassMembers(members: readonly ApiItem[]): GroupedMembers {
		const staticMethods: ApiItem[] = [];
		const instanceMethods: ApiItem[] = [];
		const getters: ApiItem[] = [];

		for (const member of members) {
			// Check if it's a getter/setter based on the display name pattern
			const isGetter =
				member.kind === "Method" && (member.displayName.startsWith("get ") || member.displayName.startsWith("set "));

			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			const isStatic = (member as any).isStatic === true;

			if (isGetter) {
				getters.push(member);
			} else if (isStatic) {
				staticMethods.push(member);
			} else {
				instanceMethods.push(member);
			}
		}

		return { staticMethods, instanceMethods, getters };
	}

	/**
	 * Detect naming conflicts between class members and return prefixes to apply
	 * Returns a Map of sanitized name -> prefix (empty string if no conflict)
	 */
	private detectMemberConflicts(
		staticProps: { displayName: string }[],
		staticMethods: { displayName: string }[],
		instanceProps: { displayName: string }[],
		instanceMethods: { displayName: string }[],
		getters: { displayName: string }[],
	): Map<string, string> {
		const prefixMap = new Map<string, string>();

		// Collect names by category
		const staticPropNames = new Set(staticProps.map((p) => sanitizeId(p.displayName)));
		const staticMethodNames = new Set(staticMethods.map((m) => sanitizeId(m.displayName)));
		const instancePropNames = new Set(instanceProps.map((p) => sanitizeId(p.displayName)));
		const instanceMethodNames = new Set(instanceMethods.map((m) => sanitizeId(m.displayName)));
		const getterNames = new Set(getters.map((g) => sanitizeId(g.displayName)));

		// Check for conflicts and assign prefixes
		// Priority: instance methods > instance props > static methods > static props

		// Mark static properties that conflict with anything
		for (const name of staticPropNames) {
			if (
				staticMethodNames.has(name) ||
				instancePropNames.has(name) ||
				instanceMethodNames.has(name) ||
				getterNames.has(name)
			) {
				prefixMap.set(name, "static-property");
			}
		}

		// Mark static methods that conflict with instance methods/props/getters
		for (const name of staticMethodNames) {
			if (instanceMethodNames.has(name) || instancePropNames.has(name) || getterNames.has(name)) {
				prefixMap.set(name, "static");
			} else if (staticPropNames.has(name)) {
				// Static method vs static property - method wins (no prefix), property gets prefix (handled above)
				prefixMap.set(name, "");
			}
		}

		// Mark instance properties that conflict with instance methods
		for (const name of instancePropNames) {
			if (instanceMethodNames.has(name) || getterNames.has(name)) {
				prefixMap.set(name, "property");
			} else if (staticMethodNames.has(name)) {
				// Instance property vs static method - static gets prefix (handled above)
				prefixMap.set(name, "");
			}
		}

		// Instance methods and getters don't get prefixes - they're the "default"
		for (const name of instanceMethodNames) {
			if (!prefixMap.has(name)) {
				prefixMap.set(name, "");
			}
		}

		for (const name of getterNames) {
			if (!prefixMap.has(name)) {
				prefixMap.set(name, "");
			}
		}

		return prefixMap;
	}

	/**
	 * Generate a class member signature with full class context
	 * Includes hidden imports with cut directive for external type resolution
	 * Uses the simplified approach: 3 lines (class opening, member, closing)
	 */
	private generateClassMemberWithContext(apiClass: ApiClass, targetMember: ApiItem, packageName: string): string {
		const className = apiClass.displayName;

		// Build class declaration
		const inheritance = ApiParser.getInheritance(apiClass);
		let declaration = `class ${className}`;
		if (inheritance.extends && inheritance.extends.length > 0) {
			declaration += ` extends ${inheritance.extends.join(", ")}`;
		}
		if (inheritance.implements && inheritance.implements.length > 0) {
			declaration += ` implements ${inheritance.implements.join(", ")}`;
		}
		declaration += " {";

		// Get the target member signature
		const memberItem = targetMember as ApiDeclaredItem;
		const memberSignature = memberItem.excerpt?.text ? this.typeFormatter.format(memberItem.excerpt).trim() : "";

		// Build the simplified structure: class opening, target member, closing
		// The hide-cut transformer will hide the first and third lines
		const skeleton = `${declaration}\n${memberSignature}\n}`;

		// Extract imports for external type references in this member
		const apiPackage = apiClass.getAssociatedPackage?.();
		if (apiPackage) {
			const extractor = new TypeReferenceExtractor(apiPackage, packageName);
			const imports = extractor.extractImportsForApiItem(targetMember);
			return prependHiddenImports(skeleton, imports);
		}

		return skeleton;
	}

	/**
	 * Generate a class skeleton for signature blocks
	 * Includes hidden imports with cut directive for external type resolution
	 */
	private generateClassSkeletonWithTwoslash(apiClass: ApiClass, packageName: string): string {
		const skeleton = this.generateClassSkeleton(apiClass);

		// Extract imports for external type references in the entire class
		const apiPackage = apiClass.getAssociatedPackage?.();
		if (apiPackage) {
			const extractor = new TypeReferenceExtractor(apiPackage, packageName);
			const imports = extractor.extractImportsForApiItem(apiClass);
			return prependHiddenImports(skeleton, imports);
		}

		return skeleton;
	}

	/**
	 * Generate a complete class skeleton showing all members
	 */
	private generateClassSkeleton(apiClass: ApiClass): string {
		const lines: string[] = [];
		const className = apiClass.displayName;

		// Class declaration with extends/implements clauses
		const inheritance = ApiParser.getInheritance(apiClass);
		let declaration = `class ${className}`;
		if (inheritance.extends && inheritance.extends.length > 0) {
			declaration += ` extends ${inheritance.extends.join(", ")}`;
		}
		if (inheritance.implements && inheritance.implements.length > 0) {
			declaration += ` implements ${inheritance.implements.join(", ")}`;
		}
		declaration += " {";
		lines.push(declaration);

		// 1. Constructors FIRST
		const constructors = apiClass.members.filter((m) => m.kind === "Constructor");
		if (constructors.length > 0) {
			for (const ctor of constructors) {
				const ctorItem = ctor as ApiDeclaredItem;
				if (ctorItem.excerpt?.text) {
					const signature = this.typeFormatter.format(ctorItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// 2. Static members (properties and methods)
		const methods = apiClass.members.filter((m) => m.kind === "Method" || m.kind === "MethodSignature");
		const grouped = this.groupClassMembers(methods);

		// Static properties
		const properties = apiClass.members.filter((m) => m.kind === "Property" || m.kind === "PropertySignature");
		const staticProperties = properties.filter((m) => {
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			return (m as any).isStatic === true;
		});
		if (staticProperties.length > 0) {
			for (const prop of staticProperties) {
				const propItem = prop as ApiDeclaredItem;
				if (propItem.excerpt?.text) {
					const signature = this.typeFormatter.format(propItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// Static methods
		if (grouped.staticMethods.length > 0) {
			for (const method of grouped.staticMethods) {
				const methodItem = method as ApiDeclaredItem;
				if (methodItem.excerpt?.text) {
					const signature = this.typeFormatter.format(methodItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// 3. Instance properties (non-static, non-getters)
		const instanceProperties = properties.filter((m) => {
			// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic property access
			const isStatic = (m as any).isStatic === true;
			const isGetter = m.displayName.startsWith("get ") || m.displayName.startsWith("set ");
			return !isStatic && !isGetter;
		});
		if (instanceProperties.length > 0) {
			for (const prop of instanceProperties) {
				const propItem = prop as ApiDeclaredItem;
				if (propItem.excerpt?.text) {
					const signature = this.typeFormatter.format(propItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// 4. Getters and setters
		if (grouped.getters.length > 0) {
			for (const method of grouped.getters) {
				const methodItem = method as ApiDeclaredItem;
				if (methodItem.excerpt?.text) {
					const signature = this.typeFormatter.format(methodItem.excerpt).trim();
					lines.push(`    ${signature}`);
				}
			}
		}

		// 5. Instance methods
		if (grouped.instanceMethods.length > 0) {
			for (const method of grouped.instanceMethods) {
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
