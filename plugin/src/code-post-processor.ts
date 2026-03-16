import { isTwoslashDirective } from "./twoslash-patterns.js";

/**
 * Add logical blank lines between code sections for visual clarity.
 *
 * Runs after Prettier formatting to insert breathing room between
 * imports, comments, and return statements without affecting the
 * structural formatting Prettier already applied.
 */
export function addLogicalBlankLines(code: string): string {
	const lines = code.split("\n");
	const result: string[] = [];
	let inMultiLineImport = false;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i];
		const trimmed = line.trim();

		// Track multi-line import state
		const wasInMultiLineImport = inMultiLineImport;
		if (!inMultiLineImport && trimmed.startsWith("import ") && !trimmed.endsWith(";")) {
			inMultiLineImport = true;
		} else if (inMultiLineImport && trimmed.endsWith(";")) {
			inMultiLineImport = false;
		}

		// Current line is part of an import statement
		const isCurrentImport = trimmed.startsWith("import ") || wasInMultiLineImport;

		// Skip rule evaluation for lines inside import statements
		if (result.length > 0 && !isCurrentImport) {
			const prevTrimmed = result[result.length - 1].trim();

			// Only consider inserting if previous line is non-blank
			if (prevTrimmed !== "") {
				const isDirective = isTwoslashDirective(trimmed);

				// Detect whether the previous line ends an import statement:
				// - Single-line: `import { x } from "y";`
				// - Multi-line closing: `} from "example-module";`
				const prevIsImportEnd =
					(prevTrimmed.startsWith("import ") && prevTrimmed.endsWith(";")) ||
					(/}\s*from\s+/.test(prevTrimmed) && prevTrimmed.endsWith(";"));

				// Rule 1: After import block
				if (prevIsImportEnd && trimmed !== "" && !isDirective) {
					result.push("");
				}

				// Rule 2: Before section comments (skip if Rule 1 already fired)
				if (trimmed.startsWith("//") && !isDirective && !prevTrimmed.startsWith("//") && !prevIsImportEnd) {
					result.push("");
				}

				// Rule 3: Before return statements
				if (/^return[\s;(]/.test(trimmed) && !prevTrimmed.startsWith("//")) {
					result.push("");
				}
			}
		}

		result.push(line);
	}

	return result.join("\n");
}
