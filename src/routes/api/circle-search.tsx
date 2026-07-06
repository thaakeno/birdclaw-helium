import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { getNativeDb } from "#/lib/db";
import { runRouteEffect, jsonResponse, sensitiveRequestErrorResponse } from "#/lib/http-effect";

export const Route = createFileRoute("/api/circle-search")({
	server: {
		handlers: {
			GET: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const url = new URL(request.url);
						const search = url.searchParams.get("search") || "";
						const handlesRaw = url.searchParams.get("handles") || "";
						const handles = handlesRaw
							.split(",")
							.map((h) => h.trim().toLowerCase())
							.filter(Boolean);

						const counts: Record<string, number> = {};

						if (search && handles.length > 0) {
							const db = getNativeDb();
							for (const handle of handles) {
								try {
									const row = db
										.prepare(
											`
											SELECT COUNT(*) as count
											FROM tweets t
											JOIN profiles p ON t.author_profile_id = p.id
											WHERE LOWER(p.handle) = ? AND t.text LIKE ?
										`,
										)
										.get(handle, `%${search}%`) as { count: number } | undefined;
									counts[handle] = row?.count ?? 0;
								} catch (err) {
									counts[handle] = 0;
								}
							}
						}

						return jsonResponse({ counts });
					}),
				),
		},
	},
});
