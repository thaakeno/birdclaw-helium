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
									sum(case when t.reply_to_id is null then 1 else 0 end) as broadcastsCount,
									sum(case when t.reply_to_id is not null then 1 else 0 end) as repliesCount,
									sum(coalesce(like_count, 0)) as totalLikes,
									sum((select count(*) from tweets child where child.reply_to_id = t.id)) as totalReplies
								from tweets t
								where t.author_profile_id = ?
								`,
							)
							.get(profileId) as
							| { totalPosts: number; broadcastsCount: number; repliesCount: number; totalLikes: number; totalReplies: number }
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

						const radarRows = db
							.prepare(
								`
								with prominent_profiles as (
									select p.id
									from follow_edges fe
									join profiles p on p.id = fe.profile_id
									where fe.account_id = ? and fe.current = 1
									order by p.followers_count desc
									limit 100
								)
								select 
									t.id, 
									t.text, 
									t.created_at as createdAt, 
									t.like_count as likeCount,
									p.handle as authorHandle, 
									p.display_name as authorName, 
									p.avatar_url as authorAvatarUrl,
									p.followers_count as authorFollowers,
									(select count(*) from tweets child where child.reply_to_id = t.id) as replyCount
								from tweets t
								join profiles p on p.id = t.author_profile_id
								where t.author_profile_id in prominent_profiles
									and t.reply_to_id is null
									and t.author_profile_id != (select external_user_id from accounts where id = ?)
								order by t.created_at desc
								limit 10
								`,
							)
							.all(accountId, accountId) as Array<{
								id: string;
								text: string;
								createdAt: string;
								likeCount: number;
								authorHandle: string;
								authorName: string;
								authorAvatarUrl: string | null;
								authorFollowers: number;
								replyCount: number;
							}>;

						const totalPosts = statsRow?.totalPosts ?? 0;
						const totalLikes = statsRow?.totalLikes ?? 0;
						const totalReplies = statsRow?.totalReplies ?? 0;
						const broadcastsCount = statsRow?.broadcastsCount ?? 0;
						const repliesCount = statsRow?.repliesCount ?? 0;

						return jsonResponse({
							totalPosts,
							totalLikes,
							totalReplies,
							broadcastsCount,
							repliesCount,
							replyRatio:
								totalPosts > 0
									? Number(((repliesCount / totalPosts) * 100).toFixed(1))
									: 0,
							avgLikes:
								totalPosts > 0 ? Number((totalLikes / totalPosts).toFixed(1)) : 0,
							avgReplies:
								totalPosts > 0
									? Number((totalReplies / totalPosts).toFixed(1))
									: 0,
							mostLikedTweet: mostLikedRow ?? null,
							mostRepliedTweet: mostRepliedRow ?? null,
							radarItems: radarRows,
						});
					}),
				),
		},
	},
});
