import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { queryResponseSchema } from "#/lib/api-contracts";
import { maybeAutoUpdateBackupEffect } from "#/lib/backup";
import { getNativeDb } from "#/lib/db";
import {
	jsonResponse,
	parseBoundedInteger,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import { queryResource } from "#/lib/query-resource";
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

							const db = getNativeDb();
							const search = url.searchParams.get("search") || "";
							const limit = parseBoundedInteger(url.searchParams.get("limit"), { max: 200 }) || 20;

							const sort = parseTimelineSort(url.searchParams.get("sort")) || "created-desc";
							const likedOnly = url.searchParams.get("liked") === "true";
							const bookmarkedOnly = url.searchParams.get("bookmarked") === "true";
							const mediaOnly = url.searchParams.get("mediaOnly") === "true";
							const quotedOnly = url.searchParams.get("quotedOnly") === "true";
							const originalsOnly = url.searchParams.get("originalsOnly") === "true";
							const repliesOnly = url.searchParams.get("repliesOnly") === "true";

							let sql = `
								SELECT 
									t.id, 
									t.text, 
									t.created_at as createdAt, 
									t.like_count as likeCount, 
									(
										SELECT COUNT(*)
										FROM tweets child
										WHERE child.reply_to_id = t.id
									) as replyCount, 
									t.entities_json as entitiesJson, 
									t.media_json as mediaJson,
									p.id as authorProfileId,
									p.handle as authorHandle, 
									p.display_name as authorDisplayName, 
									p.avatar_url as authorAvatarUrl,
									p.avatar_hue as authorAvatarHue,
									EXISTS (
										SELECT 1 FROM tweet_collections collection
										WHERE collection.tweet_id = t.id AND collection.kind = 'bookmarks'
									) as bookmarked,
									EXISTS (
										SELECT 1 FROM tweet_collections collection
										WHERE collection.tweet_id = t.id AND collection.kind = 'likes'
									) as liked
								FROM tweets t
								JOIN profiles p ON t.author_profile_id = p.id
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

							// Apply sorting
							if (sort === "created-asc") {
								sql += " ORDER BY t.created_at ASC ";
							} else if (sort === "likes-desc") {
								sql += " ORDER BY t.like_count DESC ";
							} else if (sort === "replies-desc") {
								sql += " ORDER BY replyCount DESC ";
							} else {
								sql += " ORDER BY t.created_at DESC ";
							}

							sql += " LIMIT ? ";
							params.push(limit);

							const rows = db.prepare(sql).all(...params) as Array<{
								id: string;
								text: string;
								createdAt: string;
								likeCount: number;
								replyCount: number;
								entitiesJson: string;
								mediaJson: string;
								authorProfileId: string;
								authorHandle: string;
								authorDisplayName: string;
								authorAvatarUrl: string | null;
								authorAvatarHue: number | null;
								bookmarked: number;
								liked: number;
							}>;

							const items = rows.map((r) => ({
								id: r.id,
								kind: "authored" as const,
								text: r.text,
								createdAt: r.createdAt,
								likeCount: r.likeCount,
								replyCount: r.replyCount,
								bookmarked: Boolean(r.bookmarked),
								liked: Boolean(r.liked),
								entities: JSON.parse(r.entitiesJson || "{}"),
								media: JSON.parse(r.mediaJson || "[]"),
								author: {
									id: r.authorProfileId,
									handle: r.authorHandle,
									displayName: r.authorDisplayName,
									avatarUrl: r.authorAvatarUrl,
									avatarHue: r.authorAvatarHue || 0,
								},
							}));

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
