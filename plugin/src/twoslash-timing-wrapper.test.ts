import type { ShikiTransformer } from "shiki";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTwoslashTimingWrapper } from "./twoslash-timing-wrapper.js";

describe("createTwoslashTimingWrapper", () => {
	let mockTransformer: ShikiTransformer;
	let mockOnTiming: ReturnType<typeof vi.fn<(duration: number) => void>>;
	let performanceNowSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		mockOnTiming = vi.fn<(duration: number) => void>();
		performanceNowSpy = vi.spyOn(performance, "now");
		mockTransformer = {
			name: "mock-transformer",
		};
	});

	afterEach(() => {
		performanceNowSpy.mockRestore();
	});

	it("should create wrapped transformer with modified name", () => {
		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		expect(wrapped.name).toBe("mock-transformer-timing-wrapper");
	});

	it("should preserve all transformer properties", () => {
		mockTransformer.line = vi.fn();
		mockTransformer.code = vi.fn();

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		expect(wrapped.line).toBe(mockTransformer.line);
		expect(wrapped.code).toBe(mockTransformer.code);
	});

	it("should set preprocess to undefined when original has no preprocess", () => {
		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		expect(wrapped.preprocess).toBeUndefined();
	});

	it("should wrap preprocess and measure timing", () => {
		const preprocessFn = vi.fn((code: string) => code.toUpperCase());
		mockTransformer.preprocess = preprocessFn;

		performanceNowSpy.mockReturnValueOnce(100).mockReturnValueOnce(150);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		const result = wrapped.preprocess?.call({} as any, "test code", {} as any);

		expect(result).toBe("TEST CODE");
		expect(preprocessFn).toHaveBeenCalledWith("test code", {});
		expect(mockOnTiming).toHaveBeenCalledWith(50);
	});

	it("should handle preprocess that returns undefined", () => {
		const preprocessFn = vi.fn(() => undefined);
		mockTransformer.preprocess = preprocessFn;

		performanceNowSpy.mockReturnValueOnce(100).mockReturnValueOnce(110);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		const result = wrapped.preprocess?.call({} as any, "test code", {} as any);

		expect(result).toBeUndefined();
		expect(mockOnTiming).toHaveBeenCalledWith(10);
	});

	it("should handle preprocess that returns void (convert to undefined)", () => {
		const preprocessFn = vi.fn(() => {
			// Void function
		});
		mockTransformer.preprocess = preprocessFn as never;

		performanceNowSpy.mockReturnValueOnce(100).mockReturnValueOnce(105);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		const result = wrapped.preprocess?.call({} as any, "test code", {} as any);

		expect(result).toBeUndefined();
		expect(mockOnTiming).toHaveBeenCalledWith(5);
	});

	it("should preserve this context in wrapped preprocess", () => {
		let capturedThis: unknown;
		const preprocessFn = function (this: unknown, code: string): string {
			capturedThis = this;
			return code;
		};
		mockTransformer.preprocess = preprocessFn as never;

		performanceNowSpy.mockReturnValueOnce(100).mockReturnValueOnce(101);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		const context = { special: "context" } as any;
		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		wrapped.preprocess?.call(context, "test", {} as any);

		expect(capturedThis).toBe(context);
	});

	it("should measure timing for fast operations", () => {
		const preprocessFn = vi.fn((code: string) => code);
		mockTransformer.preprocess = preprocessFn;

		performanceNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1000.5);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		wrapped.preprocess?.call({} as any, "code", {} as any);

		expect(mockOnTiming).toHaveBeenCalledWith(0.5);
	});

	it("should measure timing for slow operations", () => {
		const preprocessFn = vi.fn((code: string) => code);
		mockTransformer.preprocess = preprocessFn;

		performanceNowSpy.mockReturnValueOnce(1000).mockReturnValueOnce(1500);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		wrapped.preprocess?.call({} as any, "code", {} as any);

		expect(mockOnTiming).toHaveBeenCalledWith(500);
	});

	it("should call onTiming after preprocess completes", () => {
		let preprocessCompleted = false;
		const preprocessFn = vi.fn(() => {
			preprocessCompleted = true;
			return "result";
		});
		mockTransformer.preprocess = preprocessFn;

		performanceNowSpy.mockReturnValueOnce(100).mockReturnValueOnce(200);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		wrapped.preprocess?.call({} as any, "code", {} as any);

		expect(preprocessCompleted).toBe(true);
		expect(mockOnTiming).toHaveBeenCalled();
	});

	it("should handle multiple calls to wrapped preprocess", () => {
		const preprocessFn = vi.fn((code: string) => code.toUpperCase());
		mockTransformer.preprocess = preprocessFn;

		performanceNowSpy
			.mockReturnValueOnce(100)
			.mockReturnValueOnce(110)
			.mockReturnValueOnce(200)
			.mockReturnValueOnce(215);

		const wrapped = createTwoslashTimingWrapper(mockTransformer, mockOnTiming);

		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		wrapped.preprocess?.call({} as any, "first", {} as any);
		// biome-ignore lint/suspicious/noExplicitAny: Test mock context
		wrapped.preprocess?.call({} as any, "second", {} as any);

		expect(mockOnTiming).toHaveBeenCalledTimes(2);
		expect(mockOnTiming).toHaveBeenNthCalledWith(1, 10);
		expect(mockOnTiming).toHaveBeenNthCalledWith(2, 15);
	});
});
