/**
 * \@savvy-web/example-module
 *
 * A demonstration module showcasing well-documented TypeScript APIs with cross-referencing types, classes, interfaces, enums, functions, and namespaces.
 *
 * @packageDocumentation
 */

/**
 * An asynchronous task with status tracking and timeout support.
 *
 * @typeParam T - The type the task produces on success
 *
 * @remarks
 * Wraps an async function in a lifecycle tracked by {@link TaskStatus}. Optionally integrates with a {@link Logger} for operational visibility.
 *
 * Use the convenience function {@link runTask} instead of constructing directly when you only need the {@link Result}.
 *
 * @example
 * ```typescript
 * import { AsyncTask, TaskStatus } from "example-module";
 *
 * const task = new AsyncTask({
 *   label: "fetch-data",
 *   execute: async () => {
 *     const res = await fetch("https://api.example.com/data");
 *     return res.json();
 *   },
 *   timeoutMs: 5000,
 * });
 *
 * const result = await task.run();
 * console.log(task.status); // TaskStatus.Completed
 * ```
 *
 * @public
 */
export declare class AsyncTask<T> {
    /**
     * Create a new AsyncTask.
     *
     * @param options - Task configuration – see {@link TaskOptions}
     * @param logger - Optional {@link Logger} for internal diagnostics
     */
    constructor(options: TaskOptions<T>, logger?: Logger);
    /**
     * Cancel the task. Only effective if the task is still {@link TaskStatus.Pending}.
     *
     * @returns `true` if the task was successfully cancelled
     */
    cancel(): boolean;
    /** Human-readable label for identification */
    readonly label: string;
    /**
     * Execute the task and return a {@link Result}.
     *
     * @returns A {@link Result | Result\<T\>} indicating success or failure
     */
    run(): Promise<Result<T>>;
    /** Current lifecycle status – see {@link TaskStatus} */
    status: TaskStatus;
}

/**
 * An object that can be called as a function to parse a string into a number.
 *
 * @remarks
 * Demonstrates a **call signature** inside an interface. Consumers can assign any compatible function to a variable typed as {@link Callable}.
 *
 * @example
 * ```typescript
 * import type { Callable } from "example-module";
 *
 * const parse: Callable = (input: string) => Number.parseFloat(input);
 * console.log(parse("3.14")); // 3.14
 * ```
 *
 * @public
 */
export declare interface Callable {
    /** Parse `input` and return a numeric representation. */
    (input: string): number;
}

/**
 * An object that can be instantiated with `new` to produce a {@link Result}.
 *
 * @remarks
 * Demonstrates a **construct signature** inside an interface. Any class whose constructor accepts a single `label` string and returns a {@link Result | Result\<string\>} satisfies this contract.
 *
 * @example
 * ```typescript
 * import type { Constructable, Result } from "example-module";
 *
 * const Factory: Constructable = class {
 *   constructor(label: string) {
 *     return { ok: true, value: label } as Result<string>;
 *   }
 * } as unknown as Constructable;
 * ```
 *
 * @public
 */
export declare interface Constructable {
    /** Create a new {@link Result | Result\<string\>} identified by `label`. */
    new (label: string): Result<string>;
}

/**
 * Create a {@link LogEntry} from primitive values.
 *
 * @param level - Severity level
 * @param message - Human-readable message
 * @param source - Source component identifier
 * @returns A fully-formed {@link LogEntry}
 *
 * @public
 */
export declare function createLogEntry(level: LogLevel, message: string, source: string): LogEntry;

/**
 * Default {@link LoggerOptions} used when none are provided.
 *
 * @public
 */
export declare const DEFAULT_LOGGER_OPTIONS: LoggerOptions;

/**
 * Utilities for formatting values into human-readable strings.
 *
 * @remarks
 * All formatters accept the raw value and return a formatted string. They are designed to compose with {@link Logger} transports – for example you can use {@link Formatters.formatEntry} inside a {@link LogTransport} to produce structured text output.
 *
 * @example
 * ```typescript
 * import { Formatters, Logger, LogLevel } from "example-module";
 *
 * const logger = new Logger();
 * logger.addTransport((entry) => {
 *   console.log(Formatters.formatEntry(entry));
 * });
 * logger.info("ready");
 * ```
 *
 * @public
 */
export declare namespace Formatters {
    /**
     * Format a duration in milliseconds into a human-readable string.
     *
     * @param ms - Duration in milliseconds
     * @returns A string like `"1.23s"` or `"456ms"`
     *
     * @public
     */
    export function formatDuration(ms: number): string;
    /**
     * Format a {@link LogEntry} into a human-readable string.
     *
     * @param entry - The log entry to format
     * @param options - Formatting options – see {@link FormatOptions}
     * @returns A formatted string representation
     *
     * @example
     * ```typescript
     * import { Formatters, createLogEntry, LogLevel } from "example-module";
     *
     * const entry = createLogEntry(LogLevel.Info, "hello", "app");
     * console.log(Formatters.formatEntry(entry));
     * // "[INFO] hello (app)"
     * ```
     *
     * @public
     */
    export function formatEntry(entry: LogEntry, options?: FormatOptions): string;
    /**
     * Options controlling how {@link formatEntry} produces output.
     *
     * @public
     */
    export interface FormatOptions {
        /** Whether to include the timestamp – defaults to `true` */
        includeTimestamp?: boolean;
        /** Output style – defaults to {@link Style.Compact} */
        style?: Style;
    }
    /**
     * Format a {@link Result} into a summary string.
     *
     * @typeParam T - The result value type
     * @param result - The result to summarise
     * @returns `"ok: <value>"` or `"error: <message>"`
     *
     * @public
     */
    export function formatResult<T>(result: Result<T>): string;
    /**
     * Map {@link LogLevel} to its string label.
     *
     * @param level - The log level to convert
     * @returns An uppercase string label such as `"DEBUG"` or `"ERROR"`
     *
     * @public
     */
    export function levelLabel(level: LogLevel): string;
    /**
     * Output style for formatted log entries.
     *
     * @public
     */
    export enum Style {
        /** Compact single-line format */
        Compact = "compact",
        /** Multi-line format with full metadata */
        Verbose = "verbose"
    }
}

/**
 * Extract only the keys of `T` whose values are of type `V`.
 *
 * @typeParam T - The source object type
 * @typeParam V - The value type to match
 *
 * @remarks
 * This utility type is used internally by {@link pickNumeric} and can be useful in generic data-transformation code.
 *
 * @example
 * ```typescript
 * import type { KeysOfType } from "example-module";
 *
 * interface Stats { name: string; count: number; active: boolean; score: number; }
 * type NumericKeys = KeysOfType<Stats, number>;
 * //   ^? type NumericKeys = "count" | "score"
 * ```
 *
 * @public
 */
export declare type KeysOfType<T, V> = {
    [K in keyof T]: T[K] extends V ? K : never;
}[keyof T];

/**
 * A structured log entry produced by the {@link Logger} class.
 *
 * @remarks
 * Each entry combines a {@link LogLevel} severity with a human-readable message and associated {@link LogMeta | metadata}.
 *
 * @public
 */
export declare interface LogEntry {
    /** Severity level of this entry */
    level: LogLevel;
    /** Human-readable message */
    message: string;
    /** Metadata associated with this entry */
    meta: LogMeta;
}

/**
 * A structured logger with pluggable transports and severity filtering.
 *
 * @remarks
 * Create a {@link Logger} with optional {@link LoggerOptions}, then register one or more {@link LogTransport | transports} to receive {@link LogEntry} objects.
 *
 * All emitted entries include {@link LogMeta} with a timestamp and source.
 *
 * @example
 * ```typescript
 * import { Logger, LogLevel } from "example-module";
 *
 * const logger = new Logger({ minLevel: LogLevel.Info, defaultSource: "app" });
 * logger.addTransport((entry) => console.log(entry.message));
 * logger.info("Server started");
 * ```
 *
 * @public
 */
export declare class Logger {
    /**
     * Create a new Logger instance.
     *
     * @param options - Configuration options – see {@link LoggerOptions}
     */
    constructor(options?: LoggerOptions);
    /**
     * Register a {@link LogTransport} to receive future log entries.
     *
     * @param transport - The transport function to add
     */
    addTransport(transport: LogTransport): void;
    /**
     * Emit a {@link LogLevel.Debug | debug}-level entry.
     *
     * @param message - The log message
     * @param source - Optional source override (defaults to {@link LoggerOptions.defaultSource})
     */
    debug(message: string, source?: string): void;
    /**
     * Emit an {@link LogLevel.Error | error}-level entry.
     *
     * @param message - The log message
     * @param source - Optional source override
     */
    error(message: string, source?: string): void;
    /**
     * Return all registered transports.
     *
     * @returns A read-only array of {@link LogTransport} functions
     */
    getTransports(): readonly LogTransport[];
    /**
     * Emit an {@link LogLevel.Info | info}-level entry.
     *
     * @param message - The log message
     * @param source - Optional source override
     */
    info(message: string, source?: string): void;
    /**
     * Emit a {@link LogLevel.Warn | warn}-level entry.
     *
     * @param message - The log message
     * @param source - Optional source override
     */
    warn(message: string, source?: string): void;
}

/**
 * Configuration options accepted by {@link Logger}.
 *
 * @public
 */
export declare interface LoggerOptions {
    /** Default source tag for entries that do not specify one */
    defaultSource?: string;
    /** Minimum severity to emit – entries below this level are suppressed */
    minLevel?: LogLevel;
}

/**
 * Severity levels for log entries produced by the module.
 *
 * @remarks
 * Levels are ordered from most to least verbose. Consumers can filter log entries by choosing a minimum severity threshold.
 *
 * @example
 * ```typescript
 * import { LogLevel } from "example-module";
 *
 * function shouldLog(entry: LogLevel, threshold: LogLevel): boolean {
 *   return entry >= threshold;
 * }
 * ```
 *
 * @public
 */
export declare enum LogLevel {
    /** Verbose diagnostic output for development */
    Debug = 0,
    /** Routine operational information */
    Info = 1,
    /** Potential problems that do not prevent operation */
    Warn = 2,
    /** Failures that require attention */
    Error = 3
}

/**
 * A mapping from component names to their {@link LogLevel} thresholds.
 *
 * @remarks
 * Demonstrates an **index signature** inside an interface. Use this to configure per-component log levels in a {@link Logger} transport.
 *
 * @example
 * ```typescript
 * import { type LogLevelMap, LogLevel } from "example-module";
 *
 * const levels: LogLevelMap = {
 *   database: LogLevel.Warn,
 *   http: LogLevel.Debug,
 * };
 * ```
 *
 * @public
 */
export declare interface LogLevelMap {
    /** {@link LogLevel} threshold for the named component. */
    [component: string]: LogLevel;
}

/**
 * Metadata attached to every {@link LogEntry}.
 *
 * @remarks
 * Timestamps use epoch milliseconds. The optional `tags` field can be used for structured filtering in log aggregation systems.
 *
 * @public
 */
export declare interface LogMeta {
    /** Logical source component that produced the entry */
    source: string;
    /** Optional tags for structured filtering */
    tags?: string[];
    /** Unix timestamp in milliseconds when the entry was created */
    timestamp: number;
}

/**
 * A function that receives {@link LogEntry} objects from a {@link Logger}.
 *
 * @remarks
 * Transports are registered via {@link Logger.addTransport}. Multiple transports can be active simultaneously.
 *
 * @public
 */
export declare type LogTransport = (entry: LogEntry) => void;

/**
 * Pick only the numeric-valued properties from an object.
 *
 * @typeParam T - The source object type
 * @param obj - The object to extract numeric values from
 * @returns A new object containing only the properties of `T` whose values are `number`
 *
 * @remarks
 * Uses the {@link KeysOfType} utility type internally.
 *
 * @example
 * ```typescript
 * import { pickNumeric } from "example-module";
 *
 * const stats = { name: "test", count: 42, active: true, score: 99 };
 * const nums = pickNumeric(stats);
 * console.log(nums); // { count: 42, score: 99 }
 * ```
 *
 * @public
 */
export declare function pickNumeric<T extends Record<string, unknown>>(obj: T): Pick<T, KeysOfType<T, number>>;

/**
 * Result of an asynchronous operation that can succeed or fail.
 *
 * @typeParam T - The type of the successful value
 *
 * @remarks
 * This is used as the return type of {@link AsyncTask.run} and {@link runTask}. When `ok` is `true`, the `value` field is present; when `ok` is `false`, the `error` field is present.
 *
 * @public
 */
export declare interface Result<T> {
    /** The error message – present when `ok` is `false` */
    error?: string;
    /** Whether the operation succeeded */
    ok: boolean;
    /** The result value – present when `ok` is `true` */
    value?: T;
}

/**
 * Run an {@link AsyncTask} in one call and return the {@link Result}.
 *
 * @typeParam T - The type the task produces
 * @param options - Task configuration – see {@link TaskOptions}
 * @param logger - Optional {@link Logger} for diagnostics
 * @returns A {@link Result | Result\<T\>}
 *
 * @remarks
 * This is a convenience wrapper around {@link AsyncTask} for cases where you don't need to track the task's {@link TaskStatus} separately.
 *
 * @example
 * ```typescript
 * import { runTask, LogLevel } from "example-module";
 *
 * const result = await runTask({
 *   label: "greet",
 *   execute: async () => "Hello, world!",
 *   logLevel: LogLevel.Info,
 * });
 *
 * if (result.ok) {
 *   console.log(result.value); // "Hello, world!"
 * }
 * ```
 *
 * @public
 */
export declare function runTask<T>(options: TaskOptions<T>, logger?: Logger): Promise<Result<T>>;

/**
 * Shorthand for a mapping of string keys to serialisable values.
 *
 * @remarks
 * Useful for attaching arbitrary context to {@link LogMeta.tags} or as a general-purpose record type throughout the module.
 *
 * @public
 */
export declare type StringRecord = Record<string, string | number | boolean>;

/**
 * Options for creating an {@link AsyncTask}.
 *
 * @typeParam T - The type the task resolves to
 *
 * @public
 */
export declare interface TaskOptions<T> {
    /** The async function to execute when the task is run */
    execute: () => Promise<T>;
    /** Human-readable label for the task */
    label: string;
    /** Minimum {@link LogLevel} for internal task logging */
    logLevel?: LogLevel;
    /** Optional timeout in milliseconds – defaults to no timeout */
    timeoutMs?: number;
}

/**
 * Status of an {@link AsyncTask} during its lifecycle.
 *
 * @public
 */
export declare enum TaskStatus {
    /** The task has been created but not started */
    Pending = "pending",
    /** The task is currently executing */
    Running = "running",
    /** The task completed successfully */
    Completed = "completed",
    /** The task was cancelled before completion */
    Cancelled = "cancelled",
    /** The task failed with an error */
    Failed = "failed"
}

/**
 * Validation utilities for checking data shapes and constraints.
 *
 * @remarks
 * Each validator returns a {@link Validators.ValidationResult} indicating success or failure with a descriptive message.
 *
 * Validators integrate with the logging system – pass a {@link Logger} to {@link Validators.validateAll} to log individual results.
 *
 * @public
 */
export declare namespace Validators {
    /**
     * Check that a number falls within a range (inclusive).
     *
     * @param value - The number to check
     * @param min - Minimum allowed value
     * @param max - Maximum allowed value
     * @returns A {@link ValidationResult}
     *
     * @public
     */
    export function isInRange(value: number, min: number, max: number): ValidationResult;
    /**
     * Check that a string is non-empty.
     *
     * @param value - The string to check
     * @returns A {@link ValidationResult}
     *
     * @public
     */
    export function isNonEmpty(value: string): ValidationResult;
    /**
     * Run an array of {@link ValidatorFn | validators} against a value and return all results.
     *
     * @typeParam T - The type of value being validated
     * @param value - The value to validate
     * @param validators - Array of validator functions
     * @param logger - Optional {@link Logger} to record each result
     * @returns An array of {@link ValidationResult} objects
     *
     * @public
     */
    export function validateAll<T>(value: T, validators: ValidatorFn<T>[], logger?: Logger): ValidationResult[];
    /**
     * The outcome of a single validation check.
     *
     * @public
     */
    export interface ValidationResult {
        /** Descriptive message explaining the outcome */
        message: string;
        /** Whether the check passed */
        valid: boolean;
    }
    /**
     * A function that validates a value and returns a {@link ValidationResult}.
     *
     * @typeParam T - The type of value being validated
     *
     * @public
     */
    export type ValidatorFn<T> = (value: T) => ValidationResult;
}

/**
 * Current version of the example-module package.
 *
 * @public
 */
export declare const VERSION: string;

export { }
