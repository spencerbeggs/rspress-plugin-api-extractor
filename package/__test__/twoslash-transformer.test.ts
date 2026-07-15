import { describe, expect, it } from "vitest";
import { PluginEvent } from "../src/observability/events.js";
import { TwoslashManager, setEventEmitter } from "../src/twoslash-transformer.js";

describe("twoslash error events", () => {
	it("emits TwoslashDiagnostic + TwoslashCheckFailed via the injected emitter", () => {
		const seen: PluginEvent[] = [];
		setEventEmitter((e) => seen.push(e));
		TwoslashManager.getInstance().handleTwoslashErrorForTest(
			new Error("TS2353: Object literal may only specify known properties"),
			"Plugin({ console: {} })",
			"kitchensink/api/class/plugin.md",
		);
		const tags = seen.map((e) => e._tag);
		expect(tags).toContain("TwoslashDiagnostic");
		expect(tags).toContain("TwoslashCheckFailed");

		const diag = seen.find(PluginEvent.$is("TwoslashDiagnostic"));
		expect(diag?.code).toBe(2353); // verifies the /TS(\d+)/ parse

		const failed = seen.find(PluginEvent.$is("TwoslashCheckFailed"));
		expect(Array.isArray(failed?.fsMapKeys)).toBe(true); // snapshot field reaches the payload
	});
});
