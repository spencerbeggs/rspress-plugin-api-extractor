/**
 * Class factory used by {@link AuditedRecord} to exercise the compiler-generated
 * base-class pattern (`AuditedRecord_base`).
 *
 * @remarks
 * Because the heritage clause of `AuditedRecord` is a call expression,
 * TypeScript hoists an unexported `declare const AuditedRecord_base` into the
 * declaration output — the same shape produced by Effect's `Schema.Class` and
 * `Data.TaggedError` helpers. The documentation pipeline must inline that
 * declaration on the class page instead of publishing it as a standalone
 * variable.
 *
 * @internal
 */
function withAuditTrail(): new () => {
	/** Timestamp recorded when the instance was created. */
	readonly createdAt: Date;
	/** Timestamp of the most recent update; initialized at creation and refreshed by {@link AuditedRecord.touch}. */
	updatedAt: Date;
} {
	return class {
		readonly createdAt: Date = new Date();
		updatedAt: Date = new Date();
	};
}

/**
 * A record with an audit trail supplied by a mixin base class.
 *
 * @remarks
 * `AuditedRecord` extends the result of a class-factory call, so its compiled
 * declaration reads `class AuditedRecord extends AuditedRecord_base`, where
 * `AuditedRecord_base` is a compiler-generated, unexported declaration. This
 * exercises the synthetic-base inlining path in the documentation pipeline:
 * the base declaration is rendered in a "Base Class" section on this class's
 * page rather than as a separate variable page.
 *
 * @example
 * ```typescript
 * import { AuditedRecord } from "kitchensink";
 *
 * const record = new AuditedRecord("invoice-42");
 * record.touch();
 * console.log(record.label, record.updatedAt);
 * ```
 *
 * @public
 */
export class AuditedRecord extends withAuditTrail() {
	/** Human-readable label for the record. */
	readonly label: string;

	/**
	 * Create a new audited record.
	 *
	 * @param label - Human-readable label for the record.
	 */
	constructor(label: string) {
		super();
		this.label = label;
	}

	/**
	 * Update the audit trail to mark the record as modified now.
	 *
	 * @returns The updated `updatedAt` timestamp.
	 */
	touch(): Date {
		this.updatedAt = new Date();
		return this.updatedAt;
	}
}
