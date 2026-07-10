import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isServerReady, resolveServeConfig } from "../src/serve.js";

describe("isServerReady", () => {
	// Real RSPress output samples (ANSI stripped):
	//   dev:     "  Local:    http://localhost:4201/"  +  "ready   built in 0.23 s"
	//   preview: "  Local:    http://localhost:4173/"  (no "built in" / "ready" line)
	it("treats the cross-mode 'Local:' address line as ready in both modes", () => {
		expect(isServerReady("dev", "  Local:    http://localhost:4201/")).toBe(true);
		expect(isServerReady("preview", "  Local:    http://localhost:4173/")).toBe(true);
	});

	it("treats the dev 'ready ... built in' line as ready (fallback)", () => {
		expect(isServerReady("dev", "ready   built in 0.23 s")).toBe(true);
	});

	it("does not treat pre-listening output as ready", () => {
		expect(isServerReady("dev", "compiling...")).toBe(false);
		expect(isServerReady("preview", "Network:  use --host to expose")).toBe(false);
	});

	it("does not apply the 'built in' fallback to preview mode", () => {
		expect(isServerReady("preview", "ready   built in 0.23 s")).toBe(false);
	});
});

describe("resolveServeConfig", () => {
	let savedDevPort: string | undefined;
	let savedNoOpen: string | undefined;
	beforeEach(() => {
		savedDevPort = process.env.DEV_PORT;
		savedNoOpen = process.env.NO_OPEN;
		delete process.env.DEV_PORT;
		delete process.env.NO_OPEN;
	});
	afterEach(() => {
		if (savedDevPort === undefined) delete process.env.DEV_PORT;
		else process.env.DEV_PORT = savedDevPort;
		if (savedNoOpen === undefined) delete process.env.NO_OPEN;
		else process.env.NO_OPEN = savedNoOpen;
	});

	it("defaults to dev mode on port 4173 opening the root", () => {
		const config = resolveServeConfig();
		expect(config.mode).toBe("dev");
		expect(config.port).toBe(4173);
		expect(config.open).toBe(true);
		expect(config.openPath).toBe("/");
		expect(config.packageManager).toBe("pnpm");
		expect(config.args).toEqual(["rspress", "dev", "--port", "4173"]);
		expect(config.url).toBe("http://localhost:4173/");
	});

	it("builds preview args and uses the preview readiness signal", () => {
		const config = resolveServeConfig({ mode: "preview" });
		expect(config.args).toEqual(["rspress", "preview", "--port", "4173"]);
		expect(config.isReady("  Local:    http://localhost:4173/")).toBe(true);
		expect(config.isReady("ready   built in 1.2s")).toBe(false);
	});

	it("reads DEV_PORT in dev mode but not in preview mode", () => {
		process.env.DEV_PORT = "5000";
		expect(resolveServeConfig({ mode: "dev" }).port).toBe(5000);
		expect(resolveServeConfig({ mode: "preview" }).port).toBe(4173);
	});

	it("lets an explicit port win over DEV_PORT in either mode", () => {
		process.env.DEV_PORT = "5000";
		expect(resolveServeConfig({ mode: "dev", port: 8080 }).port).toBe(8080);
		expect(resolveServeConfig({ mode: "preview", port: 8080 }).port).toBe(8080);
	});

	it("disables browser opening when NO_OPEN is set", () => {
		process.env.NO_OPEN = "1";
		expect(resolveServeConfig().open).toBe(false);
	});

	it("lets an explicit open option win over NO_OPEN", () => {
		process.env.NO_OPEN = "1";
		expect(resolveServeConfig({ open: true }).open).toBe(true);
	});

	it("normalizes a leading slash into openPath and url", () => {
		const config = resolveServeConfig({ openPath: "api/" });
		expect(config.url).toBe("http://localhost:4173/api/");
	});

	it("uses a custom readyWhen predicate when provided", () => {
		const config = resolveServeConfig({ readyWhen: (out) => out.includes("LISTENING") });
		expect(config.isReady("LISTENING on 4173")).toBe(true);
		expect(config.isReady("ready — built in 1.2s")).toBe(false);
	});

	it("threads packageManager and cwd through", () => {
		const config = resolveServeConfig({ packageManager: "npm", cwd: "/tmp/site" });
		expect(config.packageManager).toBe("npm");
		expect(config.cwd).toBe("/tmp/site");
	});
});
