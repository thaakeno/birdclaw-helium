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
	"gemini-3.5-flash",
	"gemini-2.5-flash",
	"gemini-2.5-pro",
	"gemini-2.0-flash",
] as const;

function normalizeProvider(value: unknown) {
	return value === "gemini" ? "gemini" : "openai";
}

function normalizeModel(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function publicAiSettings() {
	const ai = getBirdclawConfig().ai ?? {};
	const provider = ai.provider === "gemini" ? "gemini" : "openai";
	return {
		provider,
		model: ai.model ?? (provider === "gemini" ? "gemini-3.5-flash" : "gpt-5.5"),
		hasGeminiApiKey: Boolean(ai.geminiApiKey),
		geminiModels: GEMINI_MODELS,
	};
}

export const Route = createFileRoute("/api/settings-ai")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const denied = sensitiveRequestErrorResponse(request);
				if (denied) return denied;
				return jsonResponse(publicAiSettings());
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
							provider === "gemini" ? "gemini-3.5-flash" : "gpt-5.5";
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
						return jsonResponse({
							ok: true,
							configPath: saved.configPath,
							settings: publicAiSettings(),
						});
					}),
				),
		},
	},
});
