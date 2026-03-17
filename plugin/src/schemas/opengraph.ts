import { Schema } from "effect";

export const OpenGraphImageMetadata = Schema.mutable(
	Schema.Struct({
		url: Schema.String,
		secureUrl: Schema.optional(Schema.String),
		type: Schema.optional(Schema.String),
		width: Schema.optional(Schema.Number),
		height: Schema.optional(Schema.Number),
		alt: Schema.optional(Schema.String),
	}),
);
export type OpenGraphImageMetadata = Schema.Schema.Type<typeof OpenGraphImageMetadata>;

export const OpenGraphImageConfig = Schema.Union(Schema.String, OpenGraphImageMetadata);
export type OpenGraphImageConfig = Schema.Schema.Type<typeof OpenGraphImageConfig>;

export const OpenGraphMetadata = Schema.mutable(
	Schema.Struct({
		siteUrl: Schema.String,
		pageRoute: Schema.String,
		description: Schema.String,
		publishedTime: Schema.String,
		modifiedTime: Schema.String,
		section: Schema.String,
		tags: Schema.mutable(Schema.Array(Schema.String)),
		ogImage: Schema.optional(OpenGraphImageMetadata),
		ogType: Schema.String,
	}),
);
export type OpenGraphMetadata = Schema.Schema.Type<typeof OpenGraphMetadata>;
