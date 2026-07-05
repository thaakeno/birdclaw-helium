import { createFileRoute } from "@tanstack/react-router";
import { Effect } from "effect";
import { webSyncJobSchema } from "#/lib/api-contracts";
import {
	jsonResponse,
	requestJsonEffect,
	runRouteEffect,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";
import {
	getWebSyncJob,
	parseWebSyncKind,
	startWebSync,
	type WebSyncDmInbox,
	type WebSyncOptions,
} from "#/lib/web-sync";

function parseAccountId(value: unknown) {
	return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function parseDmInbox(value: unknown): WebSyncDmInbox | undefined {
	return value === "all" || value === "accepted" || value === "requests"
		? value
		: undefined;
}

function parsePositiveInteger(value: unknown, max: number) {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	if (!Number.isInteger(parsed) || parsed <= 0) return undefined;
	return Math.min(parsed, max);
}

function parseSyncOptions(kind: string, body: Record<string, unknown>) {
	const options: WebSyncOptions = {};
	const limitCap = kind === "dms" ? 200 : 100;
	const pageCap = kind === "bookmarks" || kind === "likes" ? 5 : 3;
	const limit = parsePositiveInteger(body.limit, limitCap);
	const maxPages = parsePositiveInteger(body.maxPages, pageCap);
	if (kind === "dms") {
		const inbox = parseDmInbox(body.inbox);
		if (inbox) options.inbox = inbox;
	}
	if (limit) options.limit = limit;
	if (maxPages) options.maxPages = maxPages;
	if (typeof body.allPages === "boolean") {
		options.allPages = kind === "bookmarks" || kind === "likes" ? body.allPages : false;
	}
	return options;
}

export const Route = createFileRoute("/api/sync")({
	server: {
		handlers: {
			GET: ({ request }) => {
				const denied = sensitiveRequestErrorResponse(request);
				if (denied) return denied;

				const url = new URL(request.url);
				const id = url.searchParams.get("id");
				if (!id) {
					return jsonResponse(
						{ ok: false, message: "Missing sync job id" },
						{ status: 400 },
					);
				}

				const job = getWebSyncJob(id);
				if (!job) {
					return jsonResponse(
						{ ok: false, message: "Sync job not found" },
						{ status: 404 },
					);
				}

				return jsonResponse(webSyncJobSchema.parse(job));
			},
			POST: ({ request }) =>
				runRouteEffect(
					Effect.gen(function* () {
						const denied = sensitiveRequestErrorResponse(request);
						if (denied) return denied;

						const body = yield* requestJsonEffect<Record<string, unknown>>(
							request,
							{},
						);
						const kind = parseWebSyncKind(body.kind);
						if (!kind) {
							return jsonResponse(
								{ ok: false, message: "Unknown sync kind" },
								{ status: 400 },
							);
						}

						const job = startWebSync(
							kind,
							parseAccountId(body.accountId),
							parseSyncOptions(kind, body),
						);
						return jsonResponse(webSyncJobSchema.parse(job), {
							status: job.inProgress ? 202 : 200,
						});
					}),
				),
		},
	},
});
