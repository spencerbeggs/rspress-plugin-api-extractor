import { execFileSync, spawn } from "node:child_process";

/**
 * Which RSPress server {@link serve} runs.
 *
 * @public
 */
export type ServeMode = "dev" | "preview";

/**
 * Options for {@link serve}. All fields are optional with sensible defaults.
 *
 * @public
 */
export interface ServeOptions {
	/** Which RSPress server to run. Defaults to `"dev"`. */
	mode?: ServeMode;
	/**
	 * Port to serve on. Defaults to `process.env.DEV_PORT` (dev mode only) or
	 * `4173`. Preview mode ignores `DEV_PORT` unless `port` is passed explicitly.
	 */
	port?: number;
	/**
	 * Open a browser once the server is ready. Defaults to `true`, unless the
	 * `NO_OPEN` environment variable is set. Browser opening is best-effort.
	 */
	open?: boolean;
	/** Path to open in the browser, relative to the server root. Defaults to `"/"`. */
	openPath?: string;
	/** Package manager used to invoke the `rspress` CLI. Defaults to `"pnpm"`. */
	packageManager?: string;
	/** Working directory for the server process. Defaults to `process.cwd()`. */
	cwd?: string;
	/**
	 * Predicate over combined stdout/stderr deciding when the server is "ready"
	 * (and the browser should open). Defaults to a mode-specific heuristic — see
	 * {@link isServerReady}.
	 */
	readyWhen?: (output: string) => boolean;
}

/**
 * Fully resolved {@link ServeOptions} with defaults applied.
 *
 * @public
 */
export interface ResolvedServeConfig {
	mode: ServeMode;
	port: number;
	open: boolean;
	openPath: string;
	packageManager: string;
	cwd: string;
	/** Arguments passed to the package manager, e.g. `["rspress", "dev", "--port", "4173"]`. */
	args: string[];
	/** The fully-qualified URL to open in the browser. */
	url: string;
	/** Resolved readiness predicate. */
	isReady: (output: string) => boolean;
}

const DEFAULT_PORT = 4173;

/**
 * Readiness heuristic over a chunk of server output. Both RSPress `dev` and
 * `preview` print a `Local:` address line once the server is listening, which
 * is the reliable cross-mode signal. `dev` additionally prints a
 * "ready ... built in" line, kept as a fallback in case the address-line format
 * changes. Pure and exported so it can be unit-tested and reused as a
 * {@link ServeOptions.readyWhen} building block.
 *
 * @param mode - the server mode (`"dev"` or `"preview"`)
 * @param output - a chunk of combined stdout/stderr from the server process
 * @returns `true` when the server appears to be listening
 * @public
 */
export function isServerReady(mode: ServeMode, output: string): boolean {
	if (output.includes("Local:")) {
		return true;
	}
	if (mode === "dev") {
		return output.includes("ready") && output.includes("built in");
	}
	return false;
}

/**
 * Resolve {@link ServeOptions} into a concrete {@link ResolvedServeConfig},
 * applying all defaults. Pure (modulo reading `process.env`) and exported so
 * the resolution logic can be unit-tested without spawning a server.
 *
 * @param options - optional serve options; all fields have sensible defaults
 * @returns a fully resolved config with all defaults applied
 * @public
 */
export function resolveServeConfig(options: ServeOptions = {}): ResolvedServeConfig {
	const mode: ServeMode = options.mode ?? "dev";
	const port = options.port ?? (mode === "dev" ? Number(process.env.DEV_PORT) || DEFAULT_PORT : DEFAULT_PORT);
	const open = options.open ?? !process.env.NO_OPEN;
	const openPath = options.openPath ?? "/";
	const packageManager = options.packageManager ?? "pnpm";
	const cwd = options.cwd ?? process.cwd();
	const isReady = options.readyWhen ?? ((output: string) => isServerReady(mode, output));
	const normalizedPath = openPath.startsWith("/") ? openPath : `/${openPath}`;

	return {
		mode,
		port,
		open,
		openPath,
		packageManager,
		cwd,
		args: ["rspress", mode, "--port", String(port)],
		url: `http://localhost:${port}${normalizedPath}`,
		isReady,
	};
}

/* v8 ignore start -- spawns child processes / opens a browser; covered by the site smoke test, not unit tests */

/**
 * Best-effort kill of any process listening on `port` (frees a stale dev/preview
 * server). Invokes `lsof` directly via `execFileSync` (no shell), so the port is
 * never interpolated into a shell string. A no-op on platforms without `lsof`
 * (e.g. Windows) or for a non-positive-integer port.
 */
function killProcessOnPort(port: number): void {
	if (!Number.isInteger(port) || port <= 0) {
		return;
	}
	try {
		const result = execFileSync("lsof", ["-t", "-i", `:${port}`], { encoding: "utf-8" });
		const pids = result.trim().split("\n").filter(Boolean);
		for (const pid of pids) {
			process.kill(Number(pid), "SIGTERM");
		}
		if (pids.length > 0) {
			console.log(`Killed process(es) on port ${port}: ${pids.join(", ")}`);
		}
	} catch {
		// No process on the port, or lsof is unavailable — best-effort.
	}
}

/**
 * Run an RSPress `dev` or `preview` server, freeing the port first and opening a
 * browser once the server is ready. A drop-in replacement for the per-site
 * `dev.mts` / `preview.mts` scripts:
 *
 * ```ts
 * import { serve } from "rspress-plugin-api-extractor";
 *
 * await serve({ mode: "dev", openPath: "/api/" });
 * ```
 *
 * This runs the server for the lifetime of the host process and calls
 * `process.exit` when the server exits (matching a top-level script runner). The
 * returned promise resolves once the server is ready and the browser has been
 * opened; it does not resolve when the server stops. Port-freeing and browser
 * opening are best-effort and never reject.
 *
 * @param options - optional serve options; all fields have sensible defaults
 * @returns a promise that resolves once the server is ready and the browser has been opened
 * @public
 */
export async function serve(options: ServeOptions = {}): Promise<void> {
	const config = resolveServeConfig(options);

	killProcessOnPort(config.port);

	const child = spawn(config.packageManager, config.args, {
		cwd: config.cwd,
		stdio: ["inherit", "pipe", "pipe"],
		env: { ...process.env, FORCE_COLOR: "1" },
	});

	const waitForReady = new Promise<void>((resolve) => {
		let resolved = false;
		const handleOutput = (data: Buffer): void => {
			const output = data.toString();
			process.stdout.write(data);
			if (!resolved && config.isReady(output)) {
				resolved = true;
				resolve();
			}
		};
		child.stdout?.on("data", handleOutput);
		child.stderr?.on("data", handleOutput);
	});

	child.on("error", (error) => {
		console.error(`Failed to start rspress ${config.mode} server:`, error);
		process.exit(1);
	});

	child.on("exit", (code) => {
		console.log(`Rspress ${config.mode} server exited`);
		process.exit(code ?? 0);
	});

	await waitForReady;

	if (config.open) {
		try {
			const { default: open } = await import("open");
			await open(config.url);
			console.log(`✅ Opened ${config.url}`);
		} catch (error) {
			console.error("Failed to open browser:", error);
		}
	}
}

/* v8 ignore stop */
