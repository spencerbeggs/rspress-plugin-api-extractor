import type {
	ApiCallSignature,
	ApiClass,
	ApiConstructSignature,
	ApiConstructor,
	ApiEntryPoint,
	ApiEnum,
	ApiEnumMember,
	ApiFunction,
	ApiIndexSignature,
	ApiInterface,
	ApiItem,
	ApiMethod,
	ApiMethodSignature,
	ApiNamespace,
	ApiPackage,
	ApiProperty,
	ApiPropertySignature,
	ApiTypeAlias,
	ApiVariable,
	TypeParameter,
} from "@microsoft/api-extractor-model";
import { ApiItemKind, ApiModel } from "@microsoft/api-extractor-model";
import { VirtualPackage } from "type-registry-effect";

// The published package exports VirtualPackage as a namespace containing the class
const VirtualPackageClass = VirtualPackage.VirtualPackage;

/**
 * Reconstructs TypeScript declaration files from an API Extractor model.
 *
 * Extends {@link VirtualPackage} with the ability to generate high-fidelity
 * `.d.ts` output from API Extractor's `ApiPackage` — including enum values,
 * full JSDoc, namespace members, and all interface member kinds.
 *
 * Use the factory methods {@link fromApiModel} or {@link fromPackage} to create instances.
 */
export class ApiExtractedPackage extends VirtualPackageClass {
	private constructor(
		readonly apiPackage: ApiPackage,
		packageName: string,
		entries: Map<string, string>,
	) {
		super(packageName, "1.0.0", entries);
	}

	/**
	 * Create an ApiExtractedPackage from an API model JSON file path.
	 */
	static fromApiModel(modelPath: string): ApiExtractedPackage {
		const apiModel = new ApiModel();
		const apiPackage = apiModel.loadPackage(modelPath);
		return ApiExtractedPackage.fromPackage(apiPackage, apiPackage.name);
	}

	/**
	 * Create an ApiExtractedPackage from an existing ApiPackage instance.
	 */
	static fromPackage(apiPackage: ApiPackage, packageName: string): ApiExtractedPackage {
		// Build entries map first, then pass to constructor.
		// We use a temporary instance to access generateDeclarations/getEntryPointName,
		// then create the real instance with the populated entries.
		const tempEntries = new Map<string, string>();
		const tempInstance = new ApiExtractedPackage(apiPackage, packageName, tempEntries);
		for (const ep of apiPackage.entryPoints) {
			const entryName = tempInstance.getEntryPointName(ep);
			const fileName = entryName ? `${entryName}.d.ts` : "index.d.ts";
			tempEntries.set(fileName, tempInstance.generateDeclarations(ep));
		}
		return tempInstance;
	}

	/**
	 * Generate the .d.ts content for a specific entry point.
	 */
	generateDeclarations(entryPoint?: ApiEntryPoint): string {
		const ep = entryPoint ?? this.apiPackage.entryPoints[0];
		if (!ep) return "";

		const parts: string[] = [];

		// File header - match TypeScript compiler's @packageDocumentation style
		const packageDoc = this.extractPackageDocumentation();
		if (packageDoc) {
			parts.push(packageDoc);
			parts.push("");
		}

		// Generate declarations for each exported member
		for (const member of ep.members) {
			const decl = this.generateDeclaration(member);
			if (decl) {
				parts.push(decl);
				parts.push("");
			}
		}

		// TypeScript compiler adds a trailing `export { }` to ensure module scope
		parts.push("export { }");
		parts.push("");

		return parts.join("\n");
	}

	/**
	 * Generate a TypeScript declaration for a single API item.
	 */
	private generateDeclaration(apiItem: ApiItem): string | null {
		switch (apiItem.kind) {
			case ApiItemKind.Class:
				return this.generateClassDeclaration(apiItem as ApiClass);
			case ApiItemKind.Interface:
				return this.generateInterfaceDeclaration(apiItem as ApiInterface);
			case ApiItemKind.TypeAlias:
				return this.generateTypeAliasDeclaration(apiItem as ApiTypeAlias);
			case ApiItemKind.Function:
				return this.generateFunctionDeclaration(apiItem as ApiFunction);
			case ApiItemKind.Enum:
				return this.generateEnumDeclaration(apiItem as ApiEnum);
			case ApiItemKind.Variable:
				return this.generateVariableDeclaration(apiItem as ApiVariable);
			case ApiItemKind.Namespace:
				return this.generateNamespaceDeclaration(apiItem as ApiNamespace);
			default:
				return null;
		}
	}

	// ────────────────────────────────────────────────────────
	// Top-level declaration generators
	// ────────────────────────────────────────────────────────

	private generateClassDeclaration(apiClass: ApiClass): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(apiClass);
		if (jsDoc) lines.push(jsDoc);

		// Class header: name + type params are joined without space
		let name = apiClass.displayName;
		if (apiClass.typeParameters?.length) {
			name += this.formatTypeParameters(apiClass.typeParameters);
		}

		const headerParts = ["export declare class", name];

		// Extends
		if (apiClass.extendsType) {
			headerParts.push(`extends ${apiClass.extendsType.excerpt.text}`);
		}

		// Implements
		if (apiClass.implementsTypes?.length) {
			const impl = apiClass.implementsTypes.map((t) => t.excerpt.text).join(", ");
			headerParts.push(`implements ${impl}`);
		}

		lines.push(`${headerParts.join(" ")} {`);

		// Members
		for (const member of apiClass.members) {
			const memberDecl = this.generateClassMember(member);
			if (memberDecl) lines.push(memberDecl);
		}

		lines.push("}");
		return lines.join("\n");
	}

	private generateInterfaceDeclaration(apiInterface: ApiInterface): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(apiInterface);
		if (jsDoc) lines.push(jsDoc);

		// Interface header: name + type params are joined without space
		let name = apiInterface.displayName;
		if (apiInterface.typeParameters?.length) {
			name += this.formatTypeParameters(apiInterface.typeParameters);
		}

		const headerParts = ["export declare interface", name];

		// Extends
		if (apiInterface.extendsTypes?.length) {
			const ext = apiInterface.extendsTypes.map((t) => t.excerpt.text).join(", ");
			headerParts.push(`extends ${ext}`);
		}

		lines.push(`${headerParts.join(" ")} {`);

		// Members
		for (const member of apiInterface.members) {
			const memberDecl = this.generateInterfaceMember(member);
			if (memberDecl) lines.push(memberDecl);
		}

		lines.push("}");
		return lines.join("\n");
	}

	private generateTypeAliasDeclaration(typeAlias: ApiTypeAlias): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(typeAlias);
		if (jsDoc) lines.push(jsDoc);

		// Name + type params joined without space
		let name = typeAlias.displayName;
		if (typeAlias.typeParameters?.length) {
			name += this.formatTypeParameters(typeAlias.typeParameters);
		}

		lines.push(`export declare type ${name} = ${typeAlias.typeExcerpt.text};`);
		return lines.join("\n");
	}

	private generateFunctionDeclaration(apiFunction: ApiFunction): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(apiFunction);
		if (jsDoc) lines.push(jsDoc);

		// Clean the excerpt and re-add export declare, ensure trailing semicolon
		const cleaned = this.cleanExcerpt(apiFunction.excerpt.text);
		lines.push(`export declare ${cleaned};`);

		return lines.join("\n");
	}

	private generateEnumDeclaration(apiEnum: ApiEnum): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(apiEnum);
		if (jsDoc) lines.push(jsDoc);

		lines.push(`export declare enum ${apiEnum.displayName} {`);

		const enumMembers = apiEnum.members.filter((m) => m.kind === ApiItemKind.EnumMember);
		for (let i = 0; i < enumMembers.length; i++) {
			const enumMember = enumMembers[i] as ApiEnumMember;
			const memberJsDoc = this.formatJSDoc(enumMember, "    ");
			if (memberJsDoc) lines.push(memberJsDoc);

			const isLast = i === enumMembers.length - 1;
			const suffix = isLast ? "" : ",";

			// Include initializer value if available
			const initExcerpt = enumMember.initializerExcerpt;
			if (initExcerpt?.text.trim()) {
				lines.push(`    ${enumMember.displayName} = ${initExcerpt.text.trim()}${suffix}`);
			} else {
				lines.push(`    ${enumMember.displayName}${suffix}`);
			}
		}

		lines.push("}");
		return lines.join("\n");
	}

	private generateVariableDeclaration(apiVariable: ApiVariable): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(apiVariable);
		if (jsDoc) lines.push(jsDoc);

		let cleaned = this.cleanExcerpt(apiVariable.excerpt.text);

		// Ensure variable declarations have const/let/var keyword
		if (!cleaned.startsWith("const ") && !cleaned.startsWith("let ") && !cleaned.startsWith("var ")) {
			cleaned = `const ${cleaned}`;
		}

		lines.push(`export declare ${cleaned};`);
		return lines.join("\n");
	}

	private generateNamespaceDeclaration(apiNamespace: ApiNamespace): string {
		const lines: string[] = [];

		// JSDoc
		const jsDoc = this.formatJSDoc(apiNamespace);
		if (jsDoc) lines.push(jsDoc);

		lines.push(`export declare namespace ${apiNamespace.displayName} {`);

		// Namespace members use 'export' without 'declare' (the outer declare applies)
		for (const member of apiNamespace.members) {
			const memberDecl = this.generateNamespaceMember(member);
			if (memberDecl) {
				lines.push(memberDecl);
			}
		}

		lines.push("}");
		return lines.join("\n");
	}

	// ────────────────────────────────────────────────────────
	// Namespace member generators (no 'declare' keyword)
	// ────────────────────────────────────────────────────────

	private generateNamespaceMember(apiItem: ApiItem): string | null {
		switch (apiItem.kind) {
			case ApiItemKind.Function:
				return this.generateNamespaceFunction(apiItem as ApiFunction);
			case ApiItemKind.Interface:
				return this.generateNamespaceInterface(apiItem as ApiInterface);
			case ApiItemKind.Enum:
				return this.generateNamespaceEnum(apiItem as ApiEnum);
			case ApiItemKind.TypeAlias:
				return this.generateNamespaceTypeAlias(apiItem as ApiTypeAlias);
			case ApiItemKind.Variable:
				return this.generateNamespaceVariable(apiItem as ApiVariable);
			case ApiItemKind.Class:
				return this.generateNamespaceClass(apiItem as ApiClass);
			default:
				return null;
		}
	}

	private generateNamespaceFunction(apiFunction: ApiFunction): string {
		const lines: string[] = [];
		const jsDoc = this.formatJSDoc(apiFunction, "    ");
		if (jsDoc) lines.push(jsDoc);

		const cleaned = this.cleanExcerpt(apiFunction.excerpt.text);
		lines.push(`    export ${cleaned};`);
		return lines.join("\n");
	}

	private generateNamespaceInterface(apiInterface: ApiInterface): string {
		const lines: string[] = [];
		const jsDoc = this.formatJSDoc(apiInterface, "    ");
		if (jsDoc) lines.push(jsDoc);

		let name = apiInterface.displayName;
		if (apiInterface.typeParameters?.length) {
			name += this.formatTypeParameters(apiInterface.typeParameters);
		}

		const headerParts = ["export interface", name];
		if (apiInterface.extendsTypes?.length) {
			const ext = apiInterface.extendsTypes.map((t) => t.excerpt.text).join(", ");
			headerParts.push(`extends ${ext}`);
		}
		lines.push(`    ${headerParts.join(" ")} {`);

		for (const member of apiInterface.members) {
			const memberDecl = this.generateInterfaceMember(member, "        ");
			if (memberDecl) lines.push(memberDecl);
		}

		lines.push("    }");
		return lines.join("\n");
	}

	private generateNamespaceEnum(apiEnum: ApiEnum): string {
		const lines: string[] = [];
		const jsDoc = this.formatJSDoc(apiEnum, "    ");
		if (jsDoc) lines.push(jsDoc);

		lines.push(`    export enum ${apiEnum.displayName} {`);

		const enumMembers = apiEnum.members.filter((m) => m.kind === ApiItemKind.EnumMember);
		for (let i = 0; i < enumMembers.length; i++) {
			const enumMember = enumMembers[i] as ApiEnumMember;
			const memberJsDoc = this.formatJSDoc(enumMember, "        ");
			if (memberJsDoc) lines.push(memberJsDoc);

			const isLast = i === enumMembers.length - 1;
			const suffix = isLast ? "" : ",";

			const initExcerpt = enumMember.initializerExcerpt;
			if (initExcerpt?.text.trim()) {
				lines.push(`        ${enumMember.displayName} = ${initExcerpt.text.trim()}${suffix}`);
			} else {
				lines.push(`        ${enumMember.displayName}${suffix}`);
			}
		}

		lines.push("    }");
		return lines.join("\n");
	}

	private generateNamespaceTypeAlias(typeAlias: ApiTypeAlias): string {
		const lines: string[] = [];
		const jsDoc = this.formatJSDoc(typeAlias, "    ");
		if (jsDoc) lines.push(jsDoc);

		let name = typeAlias.displayName;
		if (typeAlias.typeParameters?.length) {
			name += this.formatTypeParameters(typeAlias.typeParameters);
		}
		lines.push(`    export type ${name} = ${typeAlias.typeExcerpt.text};`);
		return lines.join("\n");
	}

	private generateNamespaceVariable(apiVariable: ApiVariable): string {
		const lines: string[] = [];
		const jsDoc = this.formatJSDoc(apiVariable, "    ");
		if (jsDoc) lines.push(jsDoc);

		let cleaned = this.cleanExcerpt(apiVariable.excerpt.text);
		if (!cleaned.startsWith("const ") && !cleaned.startsWith("let ") && !cleaned.startsWith("var ")) {
			cleaned = `const ${cleaned}`;
		}
		lines.push(`    export ${cleaned};`);
		return lines.join("\n");
	}

	private generateNamespaceClass(apiClass: ApiClass): string {
		// Delegate to class generator and indent
		const decl = this.generateClassDeclaration(apiClass);
		if (!decl) return "";
		// Remove 'declare' and indent
		const adjusted = decl.replace(/\bexport declare class\b/, "export class");
		return adjusted
			.split("\n")
			.map((line) => (line.trim() ? `    ${line}` : line))
			.join("\n");
	}

	// ────────────────────────────────────────────────────────
	// Class/Interface member generators
	// ────────────────────────────────────────────────────────

	private generateClassMember(member: ApiItem, indent = "    "): string | null {
		switch (member.kind) {
			case ApiItemKind.Constructor:
				return this.generateMemberFromExcerpt(member as ApiConstructor, indent);
			case ApiItemKind.Method:
				return this.generateMemberFromExcerpt(member as ApiMethod, indent);
			case ApiItemKind.Property:
				return this.generateMemberFromExcerpt(member as ApiProperty, indent);
			default:
				return null;
		}
	}

	private generateInterfaceMember(member: ApiItem, indent = "    "): string | null {
		switch (member.kind) {
			case ApiItemKind.MethodSignature:
				return this.generateMemberFromExcerpt(member as ApiMethodSignature, indent);
			case ApiItemKind.PropertySignature:
				return this.generateMemberFromExcerpt(member as ApiPropertySignature, indent);
			case ApiItemKind.CallSignature:
				return this.generateMemberFromExcerpt(member as ApiCallSignature, indent);
			case ApiItemKind.ConstructSignature:
				return this.generateMemberFromExcerpt(member as ApiConstructSignature, indent);
			case ApiItemKind.IndexSignature:
				return this.generateMemberFromExcerpt(member as ApiIndexSignature, indent);
			default:
				return null;
		}
	}

	private generateMemberFromExcerpt(
		member:
			| ApiCallSignature
			| ApiConstructSignature
			| ApiConstructor
			| ApiIndexSignature
			| ApiMethod
			| ApiMethodSignature
			| ApiProperty
			| ApiPropertySignature,
		indent: string,
	): string {
		const lines: string[] = [];
		const jsDoc = this.formatJSDoc(member, indent);
		if (jsDoc) lines.push(jsDoc);

		const cleaned = this.cleanExcerpt(member.excerpt.text);
		lines.push(`${indent}${cleaned};`);
		return lines.join("\n");
	}

	// ────────────────────────────────────────────────────────
	// Utilities
	// ────────────────────────────────────────────────────────

	/**
	 * Clean an excerpt text: strip export/declare keywords and trailing semicolons/whitespace.
	 */
	private cleanExcerpt(text: string): string {
		return text
			.replace(/^export\s+/, "")
			.replace(/^declare\s+/, "")
			.replace(/;+\s*$/, "")
			.trim();
	}

	private formatTypeParameters(typeParameters: readonly TypeParameter[]): string {
		if (!typeParameters.length) return "";

		const params = typeParameters.map((tp) => {
			const parts = [tp.name];
			if (tp.constraintExcerpt?.text.trim()) {
				parts.push(`extends ${tp.constraintExcerpt.text.trim()}`);
			}
			if (tp.defaultTypeExcerpt?.text.trim()) {
				parts.push(`= ${tp.defaultTypeExcerpt.text.trim()}`);
			}
			return parts.join(" ");
		});

		return `<${params.join(", ")}>`;
	}

	private extractPackageDocumentation(): string | null {
		// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic access
		const pkg = this.apiPackage as any;
		if (!pkg.tsdocComment?.summarySection) return null;

		const summary = this.extractPlainText(pkg.tsdocComment.summarySection).trim();
		if (!summary) return null;

		const lines: string[] = [];
		for (const line of summary.split("\n")) {
			lines.push(line);
		}
		lines.push("");
		lines.push("@packageDocumentation");

		const formatted = lines.map((line) => (line ? ` * ${line}` : " *")).join("\n");
		return `/**\n${formatted}\n */`;
	}

	/**
	 * Format JSDoc comment from an API item's TSDoc.
	 * Produces output matching the TypeScript compiler's JSDoc style.
	 */
	private formatJSDoc(apiItem: unknown, indent = ""): string | null {
		// biome-ignore lint/suspicious/noExplicitAny: API Extractor types require dynamic access
		const item = apiItem as any;
		if (!item.tsdocComment) return null;

		const tsdoc = item.tsdocComment;
		const lines: string[] = [];

		// Extract summary
		if (tsdoc.summarySection) {
			const summary = this.extractPlainText(tsdoc.summarySection).trim();
			if (summary) {
				for (const line of summary.split("\n")) {
					lines.push(line);
				}
			}
		}

		// @typeParam blocks (placed before @remarks in TS compiler output)
		const typeParamLines: string[] = [];
		if (tsdoc.typeParams?.blocks) {
			for (const block of tsdoc.typeParams.blocks) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc types require dynamic access
				const blockAny = block as any;
				const name = blockAny.parameterName || "";
				const desc = this.extractPlainText(blockAny.content).replace(/\s+/g, " ").trim();
				if (name && desc) typeParamLines.push(`@typeParam ${name} - ${desc}`);
			}
		}

		// @param blocks
		const paramLines: string[] = [];
		if (tsdoc.params?.blocks) {
			for (const paramBlock of tsdoc.params.blocks) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc types require dynamic access
				const param = paramBlock as any;
				const name = param.parameterName || "";
				const desc = this.extractPlainText(param.content).replace(/\s+/g, " ").trim();
				if (name && desc) paramLines.push(`@param ${name} - ${desc}`);
			}
		}

		// @returns
		let returnsLine: string | null = null;
		if (tsdoc.returnsBlock) {
			// biome-ignore lint/suspicious/noExplicitAny: TSDoc types require dynamic access
			const desc = this.extractPlainText((tsdoc.returnsBlock as any).content)
				.replace(/\s+/g, " ")
				.trim();
			if (desc) returnsLine = `@returns ${desc}`;
		}

		// Group: typeParam + param + returns (blank line before group)
		if (typeParamLines.length || paramLines.length || returnsLine) {
			if (lines.length > 0) lines.push("");
			lines.push(...typeParamLines);
			lines.push(...paramLines);
			if (returnsLine) lines.push(returnsLine);
		}

		// @deprecated
		if (tsdoc.deprecatedBlock) {
			// biome-ignore lint/suspicious/noExplicitAny: TSDoc types require dynamic access
			const msg = this.extractPlainText((tsdoc.deprecatedBlock as any).content)
				.replace(/\s+/g, " ")
				.trim();
			if (msg) {
				if (lines.length > 0) lines.push("");
				lines.push(`@deprecated ${msg}`);
			}
		}

		// @remarks (placed after typeParam/param/returns in TS compiler output)
		if (tsdoc.remarksBlock) {
			// biome-ignore lint/suspicious/noExplicitAny: TSDoc types require dynamic access
			const remarks = this.extractPlainText((tsdoc.remarksBlock as any).content).trim();
			if (remarks) {
				if (lines.length > 0) lines.push("");
				lines.push("@remarks");
				for (const line of remarks.split("\n")) {
					lines.push(line);
				}
			}
		}

		// @example blocks
		if (tsdoc.customBlocks) {
			for (const block of tsdoc.customBlocks) {
				// biome-ignore lint/suspicious/noExplicitAny: TSDoc types require dynamic access
				const blockAny = block as any;
				if (blockAny.blockTag?.tagName === "@example") {
					const exampleText = this.extractPlainText(blockAny.content).trim();
					if (exampleText) {
						if (lines.length > 0) lines.push("");
						lines.push("@example");
						for (const line of exampleText.split("\n")) {
							lines.push(line);
						}
					}
				}
			}
		}

		// @public modifier
		try {
			if (tsdoc.modifierTagSet?.isPublic?.()) {
				if (lines.length > 0) lines.push("");
				lines.push("@public");
			}
		} catch {
			// modifierTagSet might not be available
		}

		if (lines.length === 0) return null;

		// Format as JSDoc comment
		if (lines.length === 1 && !lines[0].includes("\n")) {
			return `${indent}/** ${lines[0]} */`;
		}

		const formatted = lines.map((line) => (line ? `${indent} * ${line}` : `${indent} *`)).join("\n");
		return `${indent}/**\n${formatted}\n${indent} */`;
	}

	/**
	 * Recursively extract plain text from a TSDoc DocNode tree.
	 */
	private extractPlainText(node: unknown): string {
		// biome-ignore lint/suspicious/noExplicitAny: TSDoc node types require dynamic access
		const n = node as any;

		// Leaf nodes
		if (n.kind === "PlainText") return n.text || "";
		if (n.kind === "SoftBreak") return "\n";
		if (n.kind === "CodeSpan") return `\`${n.code || ""}\``;
		if (n.kind === "EscapedText") return n.encodedText || n.decodedText || "";
		if (n.kind === "ErrorText") return n.text || "";

		// Fenced code blocks (inside @example)
		if (n.kind === "FencedCode") {
			const language = n.language || "";
			const code = (n.code || "").replace(/\n+$/, "");
			return `\`\`\`${language}\n${code}\n\`\`\``;
		}

		// Link tags: reconstruct {@link X.Y | display text}
		if (n.kind === "LinkTag") {
			let target = "";
			if (n.codeDestination?.memberReferences) {
				const identifiers: string[] = [];
				for (const ref of n.codeDestination.memberReferences) {
					if (ref.memberIdentifier?.identifier) {
						identifiers.push(ref.memberIdentifier.identifier);
					}
				}
				target = identifiers.join(".");
			}
			const displayText = typeof n.linkText === "string" ? n.linkText : "";
			if (target && displayText) return `{@link ${target} | ${displayText}}`;
			if (target) return `{@link ${target}}`;
			if (displayText) return displayText;
			return "";
		}

		// Section: join paragraphs with double newlines
		if (n.kind === "Section") {
			const children = n.getChildNodes?.() || [];
			const paragraphs: string[] = [];
			for (const child of children) {
				const text = this.extractPlainText(child);
				const trimmed = text.trim();
				if (trimmed) paragraphs.push(trimmed);
			}
			return paragraphs.join("\n\n");
		}

		// Default: recurse into children
		const parts: string[] = [];
		if (n.getChildNodes && typeof n.getChildNodes === "function") {
			for (const child of n.getChildNodes()) {
				const text = this.extractPlainText(child);
				if (text) parts.push(text);
			}
		}

		return parts.join("");
	}

	private getEntryPointName(entryPoint: ApiEntryPoint): string | undefined {
		if (entryPoint.displayName === "") return undefined;
		return entryPoint.displayName;
	}
}
