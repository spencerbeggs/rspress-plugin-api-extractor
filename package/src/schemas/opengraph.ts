import { Schema } from "effect";

/**
 * Structured Open Graph image metadata (alternative to a plain URL string).
 *
 * @public
 */
export const OpenGraphImageMetadata = Schema.Struct({
	/** Absolute URL of the image. */
	url: Schema.String,
	/** HTTPS URL of the image (for secure contexts). */
	secureUrl: Schema.optional(Schema.String),
	/** MIME type of the image (e.g. `"image/png"`). */
	type: Schema.optional(Schema.String),
	/** Image width in pixels. */
	width: Schema.optional(Schema.Number),
	/** Image height in pixels. */
	height: Schema.optional(Schema.Number),
	/** Alt text for the image. */
	alt: Schema.optional(Schema.String),
});
/** @public */
export type OpenGraphImageMetadata = typeof OpenGraphImageMetadata.Type;

/**
 * Open Graph image: either a plain URL string or structured `OpenGraphImageMetadata`.
 *
 * @public
 */
export const OpenGraphImageConfig = Schema.Union([Schema.String, OpenGraphImageMetadata]);
/** @public */
export type OpenGraphImageConfig = typeof OpenGraphImageConfig.Type;

/**
 * Resolved Open Graph metadata emitted into each generated page's frontmatter.
 *
 * @public
 */
export const OpenGraphMetadata = Schema.Struct({
	/** Canonical site base URL. */
	siteUrl: Schema.String,
	/** Page route path (e.g. `/api/classes/myclass`). */
	pageRoute: Schema.String,
	/** Page description for the `og:description` tag. */
	description: Schema.String,
	/** ISO 8601 date string for `article:published_time`. */
	publishedTime: Schema.String,
	/** ISO 8601 date string for `article:modified_time`. */
	modifiedTime: Schema.String,
	/** Article section label (e.g. `"API"`). */
	section: Schema.String,
	/** Article tag keywords. */
	tags: Schema.mutable(Schema.Array(Schema.String)),
	/** Optional structured image metadata. */
	ogImage: Schema.optional(OpenGraphImageMetadata),
	/** Open Graph object type (e.g. `"article"`). */
	ogType: Schema.String,
});
/** @public */
export type OpenGraphMetadata = typeof OpenGraphMetadata.Type;
