import { createFileRoute } from "@tanstack/react-router";
import { getReadDb } from "#/lib/db";
import { sensitiveRequestErrorResponse } from "#/lib/http-effect";

export const Route = createFileRoute("/api/bulk-export")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const denied = sensitiveRequestErrorResponse(request);
				if (denied) return denied;

				const url = new URL(request.url);
				const resource = url.searchParams.get("resource") || "bookmarks";
				const format = url.searchParams.get("format") || "markdown";

				const db = getReadDb();

				// Resolve user profile ID
				const accountRow = db
					.prepare("select external_user_id from accounts where id = 'acct_primary'")
					.get() as { external_user_id: string | null } | undefined;
				const profileId = accountRow?.external_user_id
					? `profile_user_${accountRow.external_user_id}`
					: null;

				let tweets: Array<{
					id: string;
					text: string;
					createdAt: string;
					authorHandle: string;
					authorName: string;
					likeCount: number;
					replyCount: number;
				}> = [];

				if (resource === "authored") {
					if (!profileId) {
						return new Response("No profile resolved for primary account.", { status: 400 });
					}
					tweets = db
						.prepare(
							`
							select 
								t.id, t.text, t.created_at as createdAt, t.like_count as likeCount,
								p.handle as authorHandle, p.display_name as authorName,
								(select count(*) from tweets child where child.reply_to_id = t.id) as replyCount
							from tweets t
							join profiles p on p.id = t.author_profile_id
							where t.author_profile_id = ?
							order by t.created_at desc
							`,
						)
						.all(profileId) as any[];
				} else {
					const kind = resource === "likes" ? "likes" : "bookmarks";
					tweets = db
						.prepare(
							`
							select 
								t.id, t.text, t.created_at as createdAt, t.like_count as likeCount,
								p.handle as authorHandle, p.display_name as authorName,
								(select count(*) from tweets child where child.reply_to_id = t.id) as replyCount
							from tweet_collections c
							join tweets t on t.id = c.tweet_id
							join profiles p on p.id = t.author_profile_id
							where c.kind = ?
							order by c.collected_at desc, t.created_at desc
							`,
						)
						.all(kind) as any[];
				}

				let fileContent = "";
				let contentType = "text/plain; charset=utf-8";
				let extension = "txt";

				if (format === "json") {
					fileContent = JSON.stringify(tweets, null, 2);
					contentType = "application/json; charset=utf-8";
					extension = "json";
				} else if (format === "bibtex") {
					fileContent = tweets
						.map((t) => {
							const cleanTitle = (t.text || "")
								.replace(/[\r\n]+/g, " ")
								.replace(/"/g, '\\"')
								.slice(0, 80) + ((t.text || "").length > 80 ? "..." : "");
							const year = new Date(t.createdAt).getFullYear();
							const bibtexKey = `${t.authorHandle.replace(/[^a-zA-Z0-9]/g, "")}${t.id.slice(-6)}`;
							const today = new Date().toISOString().split("T")[0];
							return `@online{${bibtexKey},
  author = {${t.authorName || t.authorHandle}},
  title = {${cleanTitle}},
  year = {${year}},
  url = {https://x.com/${t.authorHandle}/status/${t.id}},
  urldate = {${today}}
}`;
						})
						.join("\n\n");
					extension = "bib";
				} else {
					// Markdown format with replies
					const fetchRepliesStmt = db.prepare(`
						select t.id, t.text, t.created_at as createdAt, p.handle as authorHandle, p.display_name as authorName
						from tweets t
						join profiles p on p.id = t.author_profile_id
						where t.reply_to_id = ?
						order by t.created_at asc
					`);

					fileContent = `# Birdclaw Export - ${resource.toUpperCase()}\n\n`;
					fileContent += `Generated on ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}\n\n---\n\n`;

					for (const t of tweets) {
						const dateStr = new Date(t.createdAt).toLocaleDateString("en-US", {
							year: "numeric",
							month: "short",
							day: "numeric",
							hour: "2-digit",
							minute: "2-digit",
						});
						const profileUrl = `https://x.com/${t.authorHandle}`;
						const tweetUrl = `https://x.com/${t.authorHandle}/status/${t.id}`;

						fileContent += `### **[${t.authorName}](${profileUrl})** (@${t.authorHandle}) &middot; [${dateStr}](${tweetUrl})\n\n`;
						fileContent += `> ${t.text.replace(/\n/g, "\n> ")}\n\n`;
						fileContent += `*Likes: ${t.likeCount.toLocaleString()} | Replies: ${t.replyCount.toLocaleString()}*\n\n`;

						// Fetch and append replies
						const replies = fetchRepliesStmt.all(t.id) as Array<{
							id: string;
							text: string;
							createdAt: string;
							authorHandle: string;
							authorName: string;
						}>;

						if (replies && replies.length > 0) {
							fileContent += `**Replies:**\n`;
							for (const reply of replies) {
								const replyDate = new Date(reply.createdAt).toLocaleDateString("en-US", {
									year: "numeric",
									month: "short",
									day: "numeric",
								});
								fileContent += `* **[${reply.authorName}](https://x.com/${reply.authorHandle})** (@${reply.authorHandle}) &middot; ${replyDate}:\n  ${reply.text.replace(/\n/g, "\n  ")}\n`;
							}
							fileContent += `\n`;
						}

						fileContent += `---\n\n`;
					}
					extension = "md";
					contentType = "text/markdown; charset=utf-8";
				}

				const filename = `birdclaw-export-${resource}-${new Date().toISOString().slice(0, 10)}.${extension}`;

				return new Response(fileContent, {
					headers: {
						"cache-control": "no-store",
						"content-disposition": `attachment; filename="${filename}"`,
						"content-type": contentType,
						"x-content-type-options": "nosniff",
					},
				});
			},
		},
	},
});
