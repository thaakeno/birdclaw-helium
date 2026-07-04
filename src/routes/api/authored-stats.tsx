import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { getReadDb } from "#/lib/db";
import {
	jsonResponse,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";

export const Route = createFileRoute("/api/authored-stats")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const url = new URL(request.url);
						const accountId = url.searchParams.get("account") || "acct_primary";

						const db = yield* Effect.try({
							try: () => getReadDb(),
							catch: (e) => (e instanceof Error ? e : new Error(String(e))),
						});

						// Resolve user profile ID for account
						const accountRow = db
							.prepare("select external_user_id from accounts where id = ?")
							.get(accountId) as { external_user_id: string | null } | undefined;

						const profileId = accountRow?.external_user_id
							? `profile_user_${accountRow.external_user_id}`
							: null;

						if (!profileId) {
							return jsonResponse({
								totalPosts: 0,
								totalLikes: 0,
								totalReplies: 0,
								avgLikes: 0,
								avgReplies: 0,
								mostLikedTweet: null,
								mostRepliedTweet: null,
							});
						}

						const statsRow = db
							.prepare(
								`
								select 
									count(*) as totalPosts,
									sum(coalesce(like_count, 0)) as totalLikes,
									sum((select count(*) from tweets child where child.reply_to_id = t.id)) as totalReplies
								from tweets t
								where t.author_profile_id = ?
								`,
							)
							.get(profileId) as
							| { totalPosts: number; totalLikes: number; totalReplies: number }
							| undefined;

						const mostLikedRow = db
							.prepare(
								`
								select t.id, t.text, t.like_count as likeCount,
								       (select count(*) from tweets child where child.reply_to_id = t.id) as replyCount
								from tweets t
								where t.author_profile_id = ?
								order by t.like_count desc, t.created_at desc
								limit 1
								`,
							)
							.get(profileId) as
							| { id: string; text: string; likeCount: number; replyCount: number }
							| undefined;

						const mostRepliedRow = db
							.prepare(
								`
								select t.id, t.text, t.like_count as likeCount,
								       (select count(*) from tweets child where child.reply_to_id = t.id) as replyCount
								from tweets t
								where t.author_profile_id = ?
								order by (select count(*) from tweets child where child.reply_to_id = t.id) desc, t.created_at desc
								limit 1
								`,
							)
							.get(profileId) as
							| { id: string; text: string; likeCount: number; replyCount: number }
							| undefined;

						const totalPosts = statsRow?.totalPosts ?? 0;
						const totalLikes = statsRow?.totalLikes ?? 0;
						const totalReplies = statsRow?.totalReplies ?? 0;

						return jsonResponse({
							totalPosts,
							totalLikes,
							totalReplies,
							avgLikes:
								totalPosts > 0 ? Number((totalLikes / totalPosts).toFixed(1)) : 0,
							avgReplies:
								totalPosts > 0
									? Number((totalReplies / totalPosts).toFixed(1))
									: 0,
							mostLikedTweet: mostLikedRow ?? null,
							mostRepliedTweet: mostRepliedRow ?? null,
						});
					}),
				),
		},
	},
});
