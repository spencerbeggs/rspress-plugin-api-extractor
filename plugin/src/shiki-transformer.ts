import type { Element, ElementContent, Root } from "hast";
import type { ShikiTransformer } from "shiki";

/**
 * A Shiki transformer that adds cross-links to type references in code blocks.
 *
 * This class creates a Shiki transformer that identifies TypeScript type names
 * in syntax-highlighted code blocks and wraps them in anchor tags linking to
 * their API documentation pages. It handles both standalone type references and
 * class member references (e.g., `ClassName.methodName`).
 *
 * **How it works:**
 * 1. The transformer is initialized with route and kind maps from {@link MarkdownCrossLinker}
 * 2. During Shiki rendering, it walks the HAST tree looking for type names
 * 3. When a match is found, it wraps the text node in an `<a>` tag with the route
 * 4. Semantic CSS classes are added based on the API item kind (class, interface, etc.)
 *
 * **API Scoping:**
 * - Routes are stored per API scope (e.g., "claude-binary-plugin", "rslib-builder")
 * - Each API only links to types within its own scope
 * - The current API scope is set via `setApiScope()` before rendering each file
 *
 * **Relationships:**
 * - Initialized by {@link ApiExtractorPlugin} during the beforeBuild hook
 * - Receives route data from {@link MarkdownCrossLinker.initialize}
 * - Used alongside {@link TwoslashManager} for type-aware code blocks
 * - Works with the hide-cut transformer for member signatures
 *
 * **Features:**
 * - Matches class/interface members within their declaration context
 * - Handles Twoslash-wrapped spans with popup containers
 * - Preserves whitespace and formatting around linked text
 * - Adds semantic CSS classes for styling (api-token-class, api-token-interface, etc.)
 *
 * @example Basic usage
 * ```ts
 * const crossLinker = new ShikiCrossLinker();
 * crossLinker.reinitialize(routes, kinds, "my-api");
 * crossLinker.setApiScope("my-api");
 * const transformer = crossLinker.createTransformer();
 *
 * // Use with Shiki
 * const html = await codeToHtml(code, {
 *   lang: "typescript",
 *   transformers: [transformer]
 * });
 * ```
 *
 * @see {@link MarkdownCrossLinker} for the markdown equivalent
 * @see {@link TwoslashManager} for type-aware documentation features
 */
export class ShikiCrossLinker {
	/**
	 * Map of API scopes to their route maps (API item name -> route)
	 */
	private readonly apiItemRoutesByScope: Map<string, Map<string, string>> = new Map();

	/**
	 * Map of API scopes to their kind maps (API item name -> kind)
	 */
	private readonly apiItemKindsByScope: Map<string, Map<string, string>> = new Map();

	/**
	 * Map of API scopes to their class members maps (class name -> member names[])
	 */
	private readonly classMembersMapByScope: Map<string, Map<string, string[]>> = new Map();

	/**
	 * Current API scope being processed (e.g., "claude-binary-plugin")
	 */
	private currentApiScope: string | null = null;

	/**
	 * Creates a new ShikiCrossLinker instance. Call reinitialize() with routes, kinds,
	 * and API scope before using the transformer.
	 */
	constructor(routes?: Map<string, string>, kinds?: Map<string, string>, apiScope?: string) {
		if (routes && kinds && apiScope) {
			this.reinitialize(routes, kinds, apiScope);
		}
	}

	/**
	 * Initialize or reinitialize the cross-link maps with new data for a specific API scope.
	 * This allows the same transformer instance to be used across multiple API packages,
	 * with each API's routes stored separately and scoped to prevent cross-API linking.
	 *
	 * @param routes - Map of API item names to their documentation routes
	 * @param kinds - Map of API item names to their kinds (Class, Interface, etc.)
	 * @param apiScope - The API scope identifier (e.g., "claude-binary-plugin", "rslib-builder")
	 */
	public reinitialize(routes: Map<string, string>, kinds: Map<string, string>, apiScope: string): void {
		// Store routes for this specific API scope
		this.apiItemRoutesByScope.set(apiScope, new Map(routes));
		this.apiItemKindsByScope.set(apiScope, new Map(kinds));

		// Build class members map for this API scope
		const classMembersMap = new Map<string, string[]>();
		for (const [name] of routes.entries()) {
			// If this is a member (contains a dot), add it to the class members map
			if (name.includes(".")) {
				const dotIndex = name.indexOf(".");
				const className = name.substring(0, dotIndex);
				const memberName = name.substring(dotIndex + 1);

				if (!classMembersMap.has(className)) {
					classMembersMap.set(className, []);
				}
				const members = classMembersMap.get(className);
				if (members && !members.includes(memberName)) {
					members.push(memberName);
				}
			}
		}

		// Sort members by length (longest first) to match "detectLonger" before "detect"
		for (const members of classMembersMap.values()) {
			members.sort((a, b) => b.length - a.length);
		}

		this.classMembersMapByScope.set(apiScope, classMembersMap);

		// Set as current scope
		this.currentApiScope = apiScope;
	}

	/**
	 * Set the current API scope for cross-linking.
	 * This should be called before rendering each file to ensure links are scoped correctly.
	 *
	 * @param apiScope - The API scope identifier (e.g., "claude-binary-plugin")
	 */
	public setApiScope(apiScope: string): void {
		this.currentApiScope = apiScope;
	}

	/**
	 * Get the routes map for the current API scope
	 */
	private getRoutesForCurrentScope(): Map<string, string> {
		if (!this.currentApiScope) return new Map();
		return this.apiItemRoutesByScope.get(this.currentApiScope) || new Map();
	}

	/**
	 * Get the kinds map for the current API scope
	 */
	private getKindsForCurrentScope(): Map<string, string> {
		if (!this.currentApiScope) return new Map();
		return this.apiItemKindsByScope.get(this.currentApiScope) || new Map();
	}

	/**
	 * Get the class members map for the current API scope
	 */
	private getClassMembersForCurrentScope(): Map<string, string[]> {
		if (!this.currentApiScope) return new Map();
		return this.classMembersMapByScope.get(this.currentApiScope) || new Map();
	}

	/**
	 * Get the routes map for a specific API scope
	 */
	private getRoutesForScope(scope: string | null): Map<string, string> {
		if (!scope) return new Map();
		return this.apiItemRoutesByScope.get(scope) || new Map();
	}

	/**
	 * Get the kinds map for a specific API scope
	 */
	private getKindsForScope(scope: string | null): Map<string, string> {
		if (!scope) return new Map();
		return this.apiItemKindsByScope.get(scope) || new Map();
	}

	/**
	 * Get the class members map for a specific API scope
	 */
	private getClassMembersForScope(scope: string | null): Map<string, string[]> {
		if (!scope) return new Map();
		return this.classMembersMapByScope.get(scope) || new Map();
	}

	/**
	 * Create a Shiki transformer that adds cross-links to type references in code blocks.
	 *
	 * **DEPRECATED:** This method now returns a no-op transformer. Cross-linking has been
	 * moved to post-processing via {@link transformHast} to avoid interfering with Twoslash
	 * popup positioning. The Twoslash transformer calculates popup positions based on the
	 * original span structure, and modifying spans during the Shiki pipeline caused popups
	 * to appear offset from their intended positions.
	 *
	 * @param _apiScope - Unused, kept for API compatibility
	 * @returns A no-op Shiki transformer
	 * @deprecated Use {@link transformHast} after Shiki processing completes instead
	 */
	public createTransformer(_apiScope?: string): ShikiTransformer {
		// No-op transformer - cross-linking is now done via transformHast() post-processing
		// to avoid interfering with Twoslash popup positioning
		return {
			name: "api-docs-cross-linker",
		};
	}

	/**
	 * Transform a finalized HAST tree to add cross-links to type references.
	 *
	 * This method should be called AFTER Shiki (including Twoslash) has fully processed
	 * the code block. This ensures Twoslash popup containers are already in their correct
	 * positions before we add anchor links.
	 *
	 * @param hast - The finalized HAST root node from Shiki
	 * @param apiScope - Optional API scope to use for lookups. If not provided, uses currentApiScope.
	 * @returns The transformed HAST with cross-links added
	 *
	 * @example
	 * ```ts
	 * const hast = await highlighter.codeToHast(code, { transformers: [twoslashTransformer] });
	 * const linkedHast = crossLinker.transformHast(hast, "my-api");
	 * ```
	 */
	public transformHast(hast: Root, apiScope?: string): Root {
		const effectiveScope = apiScope ?? this.currentApiScope;
		return this.transformRootWithScope(hast, effectiveScope);
	}

	/**
	 * Transform the root node of the syntax tree with explicit scope
	 */
	private transformRootWithScope(node: Root, scope: string | null): Root {
		// Get scoped maps for the specified API scope
		const apiItemRoutes = this.getRoutesForScope(scope);
		const apiItemKinds = this.getKindsForScope(scope);
		const classMembersMap = this.getClassMembersForScope(scope);

		// Scope stack for tracking nested class/interface/namespace declarations
		const scopeStack: string[] = [];

		// The root contains a <pre> element, which contains a <code> element, which contains the line spans
		// Find the <code> element
		const preElement = node.children.find((child) => child.type === "element" && child.tagName === "pre");
		if (!preElement || preElement.type !== "element") return node;

		const codeElement = preElement.children.find((child) => child.type === "element" && child.tagName === "code");
		if (!codeElement || codeElement.type !== "element") return node;

		// Find all line elements
		for (const lineElement of codeElement.children) {
			if (lineElement.type !== "element" || lineElement.tagName !== "span") continue;

			// Get the line text - recursively extract all text nodes
			const getText = (node: ElementContent): string => {
				if (node.type === "text") {
					return node.value;
				}
				if (node.type === "element") {
					return node.children.map(getText).join("");
				}
				return "";
			};

			const lineText = lineElement.children.map(getText).join("");

			// FIRST: Check members using current scope context (before context updates)
			const currentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null;
			if (currentScope) {
				const members = classMembersMap.get(currentScope);
				if (members) {
					for (const spanElement of lineElement.children) {
						if (spanElement.type !== "element" || spanElement.tagName !== "span") continue;
						if (!spanElement.children || spanElement.children.length !== 1) continue;

						const textNode = spanElement.children[0];
						if (textNode.type !== "text") continue;

						const rawContent = textNode.value;
						const content = rawContent.trim();
						if (!content) continue;

						// Check if this is a member name
						if (members.includes(content)) {
							const fullMemberName = `${currentScope}.${content}`;
							const memberRoute = apiItemRoutes.get(fullMemberName);
							if (memberRoute) {
								// Get semantic class for the member
								const memberKind = apiItemKinds.get(fullMemberName);
								const memberSemanticClass = memberKind ? this.getSemanticClass(memberKind) : null;

								const leadingSpace = rawContent.match(/^\s*/)?.[0] || "";
								const trailingSpace = rawContent.match(/\s*$/)?.[0] || "";

								// Build class names
								const classNames = ["api-type-link"];
								if (memberSemanticClass) {
									classNames.push(memberSemanticClass);
								}

								const newChildren: ElementContent[] = [];
								if (leadingSpace) {
									newChildren.push({ type: "text", value: leadingSpace });
								}
								newChildren.push({
									type: "element",
									tagName: "a",
									properties: {
										href: memberRoute,
										class: classNames.join(" "),
									},
									children: [{ type: "text", value: content }],
								});
								if (trailingSpace) {
									newChildren.push({ type: "text", value: trailingSpace });
								}

								spanElement.children = newChildren;

								// Mark this span as processed so the span hook doesn't overwrite it
								spanElement.properties = {
									...spanElement.properties,
									"data-api-processed": "true",
								};
							}
						}
					}
				}
			}

			// THEN: Update scope context for subsequent lines
			const classMatch = lineText.match(
				/(?:class|interface|namespace)\s+(\w+)\s*(?:<[^>]*>)?\s*(?:extends|implements)?[^{]*\{/,
			);
			if (classMatch) {
				// Only push scope if braces are unbalanced (declaration opens a new block)
				const openBraces = (lineText.match(/\{/g) || []).length;
				const closeBraces = (lineText.match(/\}/g) || []).length;
				if (openBraces > closeBraces) {
					scopeStack.push(classMatch[1]);
				}
			}

			// Pop scope for excess closing braces
			const openBraces = (lineText.match(/\{/g) || []).length;
			const closeBraces = (lineText.match(/\}/g) || []).length;
			const excessCloses = closeBraces - openBraces;
			for (let i = 0; i < excessCloses && scopeStack.length > 0; i++) {
				scopeStack.pop();
			}
		}

		// Process instance method calls (e.g., variable.method())
		// by extracting type information from Twoslash tooltips
		// We need to recursively find all Twoslash spans, as they may be nested inside styled spans
		const findTwoslashSpans = (element: Element): Element[] => {
			const results: Element[] = [];

			// Check if this element itself is a twoslash-hover span
			const isTwoslashHover = element.properties?.class && String(element.properties.class).includes("twoslash-hover");
			if (isTwoslashHover) {
				results.push(element);
			}

			// Recursively check children
			if (element.children) {
				for (const child of element.children) {
					if (child.type === "element") {
						results.push(...findTwoslashSpans(child as Element));
					}
				}
			}

			return results;
		};

		const twoslashSpans = findTwoslashSpans(codeElement as Element);
		for (const twoslashSpan of twoslashSpans) {
			// Skip if already processed
			if (twoslashSpan.properties?.["data-api-processed"] === "true") continue;

			// Check if this is a Twoslash-wrapped method call
			const methodInfo = this.extractMethodInfoFromTwoslashTooltip(twoslashSpan);
			if (!methodInfo) continue;

			const { className, methodName } = methodInfo;

			// Check if we have a route for this method
			const fullMemberName = `${className}.${methodName}`;
			const memberRoute = apiItemRoutes.get(fullMemberName);
			if (!memberRoute) {
				continue;
			}

			// Get semantic classes
			const memberKind = apiItemKinds.get(fullMemberName);
			const memberSemanticClass = memberKind ? this.getSemanticClass(memberKind) : null;

			// Build class names for the member link
			const memberClassNames = ["api-type-link"];
			if (memberSemanticClass) {
				memberClassNames.push(memberSemanticClass);
			}

			// Extract the actual text to be linked
			const textContent = this.extractTextFromTwoslash(twoslashSpan);
			if (!textContent) {
				continue;
			}

			// Wrap the text with an anchor inside the Twoslash hover span
			this.wrapTwoslashTextInAnchor(twoslashSpan, textContent.trim(), memberRoute, memberClassNames);

			// Mark as processed
			twoslashSpan.properties = {
				...twoslashSpan.properties,
				"data-api-processed": "true",
			};
		}

		// Phase 3: Type reference linking in all spans
		// Build sorted type name list (top-level only, no dotted member names)
		const typeNames = Array.from(apiItemRoutes.keys())
			.filter((name) => !name.includes("."))
			.sort((a, b) => b.length - a.length);

		if (typeNames.length > 0) {
			// Phase 3a: Link type references in Twoslash hover spans
			for (const twoslashSpan of twoslashSpans) {
				if (twoslashSpan.properties?.["data-api-processed"] === "true") continue;
				const text = this.extractTextFromTwoslash(twoslashSpan);
				if (!text) continue;
				const content = text.trim();
				const route = apiItemRoutes.get(content);
				if (!route) continue;
				const kind = apiItemKinds.get(content);
				const semanticClass = kind ? this.getSemanticClass(kind) : null;
				const classNames = ["api-type-link"];
				if (semanticClass) classNames.push(semanticClass);
				this.wrapTwoslashTextInAnchor(twoslashSpan, content, route, classNames);
				twoslashSpan.properties = {
					...twoslashSpan.properties,
					"data-api-processed": "true",
				};
			}

			// Phase 3b: Link type references in regular text nodes
			const escapedNames = typeNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			const typePattern = new RegExp(`\\b(${escapedNames.join("|")})\\b`, "g");

			for (const lineElement of codeElement.children) {
				if (lineElement.type !== "element" || lineElement.tagName !== "span") continue;
				this.linkTypeReferencesInLine(lineElement, typePattern, apiItemRoutes, apiItemKinds);
			}
		}

		// Return the modified tree
		return node;
	}

	/**
	 * Transform the root node of the syntax tree
	 */
	public transformRoot(node: Root): Root {
		// Get scoped maps for current API
		const apiItemRoutes = this.getRoutesForCurrentScope();
		const apiItemKinds = this.getKindsForCurrentScope();
		const classMembersMap = this.getClassMembersForCurrentScope();

		// Scope stack for tracking nested class/interface/namespace declarations
		const scopeStack: string[] = [];

		// The root contains a <pre> element, which contains a <code> element, which contains the line spans
		// Find the <code> element
		const preElement = node.children.find((child) => child.type === "element" && child.tagName === "pre");
		if (!preElement || preElement.type !== "element") return node;

		const codeElement = preElement.children.find((child) => child.type === "element" && child.tagName === "code");
		if (!codeElement || codeElement.type !== "element") return node;

		// Find all line elements
		for (const lineElement of codeElement.children) {
			if (lineElement.type !== "element" || lineElement.tagName !== "span") continue;

			// Get the line text - recursively extract all text nodes
			const getText = (node: ElementContent): string => {
				if (node.type === "text") {
					return node.value;
				}
				if (node.type === "element") {
					return node.children.map(getText).join("");
				}
				return "";
			};

			const lineText = lineElement.children.map(getText).join("");

			// FIRST: Check members using current scope context (before context updates)
			const currentScope = scopeStack.length > 0 ? scopeStack[scopeStack.length - 1] : null;
			if (currentScope) {
				const members = classMembersMap.get(currentScope);
				if (members) {
					for (const spanElement of lineElement.children) {
						if (spanElement.type !== "element" || spanElement.tagName !== "span") continue;
						if (!spanElement.children || spanElement.children.length !== 1) continue;

						const textNode = spanElement.children[0];
						if (textNode.type !== "text") continue;

						const rawContent = textNode.value;
						const content = rawContent.trim();
						if (!content) continue;

						// Check if this is a member name
						if (members.includes(content)) {
							const fullMemberName = `${currentScope}.${content}`;
							const memberRoute = apiItemRoutes.get(fullMemberName);
							if (memberRoute) {
								// Get semantic class for the member
								const memberKind = apiItemKinds.get(fullMemberName);
								const memberSemanticClass = memberKind ? this.getSemanticClass(memberKind) : null;

								const leadingSpace = rawContent.match(/^\s*/)?.[0] || "";
								const trailingSpace = rawContent.match(/\s*$/)?.[0] || "";

								// Build class names
								const classNames = ["api-type-link"];
								if (memberSemanticClass) {
									classNames.push(memberSemanticClass);
								}

								const newChildren: ElementContent[] = [];
								if (leadingSpace) {
									newChildren.push({ type: "text", value: leadingSpace });
								}
								newChildren.push({
									type: "element",
									tagName: "a",
									properties: {
										href: memberRoute,
										class: classNames.join(" "),
									},
									children: [{ type: "text", value: content }],
								});
								if (trailingSpace) {
									newChildren.push({ type: "text", value: trailingSpace });
								}

								spanElement.children = newChildren;

								// Mark this span as processed so the span hook doesn't overwrite it
								spanElement.properties = {
									...spanElement.properties,
									"data-api-processed": "true",
								};
							}
						}
					}
				}
			}

			// THEN: Update scope context for subsequent lines
			const classMatch = lineText.match(
				/(?:class|interface|namespace)\s+(\w+)\s*(?:<[^>]*>)?\s*(?:extends|implements)?[^{]*\{/,
			);
			if (classMatch) {
				// Only push scope if braces are unbalanced (declaration opens a new block)
				const openBraces = (lineText.match(/\{/g) || []).length;
				const closeBraces = (lineText.match(/\}/g) || []).length;
				if (openBraces > closeBraces) {
					scopeStack.push(classMatch[1]);
				}
			}

			// Pop scope for excess closing braces
			const openBraces = (lineText.match(/\{/g) || []).length;
			const closeBraces = (lineText.match(/\}/g) || []).length;
			const excessCloses = closeBraces - openBraces;
			for (let i = 0; i < excessCloses && scopeStack.length > 0; i++) {
				scopeStack.pop();
			}
		}

		// Process instance method calls (e.g., variable.method())
		// by extracting type information from Twoslash tooltips
		// We need to recursively find all Twoslash spans, as they may be nested inside styled spans
		const findTwoslashSpans = (element: Element): Element[] => {
			const results: Element[] = [];

			// Check if this element itself is a twoslash-hover span
			const isTwoslashHover = element.properties?.class && String(element.properties.class).includes("twoslash-hover");
			if (isTwoslashHover) {
				results.push(element);
			}

			// Recursively check children
			if (element.children) {
				for (const child of element.children) {
					if (child.type === "element") {
						results.push(...findTwoslashSpans(child as Element));
					}
				}
			}

			return results;
		};

		const twoslashSpans = findTwoslashSpans(codeElement as Element);
		for (const twoslashSpan of twoslashSpans) {
			// Skip if already processed
			if (twoslashSpan.properties?.["data-api-processed"] === "true") continue;

			// Check if this is a Twoslash-wrapped method call
			const methodInfo = this.extractMethodInfoFromTwoslashTooltip(twoslashSpan);
			if (!methodInfo) continue;

			const { className, methodName } = methodInfo;

			// Check if we have a route for this method
			const fullMemberName = `${className}.${methodName}`;
			const memberRoute = apiItemRoutes.get(fullMemberName);
			if (!memberRoute) {
				continue;
			}

			// Get semantic classes
			const memberKind = apiItemKinds.get(fullMemberName);
			const memberSemanticClass = memberKind ? this.getSemanticClass(memberKind) : null;

			// Build class names for the member link
			const memberClassNames = ["api-type-link"];
			if (memberSemanticClass) {
				memberClassNames.push(memberSemanticClass);
			}

			// Extract the actual text to be linked
			const textContent = this.extractTextFromTwoslash(twoslashSpan);
			if (!textContent) {
				continue;
			}

			// Wrap the text with an anchor inside the Twoslash hover span
			this.wrapTwoslashTextInAnchor(twoslashSpan, textContent.trim(), memberRoute, memberClassNames);

			// Mark as processed
			twoslashSpan.properties = {
				...twoslashSpan.properties,
				"data-api-processed": "true",
			};
		}

		// Phase 3: Type reference linking in all spans
		// Build sorted type name list (top-level only, no dotted member names)
		const typeNames = Array.from(apiItemRoutes.keys())
			.filter((name) => !name.includes("."))
			.sort((a, b) => b.length - a.length);

		if (typeNames.length > 0) {
			// Phase 3a: Link type references in Twoslash hover spans
			for (const twoslashSpan of twoslashSpans) {
				if (twoslashSpan.properties?.["data-api-processed"] === "true") continue;
				const text = this.extractTextFromTwoslash(twoslashSpan);
				if (!text) continue;
				const content = text.trim();
				const route = apiItemRoutes.get(content);
				if (!route) continue;
				const kind = apiItemKinds.get(content);
				const semanticClass = kind ? this.getSemanticClass(kind) : null;
				const classNames = ["api-type-link"];
				if (semanticClass) classNames.push(semanticClass);
				this.wrapTwoslashTextInAnchor(twoslashSpan, content, route, classNames);
				twoslashSpan.properties = {
					...twoslashSpan.properties,
					"data-api-processed": "true",
				};
			}

			// Phase 3b: Link type references in regular text nodes
			const escapedNames = typeNames.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
			const typePattern = new RegExp(`\\b(${escapedNames.join("|")})\\b`, "g");

			for (const lineElement of codeElement.children) {
				if (lineElement.type !== "element" || lineElement.tagName !== "span") continue;
				this.linkTypeReferencesInLine(lineElement, typePattern, apiItemRoutes, apiItemKinds);
			}
		}

		// Return the modified tree
		return node;
	}

	/**
	 * Transform a line element
	 */
	public transformLine(node: Element): void {
		// Get scoped maps for current API
		const apiItemRoutes = this.getRoutesForCurrentScope();
		const apiItemKinds = this.getKindsForCurrentScope();
		const classMembersMap = this.getClassMembersForCurrentScope();

		// Track which spans we've processed to avoid double-processing
		if (!node.children) return;

		// Process all spans in this line to handle Class.method patterns
		for (let i = 0; i < node.children.length; i++) {
			const child = node.children[i];
			if (child.type !== "element" || child.tagName !== "span") continue;

			// Skip if already processed
			if (child.properties?.["data-api-processed"] === "true") continue;

			// Extract the class name - could be in a text node, anchor tag, or Twoslash span
			const content = this.extractTextFromTwoslash(child);
			if (!content) continue;

			const trimmedContent = content.trim();
			const classRoute = apiItemRoutes.get(trimmedContent);

			// Check if this matches a class name that has members
			if (!classRoute || !classMembersMap.has(trimmedContent)) continue;

			// Look at the next sibling span
			const nextChild = node.children[i + 1];
			if (!nextChild || nextChild.type !== "element" || nextChild.tagName !== "span") {
				continue;
			}

			// Extract text from the next span (might be Twoslash-wrapped)
			const nextContent = this.extractTextFromTwoslash(nextChild);
			if (!nextContent) continue;

			const nextValue = nextContent.trim();
			if (!nextValue.startsWith(".")) continue;

			// Look for the method name in the span after the dot
			// The pattern might be: GitInfo | .  | detect
			// Or with Twoslash: GitInfo | <twoslash>.</twoslash> | <twoslash>detect</twoslash>
			const methodSpanIndex = nextValue === "." ? i + 2 : i + 1;
			let methodSpan: Element | null = null;
			let methodText: string | null = null;

			if (nextValue === ".") {
				// Dot is in its own span, method is in the next span
				const possibleMethodSpan = node.children[i + 2];
				if (possibleMethodSpan && possibleMethodSpan.type === "element") {
					methodSpan = possibleMethodSpan as Element;
					methodText = this.extractTextFromTwoslash(methodSpan);
				}
			} else if (nextValue.startsWith(".")) {
				// Dot and method are in the same span
				methodSpan = nextChild as Element;
				methodText = nextValue.substring(1);
			}

			if (!methodText || !methodSpan) continue;

			// Check if this method exists for this class (sorted longest first)
			const members = classMembersMap.get(trimmedContent);
			const matchedMember = members?.find((member) => methodText.startsWith(member));

			if (!matchedMember) continue;

			// Get the full member route
			const fullMemberName = `${trimmedContent}.${matchedMember}`;
			const memberRoute = apiItemRoutes.get(fullMemberName);
			if (!memberRoute) continue;

			// Get semantic classes
			const memberKind = apiItemKinds.get(fullMemberName);
			const memberSemanticClass = memberKind ? this.getSemanticClass(memberKind) : null;

			// Build class names for the member link
			const memberClassNames = ["api-type-link"];
			if (memberSemanticClass) {
				memberClassNames.push(memberSemanticClass);
			}

			// Check if the method text is inside a Twoslash hover span
			const isTwoslashHover =
				methodSpan.properties?.class && String(methodSpan.properties.class).includes("twoslash-hover");

			if (isTwoslashHover) {
				// Wrap the text inside the Twoslash span with an anchor
				this.wrapTwoslashTextInAnchor(methodSpan, methodText.trim(), memberRoute, memberClassNames);
			} else {
				// Regular text node - replace it with an anchor
				const textNode = methodSpan.children.find((c) => c.type === "text");
				if (textNode && textNode.type === "text") {
					const leadingSpace = textNode.value.match(/^\s*/)?.[0] || "";
					const trailingSpace = textNode.value.match(/\s*$/)?.[0] || "";

					const newChildren: ElementContent[] = [];
					if (leadingSpace) {
						newChildren.push({ type: "text", value: leadingSpace });
					}
					newChildren.push({
						type: "element",
						tagName: "a",
						properties: {
							href: memberRoute,
							class: memberClassNames.join(" "),
						},
						children: [{ type: "text", value: methodText.trim() }],
					});
					if (trailingSpace) {
						newChildren.push({ type: "text", value: trailingSpace });
					}

					methodSpan.children = newChildren;
				}
			}

			// Mark as processed
			child.properties = {
				...child.properties,
				"data-api-processed": "true",
			};
			methodSpan.properties = {
				...methodSpan.properties,
				"data-api-processed": "true",
			};

			// Skip ahead if we processed multiple spans
			if (methodSpanIndex > i + 1) {
				i = methodSpanIndex;
			} else {
				i++;
			}
		}
	}

	/**
	 * Transform a span element
	 */
	public transformSpan(node: Element, _line: number, _col: number): void {
		// Get scoped maps for current API
		const apiItemRoutes = this.getRoutesForCurrentScope();
		const apiItemKinds = this.getKindsForCurrentScope();

		// Skip if this span was already processed by the root hook or line handler
		if (node.properties?.["data-api-processed"] === "true") {
			return;
		}

		// Skip if this span already contains a link (modified by root hook)
		const firstChild = node.children?.[0];
		if (firstChild && firstChild.type === "element" && (firstChild as Element).tagName === "a") {
			return;
		}

		// Check if this span contains a Twoslash hover wrapper
		const isTwoslashHover =
			firstChild &&
			firstChild.type === "element" &&
			(firstChild as Element).properties?.class &&
			String((firstChild as Element).properties.class).includes("twoslash-hover");

		if (isTwoslashHover && firstChild.type === "element") {
			// Extract the text from the Twoslash hover span
			const text = this.extractTextFromTwoslash(firstChild as Element);
			if (!text) return;

			const content = text.trim();
			if (!content) return;

			// Check if this is a linkable API item (type reference)
			const route = apiItemRoutes.get(content);
			if (route) {
				// Get semantic class for this API item kind
				const kind = apiItemKinds.get(content);
				const semanticClass = kind ? this.getSemanticClass(kind) : null;

				// Build class names
				const classNames = ["api-type-link", "rp-link"];
				if (semanticClass) {
					classNames.push(semanticClass);
				}

				// Wrap the text inside the Twoslash hover span with an anchor
				this.wrapTwoslashTextInAnchor(firstChild as Element, content, route, classNames);

				// Mark as processed
				node.properties = {
					...node.properties,
					"data-api-processed": "true",
				};
			}
			return;
		}

		// Handle regular text nodes (non-Twoslash)
		const textChild = node.children[0];
		if (!textChild || textChild.type !== "text") {
			return;
		}

		const rawContent = textChild.value;
		const content = rawContent.trim();

		// Skip if the content is empty after trimming
		if (!content) {
			return;
		}

		// Check if this is a linkable API item (type reference)
		const route = apiItemRoutes.get(content);
		if (route) {
			// Get semantic class for this API item kind
			const kind = apiItemKinds.get(content);
			const semanticClass = kind ? this.getSemanticClass(kind) : null;

			// Preserve leading/trailing whitespace from original content
			const leadingSpace = rawContent.match(/^\s*/)?.[0] || "";
			const trailingSpace = rawContent.match(/\s*$/)?.[0] || "";

			// Build class names
			const classNames = ["api-type-link", "rp-link"];
			if (semanticClass) {
				classNames.push(semanticClass);
			}

			// Replace the text node with an anchor, preserving whitespace
			const newChildren: ElementContent[] = [];
			if (leadingSpace) {
				newChildren.push({ type: "text", value: leadingSpace });
			}
			newChildren.push({
				type: "element",
				tagName: "a",
				properties: {
					href: route,
					class: classNames.join(" "),
				},
				children: [{ type: "text", value: content }],
			});
			if (trailingSpace) {
				newChildren.push({ type: "text", value: trailingSpace });
			}

			node.children = newChildren;
		}
	}

	/**
	 * Helper to extract text content from potentially Twoslash-wrapped elements
	 * Twoslash wraps identifiers in: <span class="twoslash-hover"><span class="twoslash-popup-container">...</span>text</span>
	 */
	private extractTextFromTwoslash(element: ElementContent): string | null {
		if (element.type !== "element") return null;

		// Check if this is a twoslash-hover span
		const isTwoslashHover =
			element.tagName === "span" &&
			element.properties?.class &&
			String(element.properties.class).includes("twoslash-hover");

		if (isTwoslashHover) {
			// Find the text node after the twoslash-popup-container
			for (const child of element.children) {
				if (child.type === "text") {
					return child.value;
				}
			}
			return null;
		}

		// Check if it's a regular text node
		if (element.children && element.children.length === 1 && element.children[0].type === "text") {
			return element.children[0].value;
		}

		// Check if it contains an anchor (already processed)
		const anchor = element.children.find((c) => c.type === "element" && (c as Element).tagName === "a");
		if (anchor && anchor.type === "element") {
			const text = anchor.children.find((c) => c.type === "text");
			if (text && text.type === "text") {
				return text.value;
			}
		}

		return null;
	}

	/**
	 * Helper to wrap text in Twoslash hover span with an anchor
	 */
	private wrapTwoslashTextInAnchor(element: Element, text: string, href: string, classNames: string[]): void {
		// Find the text node inside the twoslash-hover span
		for (let i = 0; i < element.children.length; i++) {
			const child = element.children[i];
			if (child.type === "text" && child.value.trim() === text.trim()) {
				// Replace the text node with an anchor
				element.children[i] = {
					type: "element",
					tagName: "a",
					properties: {
						href,
						class: classNames.join(" "),
					},
					children: [{ type: "text", value: text }],
				};
				return;
			}
		}
	}

	/**
	 * Helper to extract class and method information from Twoslash tooltip
	 * Returns { className, methodName } if found, null otherwise
	 */
	private extractMethodInfoFromTwoslashTooltip(element: Element): { className: string; methodName: string } | null {
		// Check if this is a twoslash-hover span
		if (element.tagName !== "span") return null;
		const isTwoslashHover = element.properties?.class && String(element.properties.class).includes("twoslash-hover");
		if (!isTwoslashHover) return null;

		// Find the twoslash-popup-container
		const popupContainer = element.children.find(
			(c) => c.type === "element" && (c as Element).properties?.class?.toString().includes("twoslash-popup-container"),
		);
		if (!popupContainer || popupContainer.type !== "element") return null;

		// Find the code element inside
		const codeElement = (popupContainer as Element).children.find(
			(c) => c.type === "element" && (c as Element).tagName === "code",
		);
		if (!codeElement || codeElement.type !== "element") return null;

		// Extract text content from the tooltip
		const getText = (node: ElementContent): string => {
			if (node.type === "text") return node.value;
			if (node.type === "element") return node.children.map(getText).join("");
			return "";
		};
		const tooltipText = (codeElement as Element).children.map(getText).join("");

		// Look for patterns like "ClassName.methodName(" or "ClassName.propertyName:"
		// Also handles namespace-prefixed tooltips like "function Formatters.formatEntry(…)",
		// "interface Formatters.FormatOptions", "(property) Formatters.someProp:", etc.
		const match = tooltipText.match(
			/^(?:\([^)]+\)\s+)?(?:(?:function|interface|class|enum|type|namespace|const|let|var)\s+)?([A-Z]\w+)\.(\w+)[(:]/,
		);
		if (match) {
			return {
				className: match[1],
				methodName: match[2],
			};
		}

		return null;
	}

	/**
	 * Link type references in regular text nodes within a line element.
	 * Iterates child spans, skipping already-processed and Twoslash-containing spans,
	 * and splits text nodes at type name boundaries.
	 */
	private linkTypeReferencesInLine(
		lineElement: Element,
		typePattern: RegExp,
		apiItemRoutes: Map<string, string>,
		apiItemKinds: Map<string, string>,
	): void {
		for (const child of lineElement.children) {
			if (child.type !== "element" || child.tagName !== "span") continue;

			// Skip already-processed spans
			if (child.properties?.["data-api-processed"] === "true") continue;

			// Skip spans that contain Twoslash elements
			const hasTwoslash = child.children.some(
				(c) => c.type === "element" && c.properties?.class && String(c.properties.class).includes("twoslash"),
			);
			if (hasTwoslash) continue;

			let modified = false;
			const newChildren: ElementContent[] = [];

			for (const textChild of child.children) {
				if (textChild.type !== "text") {
					newChildren.push(textChild);
					continue;
				}

				const fragments = this.splitTextAtTypeReferences(textChild.value, typePattern, apiItemRoutes, apiItemKinds);
				if (fragments.length === 1 && fragments[0].type === "text") {
					// No matches found, keep original
					newChildren.push(textChild);
				} else {
					newChildren.push(...fragments);
					modified = true;
				}
			}

			if (modified) {
				child.children = newChildren;
				child.properties = {
					...child.properties,
					"data-api-processed": "true",
				};
			}
		}
	}

	/**
	 * Split a text string at type reference boundaries, returning an array of
	 * text nodes and anchor elements for matched type names.
	 */
	private splitTextAtTypeReferences(
		text: string,
		typePattern: RegExp,
		apiItemRoutes: Map<string, string>,
		apiItemKinds: Map<string, string>,
	): ElementContent[] {
		// Reset regex state since we're using the global flag
		typePattern.lastIndex = 0;

		const result: ElementContent[] = [];
		let lastIndex = 0;

		for (let match = typePattern.exec(text); match !== null; match = typePattern.exec(text)) {
			const matchedName = match[1];
			const route = apiItemRoutes.get(matchedName);
			if (!route) continue;

			// Add text before the match
			if (match.index > lastIndex) {
				result.push({ type: "text", value: text.slice(lastIndex, match.index) });
			}

			// Add anchor for the match
			const kind = apiItemKinds.get(matchedName);
			const semanticClass = kind ? this.getSemanticClass(kind) : null;
			const classNames = ["api-type-link"];
			if (semanticClass) classNames.push(semanticClass);

			result.push({
				type: "element",
				tagName: "a",
				properties: {
					href: route,
					class: classNames.join(" "),
				},
				children: [{ type: "text", value: matchedName }],
			});

			lastIndex = match.index + match[0].length;
		}

		// If no matches, return the original text as-is
		if (result.length === 0) {
			return [{ type: "text", value: text }];
		}

		// Add remaining text after last match
		if (lastIndex < text.length) {
			result.push({ type: "text", value: text.slice(lastIndex) });
		}

		return result;
	}

	/**
	 * Get the semantic CSS class name for an API item kind.
	 *
	 * @deprecated Semantic token colors are now handled by Shiki's theme CSS variables.
	 * This method always returns null - only api-type-link is used for underline styling.
	 */
	private getSemanticClass(_kind: string): string | null {
		// Semantic token colors are handled by Shiki's theme CSS variables.
		// We only need api-type-link for the underline text decoration.
		return null;
	}
}
