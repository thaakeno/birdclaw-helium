import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { getBirdclawConfig, setAiConfig } from "#/lib/config";
import {
	jsonResponse,
	requestJsonEffect,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";

const GEMINI_MODELS = [
	"gemini-2.5-flash",
	"gemini-2.5-pro",
	"gemini-2.0-flash-lite",
] as const;

function normalizeProvider(value: unknown) {
	return value === "gemini" ? "gemini" : "openai";
}

function normalizeModel(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

async function publicAiSettings() {
	const ai = getBirdclawConfig().ai ?? {};
	const provider = ai.provider === "gemini" ? "gemini" : "openai";
	let geminiModels: string[] = [...GEMINI_MODELS];
	if (ai.geminiApiKey) {
		try {
			const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${ai.geminiApiKey}`);
			if (res.ok) {
				const data = (await res.json()) as {
					models?: Array<{ name: string; supportedGenerationMethods?: string[] }>;
				};
				if (data.models && Array.isArray(data.models)) {
					const fetched = data.models
						.filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
						.map((m) => m.name.replace(/^models\//, ""))
						.filter((name) => {
							const lower = name.toLowerCase();
							if (lower.includes("1.5")) return false;
							if (lower.includes("2.0") && !lower.includes("lite")) return false;
							if (lower.includes("image")) return false;
							if (lower.includes("lyria")) return false;
							if (lower.includes("tts")) return false;
							if (lower.includes("deep-research")) return false;
							if (lower.includes("antigravity")) return false;
							if (lower.includes("banana")) return false;
							if (lower.includes("veo")) return false;
							return true;
						})
						.filter(Boolean);
					if (fetched.length > 0) {
						geminiModels = Array.from(new Set([...fetched, ...GEMINI_MODELS]));
					}
				}
			}
		} catch (error) {
			console.error("Failed to fetch dynamic Gemini models:", error);
		}
	}
	return {
		provider,
		model: ai.model ?? (provider === "gemini" ? "gemini-2.5-flash" : "gpt-5.5"),
		hasGeminiApiKey: Boolean(ai.geminiApiKey),
		geminiModels,
	};
}

export const Route = createFileRoute("/api/settings-ai")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const denied = sensitiveRequestErrorResponse(request);
				if (denied) return denied;
				return jsonResponse(await publicAiSettings());
			},
			POST: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;
						const body = yield* requestJsonEffect<Record<string, unknown>>(
							request,
							{},
						);
						const provider = normalizeProvider(body.provider);
						const fallbackModel =
							provider === "gemini" ? "gemini-2.5-flash" : "gpt-5.5";
						const model = normalizeModel(body.model) ?? fallbackModel;
						const geminiApiKey =
							typeof body.geminiApiKey === "string"
								? body.geminiApiKey
								: undefined;
						const clearGeminiApiKey = body.clearGeminiApiKey === true;
						const saved = setAiConfig({
							provider,
							model,
							...(geminiApiKey !== undefined ? { geminiApiKey } : {}),
							clearGeminiApiKey,
						});
						const settings = yield* Effect.promise(() => publicAiSettings());
						return jsonResponse({
							ok: true,
							configPath: saved.configPath,
							settings,
						});
					}),
				),
		},
	},
});
