import { Effect } from "effect";
import { tryPromise } from "./effect-runtime";
import {
	defaultRuntimeServices,
	type RuntimeServices,
} from "./runtime-services";

const DEFAULT_DELIMITER_PATTERN = /\n---\s*\n/;
const DEFAULT_DELIMITER_HOLD = 8;

export interface GeminiStreamState {
	eventBuffer: string;
	rawText: string;
	pendingVisible: string;
	jsonMode: boolean;
	usage?: unknown;
	error?: string;
}

export interface GeminiStreamResult {
	rawText: string;
	usage?: unknown;
}

interface GeminiRequestBody {
	model?: string;
	input?: Array<{ role?: string; content?: string }>;
	max_output_tokens?: number;
}

function toError(error: unknown) {
	return error instanceof Error ? error : new Error(String(error));
}

function geminiApiKey(runtime: RuntimeServices) {
	return runtime.env("GEMINI_API_KEY") ?? runtime.env("GOOGLE_API_KEY");
}

function geminiUrl(model: string, stream: boolean, apiKey: string) {
	const action = stream ? "streamGenerateContent" : "generateContent";
	const params = new URLSearchParams({ key: apiKey });
	if (stream) params.set("alt", "sse");
	return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:${action}?${params.toString()}`;
}

function splitInput(body: GeminiRequestBody) {
	const input = Array.isArray(body.input) ? body.input : [];
	const system = input
		.filter((item) => item.role === "system")
		.map((item) => item.content ?? "")
		.join("\n\n")
		.trim();
	const prompt = input
		.filter((item) => item.role !== "system")
		.map((item) => item.content ?? "")
		.join("\n\n")
		.trim();
	return { system, prompt };
}

function createGeminiRequestBody(body: unknown) {
	const request = (body ?? {}) as GeminiRequestBody;
	const { system, prompt } = splitInput(request);
	return {
		contents: [
			{
				role: "user",
				parts: [{ text: prompt }],
			},
		],
		...(system
			? {
					systemInstruction: {
						parts: [{ text: system }],
					},
				}
			: {}),
		generationConfig: {
			...(request.max_output_tokens
				? { maxOutputTokens: request.max_output_tokens }
				: {}),
		},
	};
}

export function extractGeminiResponseText(payload: Record<string, unknown>) {
	const candidates = Array.isArray(payload.candidates)
		? payload.candidates
		: [];
	const parts: string[] = [];
	for (const candidate of candidates) {
		if (!candidate || typeof candidate !== "object") continue;
		const content = (candidate as { content?: unknown }).content;
		if (!content || typeof content !== "object") continue;
		const candidateParts = (content as { parts?: unknown }).parts;
		if (!Array.isArray(candidateParts)) continue;
		for (const part of candidateParts) {
			if (!part || typeof part !== "object") continue;
			const text = (part as { text?: unknown }).text;
			if (typeof text === "string") parts.push(text);
		}
	}
	return parts.join("");
}

export function createGeminiStreamState(): GeminiStreamState {
	return {
		eventBuffer: "",
		rawText: "",
		pendingVisible: "",
		jsonMode: false,
	};
}

function emitVisibleDelta(
	state: GeminiStreamState,
	delta: string,
	onDelta: ((delta: string) => void) | undefined,
	delimiterPattern: RegExp,
	delimiterHold: number,
) {
	state.rawText += delta;
	if (state.jsonMode) return;

	const combined = state.pendingVisible + delta;
	const delimiterIndex = combined.search(delimiterPattern);
	if (delimiterIndex >= 0) {
		const visible = combined.slice(0, delimiterIndex);
		if (visible) onDelta?.(visible);
		state.pendingVisible = "";
		state.jsonMode = true;
		return;
	}

	if (combined.length <= delimiterHold) {
		state.pendingVisible = combined;
		return;
	}

	const visible = combined.slice(0, -delimiterHold);
	state.pendingVisible = combined.slice(-delimiterHold);
	if (visible) onDelta?.(visible);
}

function handleGeminiEvent(
	state: GeminiStreamState,
	event: Record<string, unknown>,
	onDelta: ((delta: string) => void) | undefined,
	delimiterPattern: RegExp,
	delimiterHold: number,
) {
	const text = extractGeminiResponseText(event);
	if (text) {
		emitVisibleDelta(state, text, onDelta, delimiterPattern, delimiterHold);
	}
	if (event.usageMetadata !== undefined) {
		state.usage = event.usageMetadata;
	}
	if (event.error && typeof event.error === "object") {
		const message = (event.error as { message?: unknown }).message;
		state.error =
			typeof message === "string" ? message : "Gemini stream failed";
	}
}

export function processGeminiResponseSseChunk(
	state: GeminiStreamState,
	chunk: string,
	{
		onDelta,
		delimiterPattern = DEFAULT_DELIMITER_PATTERN,
		delimiterHold = DEFAULT_DELIMITER_HOLD,
	}: {
		onDelta?: (delta: string) => void;
		delimiterPattern?: RegExp;
		delimiterHold?: number;
	} = {},
) {
	state.eventBuffer += chunk;
	let boundary = state.eventBuffer.indexOf("\n\n");
	while (boundary >= 0) {
		const block = state.eventBuffer.slice(0, boundary);
		state.eventBuffer = state.eventBuffer.slice(boundary + 2);
		const data = block
			.split("\n")
			.filter((line) => line.startsWith("data:"))
			.map((line) => line.slice(5).trimStart())
			.join("\n");
		if (data && data !== "[DONE]") {
			try {
				handleGeminiEvent(
					state,
					JSON.parse(data) as Record<string, unknown>,
					onDelta,
					delimiterPattern,
					delimiterHold,
				);
			} catch {
				// The feature parser decides whether partial output remains usable.
			}
		}
		boundary = state.eventBuffer.indexOf("\n\n");
	}
}

export function readGeminiResponseStreamEffect(
	response: Response,
	options: {
		onDelta?: (delta: string) => void;
		delimiterPattern?: RegExp;
		delimiterHold?: number;
	} = {},
): Effect.Effect<GeminiStreamResult, Error> {
	const reader = response.body?.getReader();
	if (!reader) {
		return Effect.fail(new Error("Gemini response did not include a stream"));
	}
	const decoder = new TextDecoder();

	return Effect.gen(function* () {
		const state = createGeminiStreamState();
		for (;;) {
			const { done, value } = yield* tryPromise(() => reader.read()).pipe(
				Effect.mapError(toError),
			);
			if (!done) {
				processGeminiResponseSseChunk(
					state,
					decoder.decode(value, { stream: true }),
					options,
				);
				continue;
			}
			if (!state.jsonMode && state.pendingVisible) {
				options.onDelta?.(state.pendingVisible);
			}
			if (state.error) {
				return yield* Effect.fail(new Error(state.error));
			}
			return {
				rawText: state.rawText,
				...(state.usage === undefined ? {} : { usage: state.usage }),
			};
		}
	}).pipe(
		Effect.ensuring(
			Effect.sync(() => {
				reader.releaseLock();
			}),
		),
	);
}

export function requestGeminiResponseEffect({
	body,
	signal,
	stream = false,
	runtime = defaultRuntimeServices,
}: {
	body: unknown;
	signal?: AbortSignal;
	stream?: boolean;
	runtime?: RuntimeServices;
}): Effect.Effect<Response, Error> {
	return Effect.gen(function* () {
		const apiKey = geminiApiKey(runtime);
		if (!apiKey) {
			return yield* Effect.fail(new Error("GEMINI_API_KEY is not set"));
		}
		const model =
			typeof (body as { model?: unknown })?.model === "string"
				? String((body as { model: string }).model)
				: "gemini-3.5-flash";
		const response = yield* tryPromise(() =>
			runtime.fetch(geminiUrl(model, stream, apiKey), {
				method: "POST",
				signal,
				headers: {
					"content-type": "application/json",
				},
				body: JSON.stringify(createGeminiRequestBody(body)),
			}),
		).pipe(Effect.mapError(toError));
		if (!response.ok) {
			const text = yield* tryPromise(() => response.text()).pipe(
				Effect.mapError(toError),
			);
			return yield* Effect.fail(
				new Error(
					`Gemini request failed: ${String(response.status)} ${text.slice(0, 400)}`,
				),
			);
		}
		return response;
	});
}
