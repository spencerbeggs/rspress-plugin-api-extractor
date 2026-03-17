import type { Stream } from "effect";
import { Context } from "effect";
import type { PageGenerationError } from "../errors.js";

export interface GeneratedPage {
	readonly relativePath: string;
	readonly content: string;
	readonly frontmatter: Record<string, unknown>;
	readonly apiName: string;
	readonly version: string | undefined;
	readonly category: string;
	readonly itemName: string;
}

export interface FileWriteDecision {
	readonly page: GeneratedPage;
	readonly outputDir: string;
	readonly status: "new" | "modified" | "unchanged";
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly contentHash: string;
	readonly frontmatterHash: string;
}

export interface PageGeneratorServiceShape {
	readonly generatePages: (config: {
		readonly apiName: string;
		readonly outputDir: string;
		readonly routeBase: string;
		readonly version: string | undefined;
	}) => Stream.Stream<GeneratedPage, PageGenerationError>;
}

export class PageGeneratorService extends Context.Tag("rspress-plugin-api-extractor/PageGeneratorService")<
	PageGeneratorService,
	PageGeneratorServiceShape
>() {}
