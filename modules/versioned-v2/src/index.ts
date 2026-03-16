/**
 * Network listen configuration for the application.
 *
 * @remarks
 * New in v2: replaces the simple `port` number from v1 with a structured
 * host/port object.
 *
 * @public
 */
export interface ListenConfig {
	/** The hostname or IP address to bind to. */
	host: string;

	/** The port number to listen on. */
	port: number;
}

/**
 * Configuration options for the application.
 *
 * @remarks
 * Breaking changes from v1:
 * - `name` renamed to `appName`
 * - `port` replaced by `listen: ListenConfig`
 * - `debug` replaced by `verbose`
 * - `logPath` removed
 * - `middleware` added
 *
 * @public
 */
export interface Config {
	/** The application name. Renamed from `name` in v1. */
	appName: string;

	/** Network listen configuration. Replaces `port` from v1. */
	listen: ListenConfig;

	/** Whether to enable verbose output. Replaces `debug` from v1. */
	verbose?: boolean;

	/** Middleware stack to apply. New in v2. */
	middleware?: Middleware[];
}

/**
 * Severity levels for log messages.
 *
 * @remarks
 * Breaking changes from v1:
 * - `Debug` removed
 * - `Trace` added at level 0
 * - `Fatal` added at level 4
 *
 * @public
 */
export enum LogLevel {
	/** Most detailed tracing information. New in v2, replaces Debug. */
	Trace = 0,

	/** General informational messages. */
	Info = 1,

	/** Warning conditions that may require attention. */
	Warn = 2,

	/** Error conditions indicating a failure. */
	Error = 3,

	/** Unrecoverable error that forces shutdown. New in v2. */
	Fatal = 4,
}

/**
 * A middleware component that can intercept and transform requests.
 *
 * @remarks
 * New in v2: middleware support was not available in v1.
 *
 * @public
 */
export interface Middleware {
	/** A human-readable name for the middleware. */
	name: string;

	/**
	 * Executes the middleware logic.
	 *
	 * @param context - An arbitrary context object passed through the middleware chain.
	 * @returns A promise that resolves when the middleware has finished.
	 */
	execute(context: Record<string, unknown>): Promise<void>;
}

/**
 * A logger that writes messages at various severity levels.
 *
 * @remarks
 * Breaking changes from v1:
 * - `log()` removed, replaced by `info()`
 * - `setLevel()` added
 * - `fatal()` added
 *
 * @public
 */
export class Logger {
	private _level: LogLevel;

	/**
	 * Creates a new Logger instance.
	 *
	 * @param level - The minimum log level to output.
	 */
	constructor(level: LogLevel = LogLevel.Info) {
		this._level = level;
	}

	/**
	 * Changes the minimum log level at runtime.
	 *
	 * @remarks
	 * New in v2: the log level was immutable in v1.
	 *
	 * @param level - The new minimum log level.
	 */
	public setLevel(level: LogLevel): void {
		this._level = level;
	}

	/**
	 * Logs an informational message at the {@link LogLevel.Info} level.
	 *
	 * @remarks
	 * New in v2: replaces `log()` from v1.
	 *
	 * @param message - The message to log.
	 */
	public info(message: string): void {
		if (this._level <= LogLevel.Info) {
			console.info(`[INFO] ${message}`);
		}
	}

	/**
	 * Logs a warning message at the {@link LogLevel.Warn} level.
	 *
	 * @param message - The warning message to log.
	 */
	public warn(message: string): void {
		if (this._level <= LogLevel.Warn) {
			console.warn(`[WARN] ${message}`);
		}
	}

	/**
	 * Logs an error message at the {@link LogLevel.Error} level.
	 *
	 * @param message - The error message to log.
	 */
	public error(message: string): void {
		if (this._level <= LogLevel.Error) {
			console.error(`[ERROR] ${message}`);
		}
	}

	/**
	 * Logs a fatal message at the {@link LogLevel.Fatal} level.
	 *
	 * @remarks
	 * New in v2: fatal-level logging was not available in v1.
	 *
	 * @param message - The fatal error message to log.
	 */
	public fatal(message: string): void {
		if (this._level <= LogLevel.Fatal) {
			console.error(`[FATAL] ${message}`);
		}
	}
}

/**
 * A plugin function that receives the application configuration and logger.
 *
 * @remarks
 * Breaking change from v1: now receives a `Logger` instance as the second parameter.
 *
 * @public
 */
export type Plugin = (config: Config, logger: Logger) => void;

/**
 * Creates and returns an application runner function.
 *
 * @remarks
 * Breaking change from v1: now accepts a `middleware` parameter.
 * The returned function, when called, starts the application with the
 * provided configuration and middleware stack.
 *
 * @param config - The application configuration.
 * @param middleware - Middleware stack to apply at startup. Defaults to an empty array.
 * @returns A function that starts the application.
 *
 * @public
 */
export function createApp(config: Config, middleware: Middleware[] = []): () => void {
	const logger = new Logger(config.verbose ? LogLevel.Trace : LogLevel.Info);
	return () => {
		logger.info(`Starting ${config.appName} on ${config.listen.host}:${config.listen.port}`);
		for (const mw of middleware) {
			logger.info(`Loaded middleware: ${mw.name}`);
		}
	};
}
