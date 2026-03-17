import type { Effect } from "effect";
import { Context } from "effect";
import type { ConfigValidationError } from "../errors.js";

/**
 * Validated plugin configuration derived from user-provided options.
 * This is the post-validation shape -- all invariants are guaranteed.
 */
export interface ValidatedApiConfig {
	readonly packageName: string;
	readonly model: string;
	readonly baseRoute: string;
	readonly apiFolder: string;
	readonly tsconfig: string | undefined;
	readonly compilerOptions: Record<string, unknown> | undefined;
	readonly externalPackages: ReadonlyArray<{ name: string; version: string }>;
}

export interface ValidatedPluginConfig {
	readonly mode: "single" | "multi";
	readonly apis: ReadonlyArray<ValidatedApiConfig>;
	readonly logLevel: "debug" | "verbose" | "info" | "warn" | "error";
	readonly pageConcurrency: number;
}

export interface ConfigServiceShape {
	readonly getPluginConfig: Effect.Effect<ValidatedPluginConfig>;
	readonly validateMultiVersion: (
		rspressVersions: ReadonlyArray<string>,
		defaultVersion: string,
	) => Effect.Effect<void, ConfigValidationError>;
}

export class ConfigService extends Context.Tag("rspress-plugin-api-extractor/ConfigService")<
	ConfigService,
	ConfigServiceShape
>() {}
