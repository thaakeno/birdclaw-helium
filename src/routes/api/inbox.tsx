import { createFileRoute } from "@tanstack/react-router";
import { maybeAutoUpdateBackup } from "#/lib/backup";
import { listInboxItems } from "#/lib/inbox";
import type { InboxKind } from "#/lib/types";

function parseNumber(value: string | null) {
	if (!value) return undefined;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : undefined;
}

export const Route = createFileRoute("/api/inbox")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				await maybeAutoUpdateBackup();
				const url = new URL(request.url);
				const kind = (url.searchParams.get("kind") ?? "mixed") as InboxKind;
				return new Response(
					JSON.stringify(
						listInboxItems({
							kind: kind === "mentions" || kind === "dms" ? kind : "mixed",
							account: url.searchParams.get("account") ?? undefined,
							minScore: parseNumber(url.searchParams.get("minScore")),
							hideLowSignal: url.searchParams.get("hideLowSignal") === "1",
							limit: parseNumber(url.searchParams.get("limit")) ?? 20,
						}),
					),
					{
						headers: {
							"content-type": "application/json",
						},
					},
				);
			},
		},
	},
});
