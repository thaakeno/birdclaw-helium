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
	const requestedMode = url.searchParams.get("mode");
	const refreshMode =
		requestedMode === "local" ||
		requestedMode === "newest" ||
		requestedMode === "deep"
			? requestedMode
			: undefined;
	return {
		handle: url.searchParams.get("handle") ?? "",
		account: url.searchParams.get("account") ?? undefined,
		refresh: parseBoolean(url.searchParams.get("refresh")),
		refreshMode,
		maxTweets: parseBoundedInteger(url.searchParams.get("maxTweets"), {
			max: 20_000,
		}),
		maxPages: parseBoundedInteger(url.searchParams.get("maxPages"), {
			max: 500,
		}),
		maxConversations: parseBoundedInteger(
			url.searchParams.get("maxConversations"),
			{ min: 0, max: 500 },
		),
		maxConversationPages: parseBoundedInteger(
			url.searchParams.get("maxConversationPages"),
			{ max: 50 },
		),
	};
}

class SimpleMutex {
	private promise: Promise<unknown> = Promise.resolve();

	async runExclusive<T>(fn: () => Promise<T>): Promise<T> {
		const next = this.promise.then(async () => {
			return fn();
		});
		this.promise = next.then(
			() => {},
			() => {},
		);
		return next;
	}
}

const profileSyncMutex = new SimpleMutex();

export const Route = createFileRoute("/api/profile-context")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const url = new URL(request.url);
						const options = parseOptions(url);

						const context = yield* Effect.promise(() => {
							if (options.refresh) {
								return profileSyncMutex.runExclusive(async () => {
									return Effect.runPromise(
										collectProfileAnalysisContextEffect(options),
									);
								});
							}
							return Effect.runPromise(
								collectProfileAnalysisContextEffect(options),
							);
						});

						return jsonResponse(
							{ ok: true, context },
							{
								headers: {
									"cache-control": "no-store, no-cache, must-revalidate",
								},
							},
						);
					}),
				),
		},
	},
});
