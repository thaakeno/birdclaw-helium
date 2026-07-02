import { createFileRoute } from "@tanstack/react-router";
import {
	jsonResponse,
	sensitiveRequestErrorResponse,
} from "#/lib/http-effect";

export const Route = createFileRoute("/api/video")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const sensitiveError = sensitiveRequestErrorResponse(request);
				if (sensitiveError) return sensitiveError;

				const requestUrl = new URL(request.url);
				const source = requestUrl.searchParams.get("url")?.trim();
				const parsed = source ? safeVideoUrl(source) : null;
				if (!parsed) {
					return jsonResponse(
						{ ok: false, message: "Unsupported video URL" },
						{ status: 400 },
					);
				}

				const headers = new Headers();
				const range = request.headers.get("range");
				if (range) headers.set("range", range);
				headers.set("user-agent", request.headers.get("user-agent") ?? "Birdclaw");

				const upstream = await fetch(parsed, { headers });
				const responseHeaders = new Headers();
				for (const key of [
					"accept-ranges",
					"content-length",
					"content-range",
					"content-type",
					"etag",
					"last-modified",
				]) {
					const value = upstream.headers.get(key);
					if (value) responseHeaders.set(key, value);
				}
				if (!responseHeaders.has("content-type")) {
					responseHeaders.set("content-type", "video/mp4");
				}
				responseHeaders.set("cache-control", "private, max-age=3600");
				responseHeaders.set("x-content-type-options", "nosniff");

				return new Response(upstream.body, {
					status: upstream.status,
					statusText: upstream.statusText,
					headers: responseHeaders,
				});
			},
		},
	},
});

function safeVideoUrl(value: string) {
	try {
		const url = new URL(value);
		if (url.protocol !== "https:") return null;
		if (url.hostname !== "video.twimg.com") return null;
		if (!/\.mp4$/i.test(url.pathname)) return null;
		return url.toString();
	} catch {
		return null;
	}
}
