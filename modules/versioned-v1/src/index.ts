/**
 * Configuration options for the application.
 *
 * @public
 */
export interface Config {
	/** The application name. */
	name: string;

	/** The port number the application listens on. */
	port: number;

	/** Whether to enable debug mode. */
	debug?: boolean;

	/** File path for log output. */
	logPath?: string;
}

/**
 * Severity levels for log messages.
 *
 * @public
 */
export enum LogLevel {
	/** Detailed debugging information. */
	Debug = 0,

	/** General informational messages. */
	Info = 1,

	/** Warning conditions that may require attention. */
	Warn = 2,

	/** Error conditions indicating a failure. */
	Error = 3,
}

/**
 * A simple logger that writes messages at various severity levels.
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
	 * Logs a general message at the {@link LogLevel.Info} level.
	 *
	 * @param message - The message to log.
	 */
	public log(message: string): void {
		if (this._level <= LogLevel.Info) {
			console.log(`[LOG] ${message}`);
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
}

/**
 * A plugin function that receives the application configuration.
 *
 * @public
 */
export type Plugin = (config: Config) => void;

/**
 * Creates and returns an application runner function.
 *
 * @remarks
 * The returned function, when called, starts the application with the
 * provided configuration.
 *
 * @param config - The application configuration.
 * @returns A function that starts the application.
 *
 * @public
 */
export function createApp(config: Config): () => void {
	const logger = new Logger(config.debug ? LogLevel.Debug : LogLevel.Info);
	return () => {
		logger.log(`Starting ${config.name} on port ${config.port}`);
	};
}
