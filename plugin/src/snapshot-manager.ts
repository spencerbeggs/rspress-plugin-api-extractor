import { createHash } from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import Database from "better-sqlite3";
import matter from "gray-matter";

/**
 * Represents a single file snapshot with timestamp and content hashes.
 *
 * File snapshots track the state of generated documentation files across builds,
 * enabling intelligent timestamp management for Open Graph `article:published_time`
 * and `article:modified_time` meta tags.
 *
 * @remarks
 * The snapshot system uses content and frontmatter hashing to detect changes:
 * - **New files**: Both `publishedTime` and `modifiedTime` are set to the build time
 * - **Unchanged files**: Both timestamps are preserved from the previous build
 * - **Modified files**: `publishedTime` is preserved, `modifiedTime` is updated
 */
export interface FileSnapshot {
	/**
	 * Output directory path where the file is generated.
	 *
	 * @example "docs/en/my-api/api"
	 */
	outputDir: string;

	/**
	 * Relative path from `outputDir` to the file.
	 *
	 * @example "classes/MyClass.mdx"
	 */
	filePath: string;

	/**
	 * ISO 8601 timestamp when the file was first created.
	 * Used for `article:published_time` Open Graph meta tag.
	 *
	 * @example "2024-01-15T10:30:00.000Z"
	 */
	publishedTime: string;

	/**
	 * ISO 8601 timestamp when the file was last modified.
	 * Used for `article:modified_time` Open Graph meta tag.
	 *
	 * @example "2024-01-20T15:45:00.000Z"
	 */
	modifiedTime: string;

	/**
	 * SHA-256 hash of the normalized markdown content (excluding frontmatter).
	 * Used to detect content changes between builds.
	 */
	contentHash: string;

	/**
	 * SHA-256 hash of non-timestamp frontmatter fields.
	 * Excludes `publishedTime`, `modifiedTime`, and `head` array to avoid
	 * circular dependencies in change detection.
	 */
	frontmatterHash: string;

	/**
	 * ISO 8601 timestamp when this snapshot record was last updated.
	 * Tracks when the database entry was modified, not the file content.
	 */
	buildTime: string;
}

/**
 * Manages file snapshots using SQLite for timestamp tracking and change detection.
 *
 * The `SnapshotManager` provides persistent storage for tracking generated
 * documentation files across multiple builds. It enables intelligent timestamp
 * management for Open Graph meta tags by detecting which files have changed
 * between builds.
 *
 * @remarks
 * The manager uses SQLite with WAL (Write-Ahead Logging) mode for better
 * concurrency during parallel builds. The database schema supports multiple
 * output directories, making it suitable for multi-API and versioned documentation.
 *
 * **Timestamp Management Strategy:**
 * - New files get both `publishedTime` and `modifiedTime` set to the build time
 * - Unchanged files preserve their existing timestamps
 * - Modified files preserve `publishedTime` but update `modifiedTime`
 *
 * @example Basic usage
 * ```typescript
 * const manager = new SnapshotManager("./api-docs-snapshot.db");
 *
 * // Get existing snapshots for comparison
 * const existing = manager.getSnapshotsForOutputDir("/docs/api");
 *
 * // Upsert new snapshot after generating a file
 * manager.upsertSnapshot({
 *   outputDir: "/docs/api",
 *   filePath: "classes/MyClass.mdx",
 *   publishedTime: "2024-01-15T10:00:00Z",
 *   modifiedTime: "2024-01-20T15:30:00Z",
 *   contentHash: SnapshotManager.hashContent(bodyContent),
 *   frontmatterHash: SnapshotManager.hashFrontmatter(frontmatter),
 *   buildTime: new Date().toISOString()
 * });
 *
 * // Clean up stale files after build
 * const stale = manager.cleanupStaleFiles("/docs/api", generatedFiles);
 *
 * // Close connection when done
 * manager.close();
 * ```
 */
export class SnapshotManager {
	private db: Database.Database;
	private cleanupHandlers: {
		sigint: (() => void) | null;
		sigterm: (() => void) | null;
		uncaughtException: ((err: Error) => void) | null;
	} = { sigint: null, sigterm: null, uncaughtException: null };

	/**
	 * Creates a new SnapshotManager and initializes the SQLite database.
	 *
	 * @param dbPath - Path to the SQLite database file. The file and any
	 *   necessary parent directories will be created if they don't exist.
	 *
	 * @example
	 * ```typescript
	 * const manager = new SnapshotManager("./api-docs-snapshot.db");
	 * ```
	 */
	constructor(dbPath: string) {
		// Ensure directory exists
		const dir = path.dirname(dbPath);
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir, { recursive: true });
		}

		// Open database connection
		this.db = new Database(dbPath);

		// Enable WAL mode for better concurrency
		this.db.pragma("journal_mode = WAL");

		// Clean up any leftover WAL files from previous crashes
		// This merges uncommitted transactions and removes -shm/-wal files
		this.db.pragma("wal_checkpoint(TRUNCATE)");

		// Create tables
		this.createTables();

		// Register cleanup handlers for graceful shutdown
		this.registerCleanupHandlers();
	}

	/**
	 * Registers signal handlers for graceful database cleanup on process termination.
	 * Handles SIGINT (Ctrl+C) and SIGTERM to ensure WAL files are properly cleaned up.
	 */
	private registerCleanupHandlers(): void {
		const cleanup = (): void => {
			try {
				if (this.db.open) {
					// Remove handlers before closing to prevent re-entry
					this.removeCleanupHandlers();
					this.db.pragma("wal_checkpoint(TRUNCATE)");
					this.db.close();
				}
			} catch {
				// Ignore errors during cleanup - process is terminating anyway
			}
		};

		// Store handlers so they can be removed later
		this.cleanupHandlers.sigint = (): void => {
			cleanup();
			process.exit(130); // Standard exit code for SIGINT
		};

		this.cleanupHandlers.sigterm = (): void => {
			cleanup();
			process.exit(143); // Standard exit code for SIGTERM
		};

		this.cleanupHandlers.uncaughtException = (err: Error): void => {
			console.error("Uncaught exception:", err);
			cleanup();
			process.exit(1);
		};

		// Register handlers
		process.once("SIGINT", this.cleanupHandlers.sigint);
		process.once("SIGTERM", this.cleanupHandlers.sigterm);
		process.once("uncaughtException", this.cleanupHandlers.uncaughtException);
	}

	/**
	 * Removes the signal handlers registered for cleanup.
	 * Called when the database is closed normally.
	 */
	private removeCleanupHandlers(): void {
		if (this.cleanupHandlers.sigint) {
			process.removeListener("SIGINT", this.cleanupHandlers.sigint);
			this.cleanupHandlers.sigint = null;
		}
		if (this.cleanupHandlers.sigterm) {
			process.removeListener("SIGTERM", this.cleanupHandlers.sigterm);
			this.cleanupHandlers.sigterm = null;
		}
		if (this.cleanupHandlers.uncaughtException) {
			process.removeListener("uncaughtException", this.cleanupHandlers.uncaughtException);
			this.cleanupHandlers.uncaughtException = null;
		}
	}

	/**
	 * Creates the database schema if it doesn't exist.
	 *
	 * @remarks
	 * The schema includes:
	 * - `file_snapshots` table with composite unique constraint on (output_dir, file_path)
	 * - Indexes on `output_dir` and `file_path` for efficient queries
	 */
	private createTables(): void {
		this.db.exec(`
			CREATE TABLE IF NOT EXISTS file_snapshots (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				output_dir TEXT NOT NULL,
				file_path TEXT NOT NULL,
				published_time TEXT NOT NULL,
				modified_time TEXT NOT NULL,
				content_hash TEXT NOT NULL,
				frontmatter_hash TEXT NOT NULL,
				build_time TEXT NOT NULL,
				UNIQUE(output_dir, file_path)
			);

			CREATE INDEX IF NOT EXISTS idx_output_dir ON file_snapshots(output_dir);
			CREATE INDEX IF NOT EXISTS idx_file_path ON file_snapshots(file_path);
		`);
	}

	/**
	 * Retrieves all file snapshots for a specific output directory.
	 *
	 * @param outputDir - The output directory path to query
	 * @returns Array of file snapshots for the specified directory
	 *
	 * @example
	 * ```typescript
	 * const snapshots = manager.getSnapshotsForOutputDir("/docs/en/my-api/api");
	 * const snapshotMap = new Map(snapshots.map(s => [s.filePath, s]));
	 * ```
	 */
	public getSnapshotsForOutputDir(outputDir: string): FileSnapshot[] {
		const stmt = this.db.prepare(`
			SELECT output_dir, file_path, published_time, modified_time,
			       content_hash, frontmatter_hash, build_time
			FROM file_snapshots
			WHERE output_dir = ?
		`);

		const rows = stmt.all(outputDir) as Array<{
			output_dir: string;
			file_path: string;
			published_time: string;
			modified_time: string;
			content_hash: string;
			frontmatter_hash: string;
			build_time: string;
		}>;

		return rows.map((row) => ({
			outputDir: row.output_dir,
			filePath: row.file_path,
			publishedTime: row.published_time,
			modifiedTime: row.modified_time,
			contentHash: row.content_hash,
			frontmatterHash: row.frontmatter_hash,
			buildTime: row.build_time,
		}));
	}

	/**
	 * Retrieves a single file snapshot by output directory and file path.
	 *
	 * @param outputDir - The output directory path
	 * @param filePath - The relative file path within the output directory
	 * @returns The file snapshot if found, or `null` if not found
	 *
	 * @example
	 * ```typescript
	 * const snapshot = manager.getSnapshot("/docs/api", "classes/MyClass.mdx");
	 * if (snapshot) {
	 *   console.log(`Last modified: ${snapshot.modifiedTime}`);
	 * }
	 * ```
	 */
	public getSnapshot(outputDir: string, filePath: string): FileSnapshot | null {
		const stmt = this.db.prepare(`
			SELECT output_dir, file_path, published_time, modified_time,
			       content_hash, frontmatter_hash, build_time
			FROM file_snapshots
			WHERE output_dir = ? AND file_path = ?
		`);

		const row = stmt.get(outputDir, filePath) as
			| {
					output_dir: string;
					file_path: string;
					published_time: string;
					modified_time: string;
					content_hash: string;
					frontmatter_hash: string;
					build_time: string;
			  }
			| undefined;

		if (!row) {
			return null;
		}

		return {
			outputDir: row.output_dir,
			filePath: row.file_path,
			publishedTime: row.published_time,
			modifiedTime: row.modified_time,
			contentHash: row.content_hash,
			frontmatterHash: row.frontmatter_hash,
			buildTime: row.build_time,
		};
	}

	/**
	 * Inserts a new snapshot or updates an existing one.
	 *
	 * Only updates the database if the snapshot data has actually changed.
	 * This prevents unnecessary database modifications and growth when all
	 * files are unchanged between builds.
	 *
	 * @param snapshot - The file snapshot to insert or update
	 * @returns `true` if the database was modified, `false` if unchanged
	 *
	 * @example
	 * ```typescript
	 * const changed = manager.upsertSnapshot({
	 *   outputDir: "/docs/api",
	 *   filePath: "classes/MyClass.mdx",
	 *   publishedTime: "2024-01-15T10:00:00Z",
	 *   modifiedTime: new Date().toISOString(),
	 *   contentHash: SnapshotManager.hashContent(content),
	 *   frontmatterHash: SnapshotManager.hashFrontmatter(frontmatter),
	 *   buildTime: new Date().toISOString()
	 * });
	 * ```
	 */
	public upsertSnapshot(snapshot: FileSnapshot): boolean {
		// Check if snapshot exists and has changed
		const existing = this.getSnapshot(snapshot.outputDir, snapshot.filePath);

		// If no existing snapshot, insert new one
		if (!existing) {
			const stmt = this.db.prepare(`
				INSERT INTO file_snapshots (output_dir, file_path, published_time, modified_time,
				                            content_hash, frontmatter_hash, build_time)
				VALUES (?, ?, ?, ?, ?, ?, ?)
			`);

			stmt.run(
				snapshot.outputDir,
				snapshot.filePath,
				snapshot.publishedTime,
				snapshot.modifiedTime,
				snapshot.contentHash,
				snapshot.frontmatterHash,
				snapshot.buildTime,
			);
			return true;
		}

		// If snapshot exists but hasn't changed, skip update
		if (
			existing.publishedTime === snapshot.publishedTime &&
			existing.modifiedTime === snapshot.modifiedTime &&
			existing.contentHash === snapshot.contentHash &&
			existing.frontmatterHash === snapshot.frontmatterHash
		) {
			return false; // No changes, database not modified
		}

		// Snapshot has changed, update it
		const stmt = this.db.prepare(`
			UPDATE file_snapshots
			SET published_time = ?,
			    modified_time = ?,
			    content_hash = ?,
			    frontmatter_hash = ?,
			    build_time = ?
			WHERE output_dir = ? AND file_path = ?
		`);

		stmt.run(
			snapshot.publishedTime,
			snapshot.modifiedTime,
			snapshot.contentHash,
			snapshot.frontmatterHash,
			snapshot.buildTime,
			snapshot.outputDir,
			snapshot.filePath,
		);
		return true;
	}

	/**
	 * Batch upserts multiple file snapshots in a single transaction.
	 *
	 * This method is significantly faster than calling `upsertSnapshot` repeatedly
	 * because it uses a single SQLite transaction for all operations. Use this
	 * when updating many files at once (e.g., after parallel page generation).
	 *
	 * @param snapshots - Array of file snapshots to upsert
	 * @returns Number of snapshots that were actually modified (inserted or updated)
	 *
	 * @example
	 * ```typescript
	 * const snapshots = [
	 *   { outputDir: "/docs/api", filePath: "class/Foo.mdx", ... },
	 *   { outputDir: "/docs/api", filePath: "class/Bar.mdx", ... },
	 * ];
	 * const modified = manager.batchUpsertSnapshots(snapshots);
	 * console.log(`Updated ${modified} of ${snapshots.length} snapshots`);
	 * ```
	 */
	public batchUpsertSnapshots(snapshots: FileSnapshot[]): number {
		if (snapshots.length === 0) {
			return 0;
		}

		// Use INSERT OR REPLACE for efficient upserts
		const stmt = this.db.prepare(`
			INSERT OR REPLACE INTO file_snapshots
			(output_dir, file_path, published_time, modified_time, content_hash, frontmatter_hash, build_time)
			VALUES (?, ?, ?, ?, ?, ?, ?)
		`);

		// Wrap in transaction for much better performance
		const batchInsert = this.db.transaction((items: FileSnapshot[]) => {
			let count = 0;
			for (const snapshot of items) {
				stmt.run(
					snapshot.outputDir,
					snapshot.filePath,
					snapshot.publishedTime,
					snapshot.modifiedTime,
					snapshot.contentHash,
					snapshot.frontmatterHash,
					snapshot.buildTime,
				);
				count++;
			}
			return count;
		});

		return batchInsert(snapshots);
	}

	/**
	 * Deletes a specific file snapshot from the database.
	 *
	 * @param outputDir - The output directory path
	 * @param filePath - The relative file path to delete
	 *
	 * @example
	 * ```typescript
	 * manager.deleteSnapshot("/docs/api", "classes/RemovedClass.mdx");
	 * ```
	 */
	public deleteSnapshot(outputDir: string, filePath: string): void {
		const stmt = this.db.prepare(`
			DELETE FROM file_snapshots
			WHERE output_dir = ? AND file_path = ?
		`);

		stmt.run(outputDir, filePath);
	}

	/**
	 * Removes stale file snapshots that weren't generated in the current build.
	 *
	 * This method compares the database records against the set of files
	 * generated in the current build and removes any records for files that
	 * no longer exist. This ensures the database stays in sync with the
	 * actual generated files.
	 *
	 * @param outputDir - The output directory to clean up
	 * @param currentFiles - Set of file paths generated in the current build
	 * @returns Array of file paths that were removed from the database
	 *
	 * @example
	 * ```typescript
	 * const generatedFiles = new Set(["classes/MyClass.mdx", "functions/myFunc.mdx"]);
	 * const staleFiles = manager.cleanupStaleFiles("/docs/api", generatedFiles);
	 *
	 * // Delete the actual stale files from disk
	 * for (const staleFile of staleFiles) {
	 *   fs.unlinkSync(path.join(outputDir, staleFile));
	 * }
	 * ```
	 */
	public cleanupStaleFiles(outputDir: string, currentFiles: Set<string>): string[] {
		const existingFiles = this.getFilePaths(outputDir);
		const staleFiles: string[] = [];

		for (const filePath of existingFiles) {
			if (!currentFiles.has(filePath)) {
				this.deleteSnapshot(outputDir, filePath);
				staleFiles.push(filePath);
			}
		}

		return staleFiles;
	}

	/**
	 * Gets all file paths stored for a specific output directory.
	 *
	 * @param outputDir - The output directory to query
	 * @returns Array of relative file paths
	 *
	 * @example
	 * ```typescript
	 * const files = manager.getFilePaths("/docs/api");
	 * console.log(`Tracking ${files.length} files`);
	 * ```
	 */
	public getFilePaths(outputDir: string): string[] {
		const stmt = this.db.prepare(`
			SELECT file_path
			FROM file_snapshots
			WHERE output_dir = ?
		`);

		const rows = stmt.all(outputDir) as Array<{ file_path: string }>;
		return rows.map((row) => row.file_path);
	}

	/**
	 * Closes the database connection and cleans up WAL files.
	 *
	 * Performs a WAL checkpoint before closing to ensure temporary
	 * `.db-shm` and `.db-wal` files are properly cleaned up. This
	 * prevents the database from growing unnecessarily when no changes
	 * are made between builds.
	 *
	 * @example
	 * ```typescript
	 * try {
	 *   // ... use manager
	 * } finally {
	 *   manager.close();
	 * }
	 * ```
	 */
	public close(): void {
		// Remove signal handlers to prevent memory leaks
		this.removeCleanupHandlers();

		// Checkpoint WAL to clean up temporary files
		// TRUNCATE mode removes the WAL file after checkpointing
		this.db.pragma("wal_checkpoint(TRUNCATE)");
		this.db.close();
	}

	/**
	 * Generates a SHA-256 hash of normalized markdown content.
	 *
	 * The content is normalized before hashing to ensure consistent results
	 * regardless of line ending differences or trailing whitespace.
	 *
	 * @param content - The markdown content to hash (excluding frontmatter)
	 * @returns Hexadecimal SHA-256 hash string
	 *
	 * @example
	 * ```typescript
	 * const hash = SnapshotManager.hashContent("# My Title\n\nContent here");
	 * ```
	 */
	public static hashContent(content: string): string {
		const normalized = SnapshotManager.normalizeContent(content);
		return createHash("sha256").update(normalized).digest("hex");
	}

	/**
	 * Generates a SHA-256 hash of frontmatter fields.
	 *
	 * Excludes timestamp-related fields (`publishedTime`, `modifiedTime`, `head`,
	 * `article:published_time`, `article:modified_time`) to prevent circular
	 * dependencies in change detection.
	 *
	 * @param frontmatter - The frontmatter object to hash
	 * @returns Hexadecimal SHA-256 hash string
	 *
	 * @remarks
	 * Keys are sorted alphabetically before hashing to ensure consistent
	 * results regardless of object key order.
	 *
	 * @example
	 * ```typescript
	 * const hash = SnapshotManager.hashFrontmatter({
	 *   title: "My Page",
	 *   description: "Page description"
	 * });
	 * ```
	 */
	public static hashFrontmatter(frontmatter: Record<string, unknown>): string {
		// Create a copy without timestamp fields and head array
		const filtered: Record<string, unknown> = {};

		for (const [key, value] of Object.entries(frontmatter)) {
			// Skip timestamp fields and head array (contains OG tags with timestamps)
			if (
				key === "publishedTime" ||
				key === "modifiedTime" ||
				key === "head" ||
				key === "article:published_time" ||
				key === "article:modified_time"
			) {
				continue;
			}
			filtered[key] = value;
		}

		// Sort keys for consistent hashing
		const sorted = Object.keys(filtered)
			.sort()
			.reduce(
				(acc, key) => {
					acc[key] = filtered[key];
					return acc;
				},
				{} as Record<string, unknown>,
			);

		const json = JSON.stringify(sorted);
		return createHash("sha256").update(json).digest("hex");
	}

	/**
	 * Normalizes content string for consistent hashing.
	 *
	 * Applies the following transformations:
	 * - Converts all line endings to Unix-style (`\n`)
	 * - Trims leading and trailing whitespace
	 * - Collapses multiple consecutive blank lines to a single blank line
	 *
	 * @param content - The content string to normalize
	 * @returns Normalized content string
	 *
	 * @example
	 * ```typescript
	 * const normalized = SnapshotManager.normalizeContent("line1\r\n\r\n\r\nline2  ");
	 * // Returns: "line1\n\nline2"
	 * ```
	 */
	public static normalizeContent(content: string): string {
		return (
			content
				// Normalize line endings to \n
				.replaceAll("\r\n", "\n")
				.replaceAll("\r", "\n")
				// Trim leading and trailing whitespace
				.trim()
				// Collapse multiple consecutive blank lines to single blank line
				.replaceAll(/\n{3,}/g, "\n\n")
		);
	}

	/**
	 * Parses an existing MDX file and extracts snapshot metadata.
	 *
	 * Useful for migration scenarios or debugging, this method reads an
	 * existing MDX file and extracts the timestamps from its frontmatter
	 * `head` array.
	 *
	 * @param filePath - Absolute path to the MDX file
	 * @returns Parsed snapshot data, or `null` if the file doesn't exist
	 *
	 * @remarks
	 * If timestamps are not found in the frontmatter, the current time is
	 * used as a fallback. The `outputDir` is set to the file's parent directory.
	 *
	 * @example
	 * ```typescript
	 * const snapshot = SnapshotManager.parseFile("/docs/api/classes/MyClass.mdx");
	 * if (snapshot) {
	 *   console.log(`Published: ${snapshot.publishedTime}`);
	 *   console.log(`Modified: ${snapshot.modifiedTime}`);
	 * }
	 * ```
	 */
	public static parseFile(filePath: string): FileSnapshot | null {
		if (!fs.existsSync(filePath)) {
			return null;
		}

		const content = fs.readFileSync(filePath, "utf-8");
		const parsed = matter(content);

		// Extract timestamps from frontmatter head array if present
		let publishedTime: string | undefined;
		let modifiedTime: string | undefined;

		if (Array.isArray(parsed.data.head)) {
			for (const entry of parsed.data.head) {
				if (Array.isArray(entry) && entry.length === 2) {
					const [tag, attrs] = entry;
					if (tag === "meta" && typeof attrs === "object" && attrs !== null) {
						const property = (attrs as Record<string, unknown>).property;
						const content = (attrs as Record<string, unknown>).content;

						if (property === "article:published_time" && typeof content === "string") {
							publishedTime = content;
						} else if (property === "article:modified_time" && typeof content === "string") {
							modifiedTime = content;
						}
					}
				}
			}
		}

		// Generate hashes
		const contentHash = SnapshotManager.hashContent(parsed.content);
		const frontmatterHash = SnapshotManager.hashFrontmatter(parsed.data);

		return {
			outputDir: path.dirname(filePath),
			filePath: path.basename(filePath),
			publishedTime: publishedTime || new Date().toISOString(),
			modifiedTime: modifiedTime || new Date().toISOString(),
			contentHash,
			frontmatterHash,
			buildTime: new Date().toISOString(),
		};
	}
}
