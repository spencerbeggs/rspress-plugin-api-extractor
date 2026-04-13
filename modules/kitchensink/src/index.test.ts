import { describe, expect, it } from "vitest";
import {
	BatchProcessor,
	CodecError,
	Codecs,
	DEFAULT_PIPELINE_OPTIONS,
	DataFormat,
	DataSource,
	DataSourceError,
	Filters,
	JsonSource,
	Pipeline,
	PipelineError,
	PipelineStatus,
	VERSION,
	ValidationError,
	createPipeline,
	decode,
	encode,
	validate,
} from "./index.js";
import { MockSource, TestPipeline, createMockData, createTestSink } from "./testing.js";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

describe("PipelineStatus", () => {
	it("has exactly 5 members", () => {
		const members = Object.values(PipelineStatus);
		expect(members).toHaveLength(5);
	});

	it("has the expected string values", () => {
		expect(PipelineStatus.Idle).toBe("idle");
		expect(PipelineStatus.Running).toBe("running");
		expect(PipelineStatus.Paused).toBe("paused");
		expect(PipelineStatus.Completed).toBe("completed");
		expect(PipelineStatus.Failed).toBe("failed");
	});
});

describe("DataFormat", () => {
	it("has exactly 4 members", () => {
		const members = Object.values(DataFormat);
		expect(members).toHaveLength(4);
	});

	it("has the expected string values", () => {
		expect(DataFormat.JSON).toBe("json");
		expect(DataFormat.CSV).toBe("csv");
		expect(DataFormat.Binary).toBe("binary");
		expect(DataFormat.MessagePack).toBe("msgpack");
	});
});

// ---------------------------------------------------------------------------
// Error classes
// ---------------------------------------------------------------------------

describe("PipelineError", () => {
	it("constructs with message and code", () => {
		const err = new PipelineError("something went wrong", "PIPE_001");
		expect(err.message).toBe("something went wrong");
		expect(err.code).toBe("PIPE_001");
	});

	it("is an instance of Error and PipelineError", () => {
		const err = new PipelineError("msg", "CODE");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(PipelineError);
	});

	it("sets this.name to PipelineError", () => {
		const err = new PipelineError("msg", "CODE");
		expect(err.name).toBe("PipelineError");
	});
});

describe("DataSourceError", () => {
	it("constructs with message and code", () => {
		const err = new DataSourceError("source failure", "SRC_001");
		expect(err.message).toBe("source failure");
		expect(err.code).toBe("SRC_001");
	});

	it("is an instance of Error and DataSourceError", () => {
		const err = new DataSourceError("msg", "CODE");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(DataSourceError);
	});

	it("sets this.name to DataSourceError", () => {
		const err = new DataSourceError("msg", "CODE");
		expect(err.name).toBe("DataSourceError");
	});
});

describe("CodecError", () => {
	it("constructs with message and code", () => {
		const err = new CodecError("encode failed", "ENC_001");
		expect(err.message).toBe("encode failed");
		expect(err.code).toBe("ENC_001");
	});

	it("is an instance of Error and CodecError", () => {
		const err = new CodecError("msg", "CODE");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(CodecError);
	});

	it("sets this.name to CodecError", () => {
		const err = new CodecError("msg", "CODE");
		expect(err.name).toBe("CodecError");
	});
});

describe("ValidationError", () => {
	it("constructs with message and code", () => {
		const err = new ValidationError("invalid data", "VAL_001");
		expect(err.message).toBe("invalid data");
		expect(err.code).toBe("VAL_001");
	});

	it("is an instance of Error and ValidationError", () => {
		const err = new ValidationError("msg", "CODE");
		expect(err).toBeInstanceOf(Error);
		expect(err).toBeInstanceOf(ValidationError);
	});

	it("sets this.name to ValidationError", () => {
		const err = new ValidationError("msg", "CODE");
		expect(err.name).toBe("ValidationError");
	});
});

// ---------------------------------------------------------------------------
// DataSource / JsonSource
// ---------------------------------------------------------------------------

describe("DataSource", () => {
	it("is abstract and can be subclassed", () => {
		class NumberSource extends DataSource<number> {
			readonly name = "NumberSource";
			async connect(): Promise<void> {}
			async fetch(): Promise<number[]> {
				return [1, 2, 3];
			}
		}

		const src = new NumberSource();
		expect(src).toBeInstanceOf(DataSource);
		expect(src.name).toBe("NumberSource");
	});

	it("has a no-op disconnect method by default", () => {
		class SimpleSource extends DataSource<string> {
			readonly name = "SimpleSource";
			async connect(): Promise<void> {}
			async fetch(): Promise<string[]> {
				return [];
			}
		}

		const src = new SimpleSource();
		expect(() => src.disconnect()).not.toThrow();
	});

	it("exposes DEFAULT_TIMEOUT as a static property", () => {
		expect(DataSource.DEFAULT_TIMEOUT).toBe(30_000);
	});
});

describe("JsonSource", () => {
	it("instantiates with a file path", () => {
		const source = new JsonSource("./data/records.json");
		expect(source).toBeInstanceOf(JsonSource);
		expect(source).toBeInstanceOf(DataSource);
		expect(source.name).toBe("JsonSource(./data/records.json)");
	});

	it("connect resolves without error", async () => {
		const source = new JsonSource("./data/records.json");
		await expect(source.connect()).resolves.toBeUndefined();
	});

	it("fetch returns [{ path, loaded: true }]", async () => {
		const path = "./data/records.json";
		const source = new JsonSource(path);
		const records = await source.fetch();
		expect(records).toEqual([{ path, loaded: true }]);
	});
});

// ---------------------------------------------------------------------------
// Pipeline
// ---------------------------------------------------------------------------

describe("Pipeline", () => {
	const makeSource = () => new MockSource("test", [1, 2, 3]);
	const double = (n: number) => n * 2;

	it("Pipeline.create returns a Pipeline instance", () => {
		const pipeline = Pipeline.create(makeSource(), double);
		expect(pipeline).toBeInstanceOf(Pipeline);
	});

	it("status getter returns PipelineStatus.Idle initially", () => {
		const pipeline = Pipeline.create(makeSource(), double);
		expect(pipeline.status).toBe(PipelineStatus.Idle);
	});

	it("batchSize getter returns the default 100", () => {
		const pipeline = Pipeline.create(makeSource(), double);
		expect(pipeline.batchSize).toBe(100);
	});

	it("batchSize setter updates the value", () => {
		const pipeline = Pipeline.create(makeSource(), double);
		pipeline.batchSize = 50;
		expect(pipeline.batchSize).toBe(50);
	});

	it("batchSize setter clamps values below 1 to 1", () => {
		const pipeline = Pipeline.create(makeSource(), double);
		pipeline.batchSize = 0;
		expect(pipeline.batchSize).toBe(1);
	});

	it("batchSize can be set via options at construction", () => {
		const pipeline = Pipeline.create(makeSource(), double, { batchSize: 25 });
		expect(pipeline.batchSize).toBe(25);
	});

	it("execute calls the transform and returns the result", async () => {
		const pipeline = Pipeline.create(makeSource(), double);
		const result = await pipeline.execute(5);
		expect(result).toBe(10);
	});

	it("execute transitions status to Completed", async () => {
		const pipeline = Pipeline.create(makeSource(), double);
		await pipeline.execute(1);
		expect(pipeline.status).toBe(PipelineStatus.Completed);
	});

	it("execute sets status to Failed and throws PipelineError on transform error", async () => {
		const throwing = (_: number): number => {
			throw new Error("transform failed");
		};
		const pipeline = Pipeline.create(makeSource(), throwing);
		await expect(pipeline.execute(1)).rejects.toBeInstanceOf(PipelineError);
		expect(pipeline.status).toBe(PipelineStatus.Failed);
	});

	it("process (deprecated) calls the transform synchronously", () => {
		const pipeline = Pipeline.create(makeSource(), double);
		const result = pipeline.process(7);
		expect(result).toBe(14);
	});

	it("parallel maps over inputs and returns results in order", async () => {
		const pipeline = Pipeline.create(makeSource(), double);
		const results = await pipeline.parallel([1, 2, 3]);
		expect(results).toEqual([2, 4, 6]);
	});
});

// ---------------------------------------------------------------------------
// BatchProcessor
// ---------------------------------------------------------------------------

describe("BatchProcessor", () => {
	it("processBatch iterates items through the pipeline", async () => {
		const source = new MockSource("nums", [1, 2, 3]);
		const pipeline = Pipeline.create(source, (n: number) => n + 10);
		const processor = new BatchProcessor(pipeline, { batchSize: 5 });
		const results = await processor.processBatch([1, 2, 3]);
		expect(results).toEqual([11, 12, 13]);
	});

	it("applies batchSize from options to the pipeline", () => {
		const source = new MockSource("nums", [1]);
		const pipeline = Pipeline.create(source, (n: number) => n);
		const processor = new BatchProcessor(pipeline, { batchSize: 42 });
		// BatchProcessor forwards batchSize to the pipeline
		expect(pipeline.batchSize).toBe(42);
		// processor itself is created without error
		expect(processor).toBeInstanceOf(BatchProcessor);
	});

	it("processBatch with an empty array returns an empty array", async () => {
		const source = new MockSource("empty", []);
		const pipeline = Pipeline.create(source, (n: number) => n);
		const processor = new BatchProcessor(pipeline, { batchSize: 10 });
		const results = await processor.processBatch([]);
		expect(results).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Codecs
// ---------------------------------------------------------------------------

describe("Codecs", () => {
	it("Codecs.json returns a JSON string", () => {
		const data = { key: "value", num: 42 };
		const result = Codecs.json(data);
		expect(result).toBe(JSON.stringify(data));
		expect(typeof result).toBe("string");
	});

	it("Codecs.binary returns a Uint8Array", () => {
		const data = { key: "value" };
		const result = Codecs.binary(data);
		expect(result).toBeInstanceOf(Uint8Array);
	});

	it("Codecs.binary encodes the JSON of the data", () => {
		const data = { foo: "bar" };
		const result = Codecs.binary(data);
		const decoded = new TextDecoder().decode(result);
		expect(decoded).toBe(JSON.stringify(data));
	});

	it("Codecs.streaming yields one chunk per record", async () => {
		const source = new MockSource("stream", [{ a: 1 }, { b: 2 }]);
		const chunks: Uint8Array[] = [];
		for await (const chunk of Codecs.streaming(source)) {
			chunks.push(chunk);
		}
		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toBeInstanceOf(Uint8Array);
	});
});

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

describe("Filters", () => {
	it("Filters.where filters by predicate", () => {
		const onlyEven = Filters.where<number>((n) => n % 2 === 0);
		expect(onlyEven([1, 2, 3, 4, 5])).toEqual([2, 4]);
	});

	it("Filters.where returns empty array when nothing matches", () => {
		const noneMatch = Filters.where<number>((n) => n > 100);
		expect(noneMatch([1, 2, 3])).toEqual([]);
	});

	it("Filters.take takes the first N items", () => {
		const takeThree = Filters.take<number>(3);
		expect(takeThree([10, 20, 30, 40, 50])).toEqual([10, 20, 30]);
	});

	it("Filters.take returns the full array when count exceeds length", () => {
		const takeTen = Filters.take<number>(10);
		expect(takeTen([1, 2])).toEqual([1, 2]);
	});

	it("Filters.take returns empty array for count of 0", () => {
		const takeNone = Filters.take<number>(0);
		expect(takeNone([1, 2, 3])).toEqual([]);
	});
});

// ---------------------------------------------------------------------------
// Standalone functions
// ---------------------------------------------------------------------------

describe("createPipeline", () => {
	it("returns a Pipeline instance", () => {
		const source = new MockSource("src", [1, 2]);
		const pipeline = createPipeline(source, (n: number) => n * 3);
		expect(pipeline).toBeInstanceOf(Pipeline);
	});

	it("the returned pipeline executes the transform", async () => {
		const source = new MockSource("src", [1]);
		const pipeline = createPipeline(source, (n: number) => n + 100);
		const result = await pipeline.execute(5);
		expect(result).toBe(105);
	});
});

describe("encode / decode roundtrip", () => {
	it("encodes with DataFormat.JSON and decodes back to original", () => {
		const original = { hello: "world", count: 7 };
		const buffer = encode(original, DataFormat.JSON);
		expect(buffer).toBeInstanceOf(Uint8Array);
		const decoded = decode<typeof original>(buffer, DataFormat.JSON);
		expect(decoded).toEqual(original);
	});

	it("encode with DataFormat.Binary returns a Uint8Array", () => {
		const buffer = encode({ x: 1 }, DataFormat.Binary);
		expect(buffer).toBeInstanceOf(Uint8Array);
	});

	it("encode throws CodecError for unsupported formats", () => {
		expect(() => encode("data", DataFormat.CSV)).toThrow(CodecError);
	});

	it("decode throws CodecError for unsupported formats", () => {
		const buffer = new TextEncoder().encode("[]");
		expect(() => decode(buffer, DataFormat.Binary)).toThrow(CodecError);
	});
});

describe("validate", () => {
	it("returns the typed value when the schema passes", () => {
		interface Config {
			host: string;
			port: number;
		}
		const parseConfig = (data: unknown): Config => {
			if (typeof data !== "object" || data === null || !("host" in data) || !("port" in data)) {
				throw new Error("Invalid config");
			}
			return data as Config;
		};

		const result = validate({ host: "localhost", port: 8080 }, parseConfig);
		expect(result).toEqual({ host: "localhost", port: 8080 });
	});

	it("throws ValidationError when the schema throws", () => {
		const alwaysFails = (_: unknown): never => {
			throw new Error("bad data");
		};

		expect(() => validate({ anything: true }, alwaysFails)).toThrow(ValidationError);
	});

	it("wraps non-Error throws from the schema in ValidationError", () => {
		const throwsString = (_: unknown): never => {
			throw "raw string error";
		};

		let caught: unknown;
		try {
			validate({}, throwsString);
		} catch (e) {
			caught = e;
		}
		expect(caught).toBeInstanceOf(ValidationError);
		expect((caught as ValidationError).message).toContain("raw string error");
	});
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

describe("VERSION", () => {
	it("is the string '1.0.0'", () => {
		expect(VERSION).toBe("1.0.0");
		expect(typeof VERSION).toBe("string");
	});
});

describe("DEFAULT_PIPELINE_OPTIONS", () => {
	it("has batchSize of 100", () => {
		expect(DEFAULT_PIPELINE_OPTIONS.batchSize).toBe(100);
	});

	it("has retryCount of 3", () => {
		expect(DEFAULT_PIPELINE_OPTIONS.retryCount).toBe(3);
	});

	it("has timeout of 30000", () => {
		expect(DEFAULT_PIPELINE_OPTIONS.timeout).toBe(30_000);
	});
});

// ---------------------------------------------------------------------------
// Testing utilities
// ---------------------------------------------------------------------------

describe("MockSource", () => {
	it("instantiates with name and data", () => {
		const source = new MockSource("users", [{ id: 1 }]);
		expect(source).toBeInstanceOf(MockSource);
		expect(source).toBeInstanceOf(DataSource);
		expect(source.name).toBe("users");
	});

	it("connect resolves without error", async () => {
		const source = new MockSource("src", []);
		await expect(source.connect()).resolves.toBeUndefined();
	});

	it("fetch returns the data provided at construction", async () => {
		const data = [
			{ id: 1, name: "Alice" },
			{ id: 2, name: "Bob" },
		];
		const source = new MockSource("users", data);
		const records = await source.fetch();
		expect(records).toEqual(data);
	});

	it("fetch returns a shallow copy (not the original reference)", async () => {
		const data = [{ id: 1 }];
		const source = new MockSource("src", data);
		const records = await source.fetch();
		expect(records).not.toBe(data);
		expect(records).toEqual(data);
	});
});

describe("TestPipeline", () => {
	it("extends Pipeline", () => {
		const source = new MockSource("nums", [1]);
		const tp = new TestPipeline(source, (n: number) => n * 2);
		expect(tp).toBeInstanceOf(Pipeline);
		expect(tp).toBeInstanceOf(TestPipeline);
	});

	it("executionLog is empty initially", () => {
		const source = new MockSource("nums", [1]);
		const tp = new TestPipeline(source, (n: number) => n);
		expect(tp.executionLog).toEqual([]);
	});

	it("execute appends to executionLog", async () => {
		const source = new MockSource("nums", [1]);
		const tp = new TestPipeline(source, (n: number) => n * 10);
		await tp.execute(3);
		expect(tp.executionLog).toEqual([{ input: 3, output: 30 }]);
	});

	it("execute captures multiple calls in order", async () => {
		const source = new MockSource("nums", [1]);
		const tp = new TestPipeline(source, (n: number) => n + 1);
		await tp.execute(10);
		await tp.execute(20);
		expect(tp.executionLog).toEqual([
			{ input: 10, output: 11 },
			{ input: 20, output: 21 },
		]);
	});

	it("execute still calls super and returns the transformed value", async () => {
		const source = new MockSource("nums", [1]);
		const tp = new TestPipeline(source, (n: number) => n * 3);
		const result = await tp.execute(5);
		expect(result).toBe(15);
	});
});

describe("createMockData", () => {
	it("createMockData(count) returns count empty objects", () => {
		const items = createMockData(3);
		expect(items).toHaveLength(3);
		expect(items[0]).toEqual({});
	});

	it("createMockData(count, template) returns count copies of template", () => {
		const template = { id: 0, active: true };
		const items = createMockData(3, template);
		expect(items).toHaveLength(3);
		expect(items[0]).toEqual(template);
		expect(items[1]).toEqual(template);
		expect(items[2]).toEqual(template);
	});

	it("createMockData(0) returns an empty array", () => {
		expect(createMockData(0)).toEqual([]);
	});

	it("copies from template are shallow copies, not the same reference", () => {
		const template = { value: 1 };
		const items = createMockData(2, template);
		expect(items[0]).not.toBe(template);
		expect(items[1]).not.toBe(items[0]);
	});
});

describe("createTestSink", () => {
	it("returns a DataSink with a captured array", () => {
		const sink = createTestSink<number>();
		expect(sink.name).toBe("TestSink");
		expect(sink.captured).toEqual([]);
	});

	it("write appends data to captured", async () => {
		const sink = createTestSink<string>();
		await sink.write("hello");
		await sink.write("world");
		expect(sink.captured).toEqual(["hello", "world"]);
	});

	it("close resolves without error", async () => {
		const sink = createTestSink<number>();
		await expect(sink.close()).resolves.toBeUndefined();
	});
});
