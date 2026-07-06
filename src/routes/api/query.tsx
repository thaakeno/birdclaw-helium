import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { queryResponseSchema } from "#/lib/api-contracts";
import { maybeAutoUpdateBackupEffect } from "#/lib/backup";
import { getReadDb } from "#/lib/db";
import {
	jsonResponse,
	parseBoundedInteger,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import { queryResource } from "#/lib/query-resource";
import {
	buildEmbeddedTweet,
	buildRetweetedTweet,
	enrichTimelineEntities,
	getProfileByHandle,
	getReplyCountFromRawJson,
	getQuoteCountFromRawJson,
	getRetweetCountFromRawJson,
	getViewsCountFromRawJson,
	type UrlExpansionCache,
	type ProfileByHandleCache,
} from "#/lib/timeline-read-model";
import type {
	DmQuery,
	ReplyFilter,
	ResourceKind,
	TimelineQuery,
	TimelineQualityFilter,
} from "#/lib/types";

function parseReplyFilter(value: string | null): ReplyFilter {
	if (value === "replied" || value === "unreplied") {
		return value;
	}
	return "all";
}

function parseOptionalNumber(value: string | null) {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function parseDmSort(value: string | null) {
	if (value === "followers" || value === "influence") {
		return "followers";
	}
	return "recent";
}

function parseQualityFilter(value: string | null): TimelineQualityFilter {
	return value === "summary" ? "summary" : "all";
}

function parseTimelineSort(value: string | null): TimelineQuery["sort"] {
	if (
		value === "created-desc" ||
		value === "created-asc" ||
		value === "saved-desc" ||
		value === "saved-asc" ||
		value === "likes-desc" ||
		value === "replies-desc"
	) {
		return value;
	}
	return undefined;
}

function parseDmInbox(value: string | null): NonNullable<DmQuery["inbox"]> {
	if (value === "accepted" || value === "requests") return value;
	return "all";
}

export const Route = createFileRoute("/api/query")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						yield* maybeAutoUpdateBackupEffect();
						const url = new URL(request.url);
						const resource = (url.searchParams.get("resource") ??
							"home") as ResourceKind;
						const baseFilters = {
							account: url.searchParams.get("account") ?? undefined,
							author: url.searchParams.get("author") ?? undefined,
							search: url.searchParams.get("search") ?? undefined,
							replyFilter: parseReplyFilter(
								url.searchParams.get("replyFilter"),
							),
							sort: parseTimelineSort(url.searchParams.get("sort")),
							since: url.searchParams.get("since") ?? undefined,
							until: url.searchParams.get("until") ?? undefined,
							includeReplies: url.searchParams.get("originalsOnly") !== "true",
							repliesOnly: url.searchParams.get("repliesOnly") === "true",
							qualityFilter: parseQualityFilter(
								url.searchParams.get("qualityFilter"),
							),
							likedOnly: url.searchParams.get("liked") === "true",
							bookmarkedOnly: url.searchParams.get("bookmarked") === "true",
							mediaOnly: url.searchParams.get("mediaOnly") === "true",
							quotedOnly: url.searchParams.get("quotedOnly") === "true",
							limit: parseBoundedInteger(url.searchParams.get("limit"), {
								max: 200,
							}),
						};

						if (resource === "dms") {
							return jsonResponse(
								queryResponseSchema.parse(
									queryResource("dms", {
										...baseFilters,
										participant:
											url.searchParams.get("participant") ?? undefined,
										minFollowers: parseOptionalNumber(
											url.searchParams.get("minFollowers"),
										),
										maxFollowers: parseOptionalNumber(
											url.searchParams.get("maxFollowers"),
										),
										minInfluenceScore: parseOptionalNumber(
											url.searchParams.get("minInfluenceScore"),
										),
										maxInfluenceScore: parseOptionalNumber(
											url.searchParams.get("maxInfluenceScore"),
										),
										sort: parseDmSort(url.searchParams.get("sort")),
										inbox: parseDmInbox(url.searchParams.get("inbox")),
										conversationId:
											url.searchParams.get("conversationId") ?? undefined,
									}),
								),
							);
						}

						if (resource === "circle") {
							const handlesRaw = url.searchParams.get("handles") || "";
							const handles = handlesRaw
								.split(",")
								.map((h) => h.trim().toLowerCase())
								.filter(Boolean);

							if (handles.length === 0) {
								return jsonResponse(
									queryResponseSchema.parse({
										resource: "circle",
										items: [],
									}),
								);
							}

							const db = getReadDb();
							const search = url.searchParams.get("search") || "";
							const limit = parseBoundedInteger(url.searchParams.get("limit"), { max: 200 }) || 20;

							const sort = parseTimelineSort(url.searchParams.get("sort")) || "created-desc";
							const likedOnly = url.searchParams.get("liked") === "true";
							const bookmarkedOnly = url.searchParams.get("bookmarked") === "true";
							const mediaOnly = url.searchParams.get("mediaOnly") === "true";
							const quotedOnly = url.searchParams.get("quotedOnly") === "true";
							const originalsOnly = url.searchParams.get("originalsOnly") === "true";
							const repliesOnly = url.searchParams.get("repliesOnly") === "true";

							const until = url.searchParams.get("until") ?? undefined;
							const untilId = url.searchParams.get("untilId") ?? undefined;

							const defaultAccountRow = db
								.prepare(
									"select id, handle from accounts order by is_default desc, created_at asc limit 1",
								)
								.get() as { id: string; handle: string } | undefined;
							const defaultAccountId = defaultAccountRow?.id || "acct_primary";
							const defaultAccountHandle = defaultAccountRow?.handle || "";

							let sql = `
								SELECT 
									t.id, 
									t.text, 
									t.created_at, 
									t.reply_to_id,
									t.is_replied,
									t.like_count, 
									t.media_count,
									(
										SELECT COUNT(*)
										FROM tweets child
										WHERE child.reply_to_id = t.id
									) as local_reply_count,
									EXISTS (
										SELECT 1 FROM tweet_collections collection
										WHERE collection.tweet_id = t.id AND collection.kind = 'bookmarks'
									) as bookmarked,
									EXISTS (
										SELECT 1 FROM tweet_collections collection
										WHERE collection.tweet_id = t.id AND collection.kind = 'likes'
									) as liked,
									t.entities_json, 
									t.media_json,
									t.quoted_tweet_id,
									(
										SELECT raw_json
										FROM tweet_account_edges edge
										WHERE edge.tweet_id = t.id
										ORDER BY edge.updated_at DESC
										LIMIT 1
									) as edge_raw_json,
									p.id as profile_id,
									p.handle, 
									p.display_name, 
									p.bio,
									p.followers_count,
									p.following_count,
									p.avatar_hue,
									p.avatar_url,
									p.created_at as profile_created_at,
									rt.id as reply_id,
									rt.text as reply_text,
									rt.created_at as reply_created_at,
									rt.reply_to_id as reply_reply_to_id,
									rt.entities_json as reply_entities_json,
									rt.media_json as reply_media_json,
									rt.like_count as reply_like_count,
									(
										SELECT raw_json
										FROM tweet_account_edges edge
										WHERE edge.tweet_id = rt.id
										ORDER BY edge.updated_at DESC
										LIMIT 1
									) as reply_edge_raw_json,
									rp.id as reply_profile_id,
									rp.handle as reply_handle,
									rp.display_name as reply_display_name,
									rp.bio as reply_bio,
									rp.followers_count as reply_followers_count,
									rp.following_count as reply_following_count,
									rp.avatar_hue as reply_avatar_hue,
									rp.avatar_url as reply_avatar_url,
									rp.created_at as reply_profile_created_at,
									qt.id as quoted_id,
									qt.text as quoted_text,
									qt.created_at as quoted_created_at,
									qt.reply_to_id as quoted_reply_to_id,
									qt.entities_json as quoted_entities_json,
									qt.media_json as quoted_media_json,
									qt.like_count as quoted_like_count,
									(
										SELECT raw_json
										FROM tweet_account_edges edge
										WHERE edge.tweet_id = qt.id
										ORDER BY edge.updated_at DESC
										LIMIT 1
									) as quoted_edge_raw_json,
									qp.id as quoted_profile_id,
									qp.handle as quoted_handle,
									qp.display_name as quoted_display_name,
									qp.bio as quoted_bio,
									qp.followers_count as quoted_followers_count,
									qp.following_count as qp_following_count,
									qp.avatar_hue as quoted_avatar_hue,
									qp.avatar_url as quoted_avatar_url,
									qp.created_at as quoted_profile_created_at
								FROM tweets t
								JOIN profiles p ON t.author_profile_id = p.id
								LEFT JOIN tweets rt ON rt.id = t.reply_to_id
								LEFT JOIN profiles rp ON rp.id = rt.author_profile_id
								LEFT JOIN tweets qt ON qt.id = t.quoted_tweet_id
								LEFT JOIN profiles qp ON qp.id = qt.author_profile_id
								WHERE LOWER(p.handle) IN (${handles.map(() => "?").join(",")})
							`;

							const params: any[] = [...handles];

							if (search.trim()) {
								sql += " AND t.text LIKE ? ";
								params.push(`%${search}%`);
							}

							if (likedOnly) {
								sql += ` AND EXISTS (
									SELECT 1 FROM tweet_collections collection
									WHERE collection.tweet_id = t.id AND collection.kind = 'likes'
								) `;
							}

							if (bookmarkedOnly) {
								sql += ` AND EXISTS (
									SELECT 1 FROM tweet_collections collection
									WHERE collection.tweet_id = t.id AND collection.kind = 'bookmarks'
								) `;
							}

							if (mediaOnly) {
								sql += " AND t.media_count > 0 ";
							}

							if (quotedOnly) {
								sql += " AND t.quoted_tweet_id IS NOT NULL ";
							}

							if (originalsOnly) {
								sql += " AND t.reply_to_id IS NULL ";
							}

							if (repliesOnly) {
								sql += " AND t.reply_to_id IS NOT NULL ";
							}

							// Keyset Pagination
							let sortKeySql = "t.created_at";
							let sortAscending = false;
							if (sort === "created-asc") {
								sortKeySql = "t.created_at";
								sortAscending = true;
							} else if (sort === "likes-desc") {
								sortKeySql = "t.like_count";
								sortAscending = false;
							} else if (sort === "replies-desc") {
								sortKeySql = `(
									SELECT COUNT(*)
									FROM tweets child
									WHERE child.reply_to_id = t.id
								)`;
								sortAscending = false;
							}

							const operator = sortAscending ? ">" : "<";

							if (until?.trim()) {
								if (untilId?.trim()) {
									sql += ` AND (${sortKeySql} ${operator} ? OR (${sortKeySql} = ? AND t.id ${operator} ?)) `;
									params.push(until.trim(), until.trim(), untilId.trim());
								} else {
									sql += ` AND ${sortKeySql} ${operator} ? `;
									params.push(until.trim());
								}
							}

							// Apply sorting
							if (sort === "created-asc") {
								sql += " ORDER BY t.created_at ASC ";
							} else if (sort === "likes-desc") {
								sql += " ORDER BY t.like_count DESC ";
							} else if (sort === "replies-desc") {
								sql += " ORDER BY local_reply_count DESC ";
							} else {
								sql += " ORDER BY t.created_at DESC ";
							}

							sql += " LIMIT ? ";
							params.push(limit);

							const rows = db.prepare(sql).all(...params) as Array<Record<string, any>>;

							const urlExpansionCache: UrlExpansionCache = new Map();
							const profileByHandleCache: ProfileByHandleCache = new Map();

							const items = rows.map((row) => {
								const author = {
									id: String(row.profile_id),
									handle: String(row.handle),
									displayName: String(row.display_name),
									bio: String(row.bio),
									followersCount: Number(row.followers_count),
									followingCount: Number(row.following_count ?? 0),
									avatarHue: Number(row.avatar_hue),
									avatarUrl:
										typeof row.avatar_url === "string" ? String(row.avatar_url) : undefined,
									createdAt: String(row.profile_created_at),
								};
								const rowProfiles: Record<string, any> = {
									[author.id]: author,
									...(row.reply_profile_id
										? {
												[String(row.reply_profile_id)]: {
													id: String(row.reply_profile_id),
													handle: String(row.reply_handle),
													displayName: String(row.reply_display_name),
													bio: String(row.reply_bio),
													followersCount: Number(row.reply_followers_count),
													followingCount: Number(row.reply_following_count ?? 0),
													avatarHue: Number(row.reply_avatar_hue),
													avatarUrl:
														typeof row.reply_avatar_url === "string" ? String(row.reply_avatar_url) : undefined,
													createdAt: String(row.reply_profile_created_at),
												},
											}
										: {}),
									...(row.quoted_profile_id
										? {
												[String(row.quoted_profile_id)]: {
													id: String(row.quoted_profile_id),
													handle: String(row.quoted_handle),
													displayName: String(row.quoted_display_name),
													bio: String(row.quoted_bio),
													followersCount: Number(row.quoted_followers_count),
													followingCount: Number(row.qp_following_count ?? 0),
													avatarHue: Number(row.quoted_avatar_hue),
													avatarUrl:
														typeof row.quoted_avatar_url === "string" ? String(row.quoted_avatar_url) : undefined,
													createdAt: String(row.quoted_profile_created_at),
												},
											}
										: {}),
								};

								const resolveProfileByHandle = (handle: string) =>
									getProfileByHandle(db, profileByHandleCache, handle, rowProfiles);

								const text = String(row.text);
								const entities = enrichTimelineEntities(
									db,
									urlExpansionCache,
									text,
									JSON.parse(row.entities_json || "{}"),
									rowProfiles,
									resolveProfileByHandle,
								);

								return {
									id: String(row.id),
									accountId: defaultAccountId,
									accountHandle: defaultAccountHandle,
									kind: "authored" as const,
									text,
									createdAt: String(row.created_at),
									savedAt: null,
									replyToId:
										typeof row.reply_to_id === "string" ? String(row.reply_to_id) : null,
									isReplied: Boolean(row.is_replied),
									replyCount: getReplyCountFromRawJson(row.edge_raw_json) ?? 0,
									localReplyCount: Number(row.local_reply_count ?? 0),
									likeCount: Number(row.like_count),
									retweetCount: getRetweetCountFromRawJson(row.edge_raw_json) ?? 0,
									quoteCount: getQuoteCountFromRawJson(row.edge_raw_json) ?? 0,
									viewsCount: getViewsCountFromRawJson(row.edge_raw_json) ?? 0,
									mediaCount: Number(row.media_count),
									bookmarked: Boolean(row.bookmarked),
									liked: Boolean(row.liked),
									author,
									entities,
									media: JSON.parse(row.media_json || "[]"),
									replyToTweet: buildEmbeddedTweet(
										db,
										urlExpansionCache,
										row,
										"reply_",
										resolveProfileByHandle,
									),
									quotedTweet: buildEmbeddedTweet(
										db,
										urlExpansionCache,
										row,
										"quoted_",
										resolveProfileByHandle,
									),
									retweetedTweet: buildRetweetedTweet(
										db,
										urlExpansionCache,
										row,
										resolveProfileByHandle,
									),
								};
							});

							return jsonResponse(
								queryResponseSchema.parse({
									resource: "circle",
									items,
								}),
							);
						}

						return jsonResponse(
							queryResponseSchema.parse(
								queryResource(resource, {
									...baseFilters,
									resource,
									untilId: url.searchParams.get("untilId") ?? undefined,
								}),
							),
						);
					}),
				),
		},
	},
});
