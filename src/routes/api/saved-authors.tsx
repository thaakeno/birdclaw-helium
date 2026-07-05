import { createFileRoute } from "@tanstack/react-router";
import { getReadDb } from "#/lib/db";
import {
	jsonResponse,
	parseBoundedInteger,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";

type SavedAuthorRow = {
	profile_id: string;
	handle: string;
	display_name: string;
	avatar_hue: number;
	avatar_url: string | null;
	post_count: number;
	latest_at: string | null;
};

export const Route = createFileRoute("/api/saved-authors")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const denied = sensitiveRequestErrorResponse(request);
				if (denied) return denied;

				const url = new URL(request.url);
				const collection =
					url.searchParams.get("collection") === "likes" ? "likes" : "bookmarks";
				const account = url.searchParams.get("account")?.trim();
				const limit = parseBoundedInteger(url.searchParams.get("limit"), {
					defaultValue: 2500,
					max: 10000,
				});
				const params: unknown[] = [collection];
				let accountWhere = "";
				if (account && account !== "all") {
					accountWhere = "and c.account_id = ?";
					params.push(account);
				}
				params.push(limit);

				const rows = getReadDb()
					.prepare(
						`
			      select
			        p.id as profile_id,
			        p.handle,
			        p.display_name,
			        p.avatar_hue,
			        p.avatar_url,
			        count(distinct c.tweet_id) as post_count,
			        max(coalesce(c.collected_at, t.created_at)) as latest_at
			      from tweet_collections c
			      join tweets t on t.id = c.tweet_id
			      join profiles p on p.id = t.author_profile_id
			      where c.kind = ?
			        ${accountWhere}
			      group by lower(p.handle)
			      order by post_count desc, latest_at desc, lower(p.handle) asc
			      limit ?
			      `,
					)
					.all(...params) as SavedAuthorRow[];

				return jsonResponse({
					ok: true,
					collection,
					authors: rows.map((row) => ({
						profileId: String(row.profile_id),
						handle: String(row.handle),
						displayName: String(row.display_name),
						avatarHue: Number(row.avatar_hue),
						avatarUrl:
							typeof row.avatar_url === "string" ? row.avatar_url : undefined,
						postCount: Number(row.post_count),
						latestAt:
							typeof row.latest_at === "string" ? row.latest_at : undefined,
					})),
				});
			},
		},
	},
});
