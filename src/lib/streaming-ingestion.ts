import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { Effect } from "effect";

export interface IngestionCheckpoint {
	processed: number;
}

export async function* streamJsonLines(
	filePath: string,
): AsyncGenerator<{ lineNumber: number; value: Record<string, unknown> }> {
	const input = createReadStream(filePath, { encoding: "utf8" });
	const lines = createInterface({ input, crlfDelay: Infinity });
	let lineNumber = 0;
	for await (const line of lines) {
		lineNumber += 1;
		if (!line.trim()) continue;
		yield {
			lineNumber,
			value: JSON.parse(line) as Record<string, unknown>,
		};
	}
}

export async function* streamAssignedJsonArray(
	source: AsyncIterable<Buffer | string>,
): AsyncGenerator<Record<string, unknown>> {
	let started = false;
	let item = "";
	let depth = 0;
	let inString = false;
	let escaped = false;

	const flush = () => {
		const value = item.trim();
		item = "";
		return value ? (JSON.parse(value) as Record<string, unknown>) : undefined;
	};

	for await (const chunk of source) {
		for (const character of String(chunk)) {
			if (!started) {
				if (character === "[") started = true;
				continue;
			}

			if (inString) {
				item += character;
				if (escaped) {
					escaped = false;
				} else if (character === "\\") {
					escaped = true;
				} else if (character === '"') {
					inString = false;
				}
				continue;
			}

			if (character === '"') {
				inString = true;
				item += character;
				continue;
			}
			if (character === "{" || character === "[") {
				depth += 1;
				item += character;
				continue;
			}
			if (character === "}" || (character === "]" && depth > 0)) {
				depth -= 1;
				item += character;
				continue;
			}
			if (character === "]" && depth === 0) {
				const value = flush();
				if (value) yield value;
				return;
			}
			if (character === "," && depth === 0) {
				const value = flush();
				if (value) yield value;
				continue;
			}
			if (item.length > 0 || !/\s/.test(character)) {
				item += character;
			}
		}
	}

	if (!started) return;
	const value = flush();
	if (value) yield value;
}

export function ingestStreamInBatchesEffect<T>({
	batchSize = 250,
	onCheckpoint,
	processBatch,
	resumeAfter = 0,
	source,
}: {
	batchSize?: number;
	onCheckpoint?: (checkpoint: IngestionCheckpoint) => void | Promise<void>;
	processBatch: (
		batch: T[],
		checkpoint: IngestionCheckpoint,
	) => void | Promise<void>;
	resumeAfter?: number;
	source: () => AsyncIterable<T>;
}): Effect.Effect<IngestionCheckpoint, unknown> {
	return Effect.tryPromise({
		try: async () => {
			const normalizedBatchSize = Math.max(1, Math.trunc(batchSize));
			const normalizedResumeAfter = Math.max(0, Math.trunc(resumeAfter));
			let visited = 0;
			let processed = normalizedResumeAfter;
			let batch: T[] = [];

			const flush = async () => {
				if (batch.length === 0) return;
				processed += batch.length;
				const checkpoint = { processed };
				await processBatch(batch, checkpoint);
				await onCheckpoint?.(checkpoint);
				batch = [];
			};

			for await (const item of source()) {
				visited += 1;
				if (visited <= normalizedResumeAfter) continue;
				batch.push(item);
				if (batch.length >= normalizedBatchSize) {
					await flush();
				}
			}
			await flush();
			return { processed };
		},
		catch: (error) =>
			error instanceof Error ? error : new Error(String(error)),
	});
}
