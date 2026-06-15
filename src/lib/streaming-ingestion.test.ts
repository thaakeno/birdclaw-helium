import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { runEffectPromise } from "./effect-runtime";
import {
	ingestStreamInBatchesEffect,
	streamAssignedJsonArray,
} from "./streaming-ingestion";

async function collect<T>(source: AsyncIterable<T>) {
	const values: T[] = [];
	for await (const value of source) values.push(value);
	return values;
}

describe("streaming ingestion", () => {
	it("parses assigned JSON arrays across chunk boundaries", async () => {
		const source = Readable.from([
			'window.YTD.tweets.part0 = [{"tweet":{"id":"1",',
			'"text":"comma, bracket ]"}},',
			'{"tweet":{"id":"2","text":"escaped \\"quote\\""}}];',
		]);

		await expect(collect(streamAssignedJsonArray(source))).resolves.toEqual([
			{ tweet: { id: "1", text: "comma, bracket ]" } },
			{ tweet: { id: "2", text: 'escaped "quote"' } },
		]);
	});

	it("batches records and resumes after a checkpoint", async () => {
		const processBatch = vi.fn();
		const checkpoints: number[] = [];
		const result = await runEffectPromise(
			ingestStreamInBatchesEffect({
				batchSize: 2,
				resumeAfter: 2,
				source: async function* () {
					for (const value of [1, 2, 3, 4, 5]) yield value;
				},
				processBatch,
				onCheckpoint: ({ processed }) => {
					checkpoints.push(processed);
				},
			}),
		);

		expect(processBatch).toHaveBeenNthCalledWith(1, [3, 4], { processed: 4 });
		expect(processBatch).toHaveBeenNthCalledWith(2, [5], { processed: 5 });
		expect(checkpoints).toEqual([4, 5]);
		expect(result).toEqual({ processed: 5 });
	});
});
