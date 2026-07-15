import { Data } from "effect";

// --- Fatal errors (abort build) ---

export const ConfigValidationErrorBase = Data.TaggedError("ConfigValidationError");

export class ConfigValidationError extends ConfigValidationErrorBase<{
	readonly field: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Config validation failed for '${this.field}': ${this.reason}`;
	}
}

export const ApiModelLoadErrorBase = Data.TaggedError("ApiModelLoadError");

export class ApiModelLoadError extends ApiModelLoadErrorBase<{
	readonly modelPath: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Failed to load API model at '${this.modelPath}': ${this.reason}`;
	}
}

export const SnapshotDbErrorBase = Data.TaggedError("SnapshotDbError");

export class SnapshotDbError extends SnapshotDbErrorBase<{
	readonly operation: string;
	readonly dbPath: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Snapshot DB error during '${this.operation}' at '${this.dbPath}': ${this.reason}`;
	}
}

export const PathDerivationErrorBase = Data.TaggedError("PathDerivationError");

export class PathDerivationError extends PathDerivationErrorBase<{
	readonly route: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Path derivation error for route '${this.route}': ${this.reason}`;
	}
}

// --- Recoverable errors (skip item, continue pipeline) ---

export const TypeRegistryErrorBase = Data.TaggedError("TypeRegistryError");

export class TypeRegistryError extends TypeRegistryErrorBase<{
	readonly packageName: string;
	readonly version: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Type registry error for '${this.packageName}@${this.version}': ${this.reason}`;
	}
}

export const PageGenerationErrorBase = Data.TaggedError("PageGenerationError");

export class PageGenerationError extends PageGenerationErrorBase<{
	readonly itemName: string;
	readonly category: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Page generation failed for ${this.category} '${this.itemName}': ${this.reason}`;
	}
}

// --- Ignorable errors (log only) ---

export const TwoslashProcessingErrorBase = Data.TaggedError("TwoslashProcessingError");

export class TwoslashProcessingError extends TwoslashProcessingErrorBase<{
	readonly file: string;
	readonly errorCode: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Twoslash error ${this.errorCode} in '${this.file}': ${this.reason}`;
	}
}

export const PrettierFormatErrorBase = Data.TaggedError("PrettierFormatError");

export class PrettierFormatError extends PrettierFormatErrorBase<{
	readonly file: string;
	readonly reason: string;
}> {
	get message(): string {
		return `Prettier format error in '${this.file}': ${this.reason}`;
	}
}
