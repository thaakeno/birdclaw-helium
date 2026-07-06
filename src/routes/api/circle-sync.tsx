import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import {
	jsonResponse,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import { syncCircleProfileTweetsEffect } from "#/lib/profile-analysis";

function parseHandles(url: URL): string[] {
	const raw = url.searchParams.get("handles") ?? "";
	return raw
		.split(",")
		.map((h) => h.trim().replace(/^@/, ""))
		.filter((h) => /^[A-Za-z0-9_]{1,15}$/.test(h))
		.slice(0, 30);
}

export const Route = createFileRoute("/api/circle-sync")({
	server: {
		handlers: {
			POST: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const url = new URL(request.url);
						const handles = parseHandles(url);

						if (handles.length === 0) {
							return jsonResponse(
								{ ok: false, message: "No valid handles provided" },
								{ status: 400 },
							);
						}

						const results = yield* syncCircleProfileTweetsEffect(handles);
						const totalCount = results.reduce((sum, r) => sum + r.count, 0);
						const errors = results
							.filter((r) => r.error)
							.map((r) => `@${r.handle}: ${r.error ?? ""}`);
						const rateLimited = errors.some(
							(e) => /429|rate limit/i.test(e),
						);

						return jsonResponse({
							ok: true,
							totalCount,
							results,
							...(errors.length > 0 ? { errors } : {}),
							...(rateLimited ? { rateLimited: true } : {}),
						});
					}),
				),
		},
	},
});
