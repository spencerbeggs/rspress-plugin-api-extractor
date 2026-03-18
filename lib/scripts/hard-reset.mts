#!/usr/bin/env node
/**
 * Hard reset script for all build artifacts.
 * Cleans plugin, modules, and sites so a full rebuild from scratch is possible.
 * Run from root: pnpm reset
 */

import { readdirSync, rmSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

const rootDir = resolve(import.meta.dirname, "../..");
let removedCount = 0;

function remove(targetPath: string): void {
	try {
		rmSync(targetPath, { recursive: true, force: true });
		const rel = targetPath.replace(`${rootDir}/`, "");
		console.log(`  removed ${rel}`);
		removedCount++;
	} catch {
		// already gone
	}
}

function getDirs(parentDir: string): string[] {
	try {
		return readdirSync(parentDir).filter((entry) => {
			try {
				return statSync(join(parentDir, entry)).isDirectory();
			} catch {
				return false;
			}
		});
	} catch {
		return [];
	}
}

// --- Root turbo cache ---
console.log("\nCleaning root");
remove(join(rootDir, ".turbo"));

// --- Plugin ---
console.log("\nCleaning plugin/");
remove(join(rootDir, "plugin", "dist"));
remove(join(rootDir, "plugin", ".turbo"));

// --- Modules ---
const modulesDir = join(rootDir, "modules");
for (const mod of getDirs(modulesDir)) {
	const modDir = join(modulesDir, mod);
	console.log(`\nCleaning modules/${mod}/`);
	remove(join(modDir, "dist"));
	remove(join(modDir, ".turbo"));
}

// --- Sites ---
const sitesDir = join(rootDir, "sites");
for (const site of getDirs(sitesDir)) {
	const siteDir = join(sitesDir, site);
	console.log(`\nCleaning sites/${site}/`);

	// Snapshot DB files (db, shm, wal)
	for (const suffix of [".db", ".db-shm", ".db-wal"]) {
		remove(join(siteDir, `api-docs-snapshot${suffix}`));
	}

	// dist/ — RSPress build output
	remove(join(siteDir, "dist"));

	// Generated API docs: docs/api/ and docs/*/api/
	remove(join(siteDir, "docs", "api"));
	try {
		for (const entry of readdirSync(join(siteDir, "docs"))) {
			const apiDir = join(siteDir, "docs", entry, "api");
			try {
				if (statSync(apiDir).isDirectory()) {
					remove(apiDir);
				}
			} catch {
				// not a dir or doesn't exist
			}
		}
	} catch {
		// no docs dir
	}

	// lib/models/ contents — copied API Extractor models (preserve .gitkeep)
	try {
		const modelsDir = join(siteDir, "lib", "models");
		for (const entry of readdirSync(modelsDir)) {
			if (entry === ".gitkeep") continue;
			remove(join(modelsDir, entry));
		}
	} catch {
		// no models dir
	}

	// .turbo/ — turbo cache
	remove(join(siteDir, ".turbo"));
}

console.log(`\nDone. Removed ${removedCount} items.\n`);
