// @vitest-environment node
import { Effect } from "effect";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	createGeminiStreamState,
	extractGeminiResponseText,
	processGeminiResponseSseChunk,
	readGeminiResponseStreamEffect,
	requestGeminiResponseEffect,
} from "./gemini-response-runtime";

afterEach(() => {
	delete process.env.GEMINI_API_KEY;
	delete process.env.GOOGLE_API_KEY;
	vi.unstubAllGlobals();
});

describe("Gemini response runtime", () => {
	it("extracts generated text from candidates", () => {
		expect(
			extractGeminiResponseText({
				candidates: [
					{
						content: {
							parts: [{ text: "Profile" }, { text: "\n---\n{}" }],
						},
					},
				],
			}),
		).toBe("Profile\n---\n{}");
	});

	it("streams visible markdown while retaining hybrid output", async () => {
		const visible: string[] = [];
		const stream = new ReadableStream({
			start(controller) {
				for (const event of [
					{ candidates: [{ content: { parts: [{ text: "Hello\n-" }] } }] },
					{
						candidates: [{ content: { parts: [{ text: '--\n{"ok":true}' }] } }],
						usageMetadata: { candidatesTokenCount: 2 },
					},
				]) {
					controller.enqueue(
						new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
					);
				}
				controller.close();
			},
		});
		const result = await Effect.runPromise(
			readGeminiResponseStreamEffect(new Response(stream), {
				onDelta: (delta) => visible.push(delta),
			}),
		);

		expect(visible.join("")).toBe("Hello");
		expect(result).toEqual({
			rawText: 'Hello\n---\n{"ok":true}',
			usage: { candidatesTokenCount: 2 },
		});
	});

	it("retains incomplete SSE frames and ignores malformed events", () => {
		const state = createGeminiStreamState();
		processGeminiResponseSseChunk(state, "data: {bad}\n\n");
		processGeminiResponseSseChunk(
			state,
			`data: ${JSON.stringify({
				candidates: [{ content: { parts: [{ text: "ok" }] } }],
			})}`,
		);
		expect(state.rawText).toBe("");
		processGeminiResponseSseChunk(state, "\n\n");
		expect(state.rawText).toBe("ok");
	});

	it("checks credentials and HTTP failures centrally", async () => {
		await expect(
			Effect.runPromise(requestGeminiResponseEffect({ body: {} })),
		).rejects.toThrow("GEMINI_API_KEY");

		process.env.GEMINI_API_KEY = "test";
		vi.stubGlobal(
			"fetch",
			vi.fn().mockResolvedValue(new Response("bad request", { status: 400 })),
		);
		await expect(
			Effect.runPromise(requestGeminiResponseEffect({ body: {} })),
		).rejects.toThrow("400 bad request");
	});
});
