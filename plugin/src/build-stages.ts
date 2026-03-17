import type { ApiItem } from "@microsoft/api-extractor-model";
import type { NamespaceMember } from "./loader.js";
import type { CategoryConfig } from "./types.js";

export interface WorkItem {
	readonly item: ApiItem;
	readonly categoryKey: string;
	readonly categoryConfig: CategoryConfig;
	readonly namespaceMember?: NamespaceMember;
}

export interface GeneratedPageResult {
	readonly workItem: WorkItem;
	readonly content: string;
	readonly bodyContent: string;
	readonly frontmatter: Record<string, unknown>;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly routePath: string;
	readonly relativePathWithExt: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly isUnchanged: boolean;
}

export interface CrossLinkData {
	readonly routes: Map<string, string>;
	readonly kinds: Map<string, string>;
}

export interface FileSnapshot {
	readonly outputDir: string;
	readonly filePath: string;
	readonly publishedTime: string;
	readonly modifiedTime: string;
	readonly contentHash: string;
	readonly frontmatterHash: string;
	readonly buildTime: string;
}

export interface FileWriteResult {
	readonly relativePathWithExt: string;
	readonly absolutePath: string;
	readonly status: "new" | "modified" | "unchanged";
	readonly snapshot: FileSnapshot;
	readonly categoryKey: string;
	readonly label: string;
	readonly routePath: string;
}
