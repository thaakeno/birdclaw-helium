import { createFileRoute } from "@tanstack/react-router";
import { listQuotesViaBird } from "#/lib/bird";
import { getNativeDb } from "#/lib/db";
import {
	jsonResponse,
	requestJsonEffect,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import { ingestTweetPayload } from "#/lib/tweet-repository";
import { getTweetsByIds } from "#/lib/timeline-read-model";
import { Effect } from "effect";

export const Route = createFileRoute("/api/quotes")({
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
						const accountId = parseAccountId(body.accountId) ?? defaultAccountId(db);
						if (!accountId) {
							return jsonResponse(
								{ ok: false, message: "No local account configured" },
								{ status: 400 },
							);
						}

						const refresh = body.refresh === true;

						// 1. If not refreshing, check if we have quotes in local db first
						if (!refresh) {
							const cached = getCachedQuotes(db, accountId, tweetId);
							if (cached.length > 0) {
								return jsonResponse({
									ok: true,
									tweetId,
									accountId,
									source: "cache",
									quotes: cached,
								});
							}
						}

						// 2. Fetch live from X using bird CLI search
						try {
							const payload = yield* Effect.promise(() =>
								listQuotesViaBird({
									tweetId,
									all: true,
									maxPages: 3,
								}),
							);

							// Ingest quotes into local DB
							ingestTweetPayload(db, {
								accountId,
								payload,
								source: "bird",
								edgeKind: "thread_context",
							});

							const fresh = getCachedQuotes(db, accountId, tweetId);
							return jsonResponse({
								ok: true,
								tweetId,
								accountId,
								source: "live",
								quotes: fresh,
							});
						} catch (error) {
							// If live fetch fails, fall back to whatever cached quotes we have
							const fallback = getCachedQuotes(db, accountId, tweetId);
							return jsonResponse({
								ok: true,
								tweetId,
								accountId,
								source: "fallback",
								quotes: fallback,
								error: error instanceof Error ? error.message : String(error),
							});
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

function getCachedQuotes(db: any, accountId: string, tweetId: string) {
	const rows = db
		.prepare(
			`
			select t.id
			from tweets t
			where t.quoted_tweet_id = ?
			  and (
			    exists (
			      select 1 from tweet_account_edges e
			      where e.account_id = ?
			        and e.tweet_id = t.id
			    )
			    or exists (
			      select 1 from tweet_collections c
			      where c.account_id = ?
			        and c.tweet_id = t.id
			    )
			  )
			order by t.created_at desc
			`,
		)
		.all(tweetId, accountId, accountId) as Array<{ id: string }>;

	return getTweetsByIds(
		rows.map((row) => row.id),
		accountId,
	);
}
