/**
 * Regenerates the `example-module` fixture's `generated.d.ts` from its
 * `.api.json` model, so the declaration-reconstruction tests compare against
 * current `ApiExtractedPackage` output.
 *
 * Run ad hoc after changing declaration generation:
 *
 * ```bash
 * pnpm exec tsx package/__test__/scripts/regenerate-declarations.ts
 * ```
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { ApiExtractedPackage } from "../../src/api-extracted-package.js";

const FIXTURES_DIR = path.join(import.meta.dirname, "..", "__fixtures__", "example-module");
const API_MODEL_PATH = path.join(FIXTURES_DIR, "example-module.api.json");
const OUT_PATH = path.join(FIXTURES_DIR, "generated.d.ts");

const vp = ApiExtractedPackage.fromApiModel(API_MODEL_PATH);
const output = vp.generateDeclarations();
fs.writeFileSync(OUT_PATH, output, "utf-8");
console.log(`Wrote ${output.length} bytes to ${OUT_PATH}`);
