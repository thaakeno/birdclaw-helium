import { createFileRoute } from "@tanstack/react-router";
import { listQuotesViaBird, listThreadViaBird } from "#/lib/bird";
import { getNativeDb } from "#/lib/db";
import {
	jsonResponse,
	requestJsonEffect,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import { ingestTweetPayload } from "#/lib/tweet-repository";
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
							triggerBackgroundThreadSync(db, accountId, fresh);
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

function parseJson(str: string | null) {
	if (!str) return {};
	try {
		return JSON.parse(str);
	} catch {
		return {};
	}
}

function getQuoteCount(rawJsonStr: string | null) {
	if (!rawJsonStr) return undefined;
	const raw = parseJson(rawJsonStr);
	const metrics = raw.public_metrics || raw.legacy;
	if (!metrics || typeof metrics !== "object") return undefined;
	const count = Number(metrics.quote_count);
	return Number.isFinite(count) ? count : undefined;
}

function getViewsCount(rawJsonStr: string | null) {
	if (!rawJsonStr) return undefined;
	const raw = parseJson(rawJsonStr);
	const views = raw.views;
	if (!views || typeof views !== "object") return undefined;
	const count = Number(views.count);
	return Number.isFinite(count) ? count : undefined;
}

function getCachedQuotes(db: any, accountId: string, tweetId: string) {
	const rows = db
		.prepare(
			`
			select t.id, t.text, t.created_at, t.reply_to_id, t.is_replied, t.like_count, t.media_count, t.entities_json, t.media_json,
			       p.id as profile_id, p.handle, p.display_name, p.bio, p.followers_count, p.avatar_hue, p.avatar_url, p.created_at as profile_created_at,
			       e.raw_json as edge_raw_json
			from tweets t
			join profiles p on p.id = t.author_profile_id
			left join tweet_account_edges e on e.tweet_id = t.id and e.account_id = ?
			where t.quoted_tweet_id = ?
			group by t.id
			order by t.created_at desc
			`,
		)
		.all(accountId, tweetId) as any[];

	return rows.map((row) => ({
		id: row.id,
		text: row.text,
		createdAt: row.created_at,
		replyToId: row.reply_to_id,
		isReplied: Boolean(row.is_replied),
		likeCount: Number(row.like_count),
		mediaCount: Number(row.media_count),
		author: {
			id: row.profile_id,
			handle: row.handle,
			displayName: row.display_name,
			bio: row.bio,
			followersCount: Number(row.followers_count),
			avatarHue: Number(row.avatar_hue),
			avatarUrl: row.avatar_url || undefined,
			createdAt: row.profile_created_at,
		},
		entities: parseJson(row.entities_json),
		media: parseJson(row.media_json),
		quoteCount: getQuoteCount(row.edge_raw_json),
		viewsCount: getViewsCount(row.edge_raw_json),
	}));
}

function triggerBackgroundThreadSync(db: any, accountId: string, quotes: any[]) {
	// Sync threads sequentially in the background to avoid rate limit spikes
	Promise.resolve().then(async () => {
		for (const quote of quotes) {
			try {
				const threadPayload = await listThreadViaBird({
					tweetId: quote.id,
					all: false, // only get first page of replies to keep it super fast
					maxPages: 1,
					timeoutMs: 15_000,
				});
				ingestTweetPayload(db, {
					accountId,
					payload: threadPayload as any,
					source: "bird",
					markRepliesAsReplied: true,
				});
			} catch (e) {
				console.error(`Background thread pre-fetch failed for quote ${quote.id}:`, e);
			}
		}
	});
}
