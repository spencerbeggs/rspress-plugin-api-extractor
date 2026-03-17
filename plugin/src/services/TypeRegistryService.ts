import type { Effect } from "effect";
import { Context } from "effect";
import type { VirtualFileSystem } from "type-registry-effect";
import type { TypeRegistryError } from "../errors.js";

export interface ExternalPackageSpec {
	readonly name: string;
	readonly version: string;
}

export interface TypeRegistryServiceShape {
	readonly loadPackages: (
		packages: ReadonlyArray<ExternalPackageSpec>,
	) => Effect.Effect<VirtualFileSystem, TypeRegistryError>;
}

export class TypeRegistryService extends Context.Tag("rspress-plugin-api-extractor/TypeRegistryService")<
	TypeRegistryService,
	TypeRegistryServiceShape
>() {}
