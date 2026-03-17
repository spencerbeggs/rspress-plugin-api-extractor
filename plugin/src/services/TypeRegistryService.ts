import type { Effect } from "effect";
import { Context } from "effect";
import type { VirtualFileSystem } from "type-registry-effect";
import type { VirtualTypeScriptEnvironment } from "type-registry-effect/node";
import type { TypeRegistryError } from "../errors.js";

export interface ExternalPackageSpec {
	readonly name: string;
	readonly version: string;
}

export interface TypeRegistryResult {
	readonly vfs: VirtualFileSystem;
}

export interface TypeRegistryServiceShape {
	readonly loadPackages: (
		packages: ReadonlyArray<ExternalPackageSpec>,
	) => Effect.Effect<TypeRegistryResult, TypeRegistryError>;

	readonly createTypeScriptCache: (
		packages: ReadonlyArray<ExternalPackageSpec>,
		compilerOptions: object,
	) => Effect.Effect<Map<string, VirtualTypeScriptEnvironment>, TypeRegistryError>;
}

export class TypeRegistryService extends Context.Tag("rspress-plugin-api-extractor/TypeRegistryService")<
	TypeRegistryService,
	TypeRegistryServiceShape
>() {}
