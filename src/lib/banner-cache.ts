import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { Effect } from "effect";
import { getBirdclawPaths } from "./config";
import { getNativeDb } from "./db";
import { runEffectPromise, tryPromise } from "./effect-runtime";
import { assertSafePreviewUrl } from "./url-safety";

const MAX_BANNER_BYTES = 10 * 1024 * 1024;
const REMOTE_BANNER_TIMEOUT_MS = 15_000;
const ALLOWED_REMOTE_BANNER_HOSTS = new Set(["pbs.twimg.com"]);

function sanitizeFileToken(value: string) {
	return value.replace(/[^a-zA-Z0-9_-]+/g, "_");
}

function getBannerCacheDir() {
	const { mediaThumbsDir } = getBirdclawPaths();
	const dir = path.join(mediaThumbsDir, "banners");
	mkdirSync(dir, { recursive: true });
	return dir;
}

function getContentTypeFromExtension(extension: string) {
	switch (extension.toLowerCase()) {
		case ".png":
			return "image/png";
		case ".webp":
			return "image/webp";
		case ".gif":
			return "image/gif";
		default:
			return "image/jpeg";
	}
}

function getExtensionFromBannerUrl(bannerUrl: string) {
	try {
		const url = new URL(bannerUrl);
		const extension = path.extname(url.pathname).toLowerCase();
		if (extension === ".png" || extension === ".webp" || extension === ".gif") {
			return extension;
		}
		return ".jpg";
	} catch {
		return ".jpg";
	}
}

function getBannerUrlForProfile(profileId: string) {
	const row = getNativeDb()
		.prepare("select banner_url from profiles where id = ?")
		.get(profileId) as { banner_url: string | null } | undefined;
	return row?.banner_url ?? null;
}

function toError(error: unknown) {
	return error instanceof Error ? error : new Error(String(error));
}

function trySync<T>(try_: () => T) {
	return Effect.try({
		try: try_,
		catch: toError,
	});
}

function assertSafeRemoteBannerUrl(bannerUrl: string) {
	const parsed = assertSafePreviewUrl(bannerUrl);
	if (parsed.protocol !== "https:") {
		throw new Error("Remote banner URL must use https");
	}
	if (!ALLOWED_REMOTE_BANNER_HOSTS.has(parsed.hostname.toLowerCase())) {
		throw new Error("Remote banner host is not allowed");
	}
	return parsed.toString();
}

function normalizeContentType(value: string | null) {
	return value?.split(";")[0]?.trim().toLowerCase() ?? "image/jpeg";
}

function detectRasterContentType(buffer: Buffer, declared: string) {
	if (
		buffer.length >= 3 &&
		buffer[0] === 0xff &&
		buffer[1] === 0xd8 &&
		buffer[2] === 0xff
	) {
		return "image/jpeg";
	}
	if (
		buffer.length >= 4 &&
		buffer[0] === 0x89 &&
		buffer[1] === 0x50 &&
		buffer[2] === 0x4e &&
		buffer[3] === 0x47
	) {
		return "image/png";
	}
	if (
		buffer.length >= 12 &&
		buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
		buffer.subarray(8, 12).toString("ascii") === "WEBP"
	) {
		return "image/webp";
	}
	if (
		buffer.length >= 6 &&
		(buffer.subarray(0, 6).toString("ascii") === "GIF87a" ||
			buffer.subarray(0, 6).toString("ascii") === "GIF89a")
	) {
		return "image/gif";
	}
	if (declared === "image/jpeg") {
		return "image/jpeg";
	}
	throw new Error("Banner response is not a supported raster image");
}

export function getBannerCachePath(profileId: string, bannerUrl: string) {
	const hash = createHash("sha1").update(bannerUrl).digest("hex");
	const extension = getExtensionFromBannerUrl(bannerUrl);

	return path.join(
		getBannerCacheDir(),
		`${sanitizeFileToken(profileId)}-${hash}${extension}`,
	);
}

function fetchRemoteBannerEffect(bannerUrl: string) {
	return Effect.gen(function* () {
		const safeUrl = yield* trySync(() => assertSafeRemoteBannerUrl(bannerUrl));
		const response = yield* tryPromise(() =>
			fetch(safeUrl, {
				headers: {
					"user-agent": "birdclaw/banner-cache",
				},
				redirect: "error",
				signal: AbortSignal.timeout(REMOTE_BANNER_TIMEOUT_MS),
			}),
		);
		if (!response.ok) {
			return yield* Effect.fail(
				new Error(`Banner fetch failed with ${response.status}`),
			);
		}

		const buffer = Buffer.from(yield* tryPromise(() => response.arrayBuffer()));
		if (buffer.byteLength > MAX_BANNER_BYTES) {
			return yield* Effect.fail(new Error("Banner response is too large"));
		}
		const contentType = yield* trySync(() =>
			detectRasterContentType(
				buffer,
				normalizeContentType(response.headers.get("content-type")),
			),
		);
		return {
			contentType,
			buffer,
			cachePath: "",
			bannerUrl,
		};
	});
}

function readArchiveBannerFallback(profileId: string) {
	const { mediaOriginalsDir } = getBirdclawPaths();
	let handle = "";
	try {
		const row = getNativeDb()
			.prepare("select handle from profiles where id = ?")
			.get(profileId) as { handle: string } | undefined;
		if (row?.handle) {
			handle = row.handle.toLowerCase();
		}
	} catch {
		// ignore
	}

	const searchDirs = [
		path.join(mediaOriginalsDir, "archive", "profile", profileId),
		...(handle ? [path.join(mediaOriginalsDir, "archive", "profile", handle)] : []),
		path.join(mediaOriginalsDir, "archive", "profile", "unknown"),
	];

	const extensions = [".jpg", ".png", ".webp", ".gif", ".jpeg"];
	for (const baseDir of searchDirs) {
		for (const ext of extensions) {
			const fullPath = path.join(baseDir, `profile-banner${ext}`);
			if (fullPath && existsSync(fullPath)) {
				try {
					const buffer = readFileSync(fullPath);
					const contentType = getContentTypeFromExtension(ext);
					return {
						buffer,
						contentType,
						cachePath: fullPath,
						bannerUrl: `archive:profile-banner:${profileId}`,
					};
				} catch {
					// ignore and try next
				}
			}
		}
	}
	return null;
}

export function readCachedBannerEffect(profileId: string) {
	return Effect.gen(function* () {
		const bannerUrl = yield* trySync(() => getBannerUrlForProfile(profileId));
		if (!bannerUrl) {
			const fallback = readArchiveBannerFallback(profileId);
			if (fallback) return fallback;
			return null;
		}

		const cachePath = yield* trySync(() =>
			getBannerCachePath(profileId, bannerUrl),
		);
		const cachedExtension = path.extname(cachePath);

		const cached = yield* trySync(() => readFileSync(cachePath)).pipe(
			Effect.map((buffer) => ({ ok: true as const, buffer })),
			Effect.catchAll(() => Effect.succeed({ ok: false as const })),
		);
		if (cached.ok) {
			return {
				buffer: cached.buffer,
				contentType: getContentTypeFromExtension(cachedExtension),
				cachePath,
				bannerUrl,
			};
		}

		const payload = yield* fetchRemoteBannerEffect(bannerUrl);

		yield* trySync(() => writeFileSync(cachePath, payload.buffer));
		return {
			buffer: payload.buffer,
			contentType: payload.contentType,
			cachePath,
			bannerUrl,
		};
	});
}

export function readCachedBanner(profileId: string) {
	return runEffectPromise(readCachedBannerEffect(profileId));
}
