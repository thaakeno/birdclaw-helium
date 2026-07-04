import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { lookupTweetsByIdsViaBird } from "#/lib/bird";
import { getNativeDb } from "#/lib/db";
import {
	jsonResponse,
	requestJsonEffect,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import { ingestTweetPayload } from "#/lib/tweet-repository";
import type { XurlMentionsResponse } from "#/lib/types";

export const Route = createFileRoute("/api/tweet-sync")({
	server: {
		handlers: {
			POST: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const body = yield* requestJsonEffect<Record<string, unknown>>(
							request,
							{},
						);
						const tweetId = parseTweetId(body.tweetId);
						if (!tweetId) {
							return jsonResponse(
								{ ok: false, message: "Missing tweetId" },
								{ status: 400 },
							);
						}

						const db = getNativeDb({ seedDemoData: false });
						const accountId =
							parseAccountId(body.accountId) ?? defaultAccountId(db);
						if (!accountId) {
							return jsonResponse(
								{ ok: false, message: "No local account configured" },
								{ status: 400 },
							);
						}

						try {
							const payload = yield* Effect.promise(() =>
								lookupTweetsByIdsViaBird([tweetId]),
							);
							const tweetIds = ingestTweetPayload(db, {
								accountId,
								payload: payload as XurlMentionsResponse,
								source: "bird",
							});
							return jsonResponse({
								ok: true,
								tweetId,
								accountId,
								count: tweetIds.length,
							});
						} catch (error) {
							return jsonResponse(
								{
									ok: false,
									message:
										error instanceof Error
											? error.message
											: "Tweet sync failed",
								},
								{ status: 502 },
							);
						}
					}),
				),
		},
	},
});

function parseTweetId(value: unknown) {
	if (typeof value !== "string") return null;
	const trimmed = value.trim();
	return /^\d{10,25}$/.test(trimmed) || /^tweet_[A-Za-z0-9_:-]+$/.test(trimmed)
		? trimmed
		: null;
}

function parseAccountId(value: unknown) {
	return typeof value === "string" && value.trim().length > 0
		? value.trim()
		: undefined;
}

function defaultAccountId(db: ReturnType<typeof getNativeDb>) {
	const row = db
		.prepare(
			"select id from accounts order by is_default desc, created_at asc limit 1",
		)
		.get() as { id?: unknown } | undefined;
	return typeof row?.id === "string" && row.id ? row.id : undefined;
}
