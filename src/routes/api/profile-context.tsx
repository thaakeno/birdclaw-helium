import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { jsonResponse } from "#/lib/http-effect";
import {
	parseBoundedInteger,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import {
	collectProfileAnalysisContextEffect,
	type ProfileAnalysisOptions,
} from "#/lib/profile-analysis";

function parseBoolean(value: string | null) {
	return value === "true" || value === "1" || value === "yes";
}

function parseOptions(url: URL): ProfileAnalysisOptions {
	return {
		handle: url.searchParams.get("handle") ?? "",
		account: url.searchParams.get("account") ?? undefined,
		refresh: parseBoolean(url.searchParams.get("refresh")),
		maxTweets: parseBoundedInteger(url.searchParams.get("maxTweets"), {
			max: 20_000,
		}),
		maxPages: parseBoundedInteger(url.searchParams.get("maxPages"), {
			max: 500,
		}),
		maxConversations: parseBoundedInteger(
			url.searchParams.get("maxConversations"),
			{ max: 500 },
		),
		maxConversationPages: parseBoundedInteger(
			url.searchParams.get("maxConversationPages"),
			{ max: 50 },
		),
	};
}

export const Route = createFileRoute("/api/profile-context")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const url = new URL(request.url);
						const context = yield* collectProfileAnalysisContextEffect(
							parseOptions(url),
						);
						return jsonResponse({ ok: true, context });
					}),
				),
		},
	},
});
