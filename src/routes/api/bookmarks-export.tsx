import { createFileRoute } from "@tanstack/react-router";
import { getReadDb } from "#/lib/db";
import { sensitiveRequestErrorResponse } from "#/lib/http-effect";
import { parseJsonField } from "#/lib/query-read-model-shared";
import type { TweetEntities, TweetMediaItem } from "#/lib/types";

export const Route = createFileRoute("/api/bookmarks-export")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const denied = sensitiveRequestErrorResponse(request);
				if (denied) return denied;

				const exportedAt = new Date().toISOString();
				const payload = {
					schemaVersion: 1,
					exportedAt,
					source: {
						app: "birdclaw",
						collection: "bookmarks",
						note: "Local archive export. Private tokens, cookies, DMs, and browser data are not included.",
					},
					bookmarks: listBookmarkExportItems(),
				};
				const filename = `birdclaw-bookmarks-${exportedAt.slice(0, 10)}.json`;
				return new Response(JSON.stringify(payload, null, 2), {
					headers: {
						"cache-control": "no-store",
						"content-disposition": `attachment; filename="${filename}"`,
						"content-type": "application/json; charset=utf-8",
						"x-content-type-options": "nosniff",
					},
				});
			},
		},
	},
});

function listBookmarkExportItems() {
	const db = getReadDb();
	const rows = db
		.prepare(
			`
      select
        t.id,
        t.text,
        t.created_at,
        t.reply_to_id,
        t.like_count,
        t.media_count,
        t.entities_json,
        t.media_json,
        t.quoted_tweet_id,
        p.id as profile_id,
        p.handle,
        p.display_name,
        p.bio,
        p.followers_count,
        p.following_count,
        p.avatar_url,
        p.location,
        p.url as profile_url,
        p.verified_type,
        max(c.collected_at) as saved_at,
        group_concat(distinct c.account_id) as account_ids,
        (
          select count(*)
          from tweets child
          where child.reply_to_id = t.id
        ) as local_reply_count,
        qt.id as quoted_id,
        qt.text as quoted_text,
        qt.created_at as quoted_created_at,
        qt.like_count as quoted_like_count,
        qt.media_count as quoted_media_count,
        qt.entities_json as quoted_entities_json,
        qt.media_json as quoted_media_json,
        qp.id as quoted_profile_id,
        qp.handle as quoted_handle,
        qp.display_name as quoted_display_name,
        qp.bio as quoted_bio,
        qp.followers_count as quoted_followers_count,
        qp.following_count as quoted_following_count,
        qp.avatar_url as quoted_avatar_url,
        qp.location as quoted_location,
        qp.url as quoted_profile_url,
        qp.verified_type as quoted_verified_type,
        rt.id as reply_id,
        rt.text as reply_text,
        rt.created_at as reply_created_at,
        rp.id as reply_profile_id,
        rp.handle as reply_handle,
        rp.display_name as reply_display_name
      from tweet_collections c
      join tweets t on t.id = c.tweet_id
      join profiles p on p.id = t.author_profile_id
      left join tweets qt on qt.id = t.quoted_tweet_id
      left join profiles qp on qp.id = qt.author_profile_id
      left join tweets rt on rt.id = t.reply_to_id
      left join profiles rp on rp.id = rt.author_profile_id
      where c.kind = 'bookmarks'
      group by t.id
      order by max(c.collected_at) desc, t.created_at desc, t.id desc
      `,
		)
		.all() as Array<Record<string, unknown>>;

	return rows.map((row) => ({
		id: stringValue(row.id),
		url: tweetUrl(stringValue(row.handle), stringValue(row.id)),
		text: stringValue(row.text),
		createdAt: stringValue(row.created_at),
		savedAt: nullableString(row.saved_at),
		collection: {
			kind: "bookmarks",
			accountIds: stringValue(row.account_ids)
				.split(",")
				.map((value) => value.trim())
				.filter(Boolean),
		},
		author: profileExport(row, ""),
		metrics: {
			likes: numberValue(row.like_count),
			localReplies: numberValue(row.local_reply_count),
			media: numberValue(row.media_count),
		},
		replyTo: row.reply_id
			? {
					id: stringValue(row.reply_id),
					url: tweetUrl(
						stringValue(row.reply_handle),
						stringValue(row.reply_id),
					),
					text: stringValue(row.reply_text),
					createdAt: stringValue(row.reply_created_at),
					author: {
						id: stringValue(row.reply_profile_id),
						handle: stringValue(row.reply_handle),
						displayName: stringValue(row.reply_display_name),
					},
				}
			: null,
		quotedTweet: row.quoted_id
			? {
					id: stringValue(row.quoted_id),
					url: tweetUrl(
						stringValue(row.quoted_handle),
						stringValue(row.quoted_id),
					),
					text: stringValue(row.quoted_text),
					createdAt: stringValue(row.quoted_created_at),
					author: profileExport(row, "quoted_"),
					metrics: {
						likes: numberValue(row.quoted_like_count),
						media: numberValue(row.quoted_media_count),
					},
					entities: parseJsonField<TweetEntities>(row.quoted_entities_json, {}),
					media: parseJsonField<TweetMediaItem[]>(row.quoted_media_json, []),
				}
			: null,
		entities: parseJsonField<TweetEntities>(row.entities_json, {}),
		media: parseJsonField<TweetMediaItem[]>(row.media_json, []),
	}));
}

function profileExport(row: Record<string, unknown>, prefix: string) {
	return {
		id: stringValue(row[`${prefix}profile_id`]),
		handle: stringValue(row[`${prefix}handle`]),
		displayName: stringValue(row[`${prefix}display_name`]),
		bio: stringValue(row[`${prefix}bio`]),
		followers: numberValue(row[`${prefix}followers_count`]),
		following: numberValue(row[`${prefix}following_count`]),
		avatarUrl: nullableString(row[`${prefix}avatar_url`]),
		location: nullableString(row[`${prefix}location`]),
		profileUrl: nullableString(row[`${prefix}profile_url`]),
		verifiedType: nullableString(row[`${prefix}verified_type`]),
	};
}

function tweetUrl(handle: string, id: string) {
	return handle
		? `https://x.com/${handle}/status/${id}`
		: `https://x.com/i/status/${id}`;
}

function stringValue(value: unknown) {
	return typeof value === "string" ? value : value == null ? "" : String(value);
}

function nullableString(value: unknown) {
	const text = stringValue(value);
	return text ? text : null;
}

function numberValue(value: unknown) {
	const number = Number(value ?? 0);
	return Number.isFinite(number) ? number : 0;
}
