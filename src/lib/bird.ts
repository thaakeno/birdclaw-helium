import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { Effect } from "effect";
import { getBirdCommand } from "./config";
import { runEffectPromise } from "./effect-runtime";
import type {
	XurlMentionData,
	XurlFollowUsersResponse,
	XurlMediaItem,
	XurlMentionsResponse,
	XurlMentionUser,
	XurlReferencedTweet,
	XurlTweetsResponse,
} from "./types";

const execFileAsync = promisify(execFile);
const BIRD_JSON_MAX_BUFFER_BYTES = 512 * 1024 * 1024;
const BIRD_STDOUT_REDIRECT_SCRIPT = 'out="$1"; shift; exec "$@" > "$out"';
const BIRD_EXEC_OPTIONS = { windowsHide: true } as const;
const DEFAULT_BIRD_COMMAND_INTERVAL_MS = 1250;

let birdCommandQueue: Promise<void> = Promise.resolve();
let lastBirdCommandFinishedAt = 0;

interface BirdTweetMedia {
	type?: string;
	url?: string;
	previewUrl?: string;
	videoUrl?: string;
	width?: number;
	height?: number;
	durationMs?: number;
	altText?: string;
	variants?: Array<{
		url?: string;
		contentType?: string;
		content_type?: string;
		bitRate?: number;
		bit_rate?: number;
	}>;
}

interface BirdTweetAuthor {
	username?: string;
	name?: string;
	profileImageUrl?: string;
}

interface BirdTweetArticle {
	title?: string;
	previewText?: string;
	coverImageUrl?: string;
}

interface BirdTweetItem {
	id: string;
	text: string;
	createdAt: string;
	replyCount?: number;
	retweetCount?: number;
	likeCount?: number;
	conversationId?: string;
	inReplyToStatusId?: string | null;
	quotedStatusId?: string | null;
	retweetedStatusId?: string | null;
	quotedTweet?: Partial<BirdTweetItem> | null;
	retweetedTweet?: { id?: string | null } | null;
	author?: BirdTweetAuthor;
	authorId?: string;
	_raw?: unknown;
	media?: BirdTweetMedia[];
	article?: BirdTweetArticle | null;
}

export interface BirdDmUser {
	id: string;
	username?: string;
	name?: string;
	profileImageUrl?: string;
}

export interface BirdDmEvent {
	id: string;
	conversationId?: string;
	text: string;
	createdAt?: string;
	senderId?: string;
	recipientId?: string;
	sender?: BirdDmUser;
	recipient?: BirdDmUser;
	inboxKind?: "accepted" | "request";
	isMessageRequest?: boolean;
}

export interface BirdDmConversation {
	id: string;
	participants: BirdDmUser[];
	messages: BirdDmEvent[];
	lastMessageAt?: string;
	lastMessagePreview?: string;
	inboxKind?: "accepted" | "request";
	isMessageRequest?: boolean;
}

export interface BirdDmsResponse {
	success: true;
	conversations: BirdDmConversation[];
	events: BirdDmEvent[];
}

export interface BirdAuthenticatedAccount {
	id?: string;
	username: string;
}

export type BirdDmRequestAction = "accept" | "reject" | "block";

export type BirdDmMutationResponse =
	| {
			success: true;
			conversationId?: string;
			userId?: string;
			username?: string;
			blockedUserId?: string;
			blockedUsername?: string;
	  }
	| {
			success: false;
			error: string;
	  };

interface BirdUserOverviewPayload {
	user?: {
		id?: string;
		username?: string;
		name?: string;
		description?: string;
		location?: string;
		url?: string;
		verified?: boolean;
		verifiedType?: string;
		verified_type?: string;
		followersCount?: number;
		followingCount?: number;
		profileImageUrl?: string;
		createdAt?: string;
		entities?: Record<string, unknown>;
		affiliation?: Record<string, unknown>;
	};
}

interface BirdProfilesPayload {
	users?: NonNullable<BirdUserOverviewPayload["user"]>[];
	errors?: Array<{ target?: string; error?: string }>;
}

type BirdFollowUsersPayload =
	| NonNullable<BirdUserOverviewPayload["user"]>[]
	| {
			users?: NonNullable<BirdUserOverviewPayload["user"]>[];
			nextCursor?: string | null;
	  };

function toIsoTimestamp(value: string) {
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) {
		return value;
	}
	return parsed.toISOString();
}

function escapeJsonStringControlChars(value: string) {
	let output = "";
	let inString = false;
	let escaped = false;

	for (const character of value) {
		if (!inString) {
			output += character;
			if (character === '"') {
				inString = true;
			}
			continue;
		}

		if (escaped) {
			output += character;
			escaped = false;
			continue;
		}

		if (character === "\\") {
			output += character;
			escaped = true;
			continue;
		}

		if (character === '"') {
			output += character;
			inString = false;
			continue;
		}

		if (character === "\n") {
			output += "\\n";
			continue;
		}
		if (character === "\r") {
			output += "\\r";
			continue;
		}
		if (character === "\t") {
			output += "\\t";
			continue;
		}
		if (character.charCodeAt(0) < 0x20) {
			output += `\\u${character.charCodeAt(0).toString(16).padStart(4, "0")}`;
			continue;
		}

		output += character;
	}

	return output;
}

function parseBirdJson(stdout: string) {
	try {
		return JSON.parse(stdout) as unknown;
	} catch (error) {
		if (!(error instanceof SyntaxError)) {
			throw error;
		}
		return JSON.parse(escapeJsonStringControlChars(stdout)) as unknown;
	}
}

function parseNonNegativeEnvInteger(value: string | undefined, fallback: number) {
	if (value === undefined || value.trim() === "") return fallback;
	const parsed = Number(value);
	if (!Number.isFinite(parsed) || parsed < 0) return fallback;
	return Math.floor(parsed);
}

function getBirdCommandIntervalMs() {
	if (process.env.VITEST || process.env.NODE_ENV === "test") {
		return parseNonNegativeEnvInteger(
			process.env.BIRDCLAW_BIRD_COMMAND_INTERVAL_MS,
			0,
		);
	}
	return parseNonNegativeEnvInteger(
		process.env.BIRDCLAW_BIRD_COMMAND_INTERVAL_MS,
		DEFAULT_BIRD_COMMAND_INTERVAL_MS,
	);
}

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function enqueueBirdCommand<T>(task: () => Promise<T>) {
	const run = birdCommandQueue
		.catch(() => undefined)
		.then(async () => {
			const minIntervalMs = getBirdCommandIntervalMs();
			const waitMs =
				minIntervalMs > 0
					? Math.max(0, lastBirdCommandFinishedAt + minIntervalMs - Date.now())
					: 0;
			if (waitMs > 0) {
				await sleep(waitMs);
			}
			try {
				return await task();
			} finally {
				lastBirdCommandFinishedAt = Date.now();
			}
		});
	birdCommandQueue = run.then(
		() => undefined,
		() => undefined,
	);
	return run;
}

function isCookieDatabaseLockError(text: string) {
	return (
		/Failed to copy Chrome cookie DB/i.test(text) &&
		/EBUSY|resource busy or locked|being used by another process/i.test(text)
	);
}

function formatBirdCommandError(error: unknown, birdCommand: string) {
	const text = [
		error instanceof Error ? error.message : "",
		error &&
		typeof error === "object" &&
		"stderr" in error &&
		typeof error.stderr === "string"
			? error.stderr
			: "",
		error &&
		typeof error === "object" &&
		"stdout" in error &&
		typeof error.stdout === "string"
			? error.stdout
			: "",
	].join("\n");
	if (
		(error instanceof Error &&
			"code" in error &&
			(error as { code?: unknown }).code === "ENOENT") ||
		(/No such file or directory|command not found|cannot execute/i.test(text) &&
			text.includes(birdCommand))
	) {
		return new Error(
			`bird command unavailable: ${birdCommand}\nInstall bird on PATH, set BIRDCLAW_BIRD_COMMAND, or update ~/.birdclaw/config.json mentions.birdCommand.`,
		);
	}
	if (/unknown command ['"]?dms['"]?/i.test(text)) {
		return new Error(
			"Live DM sync is not supported by the installed bird helper because it does not provide `bird dms`. Import an official X archive to view local DMs, or install a bird helper version that supports live DM reads.",
		);
	}
	if (isCookieDatabaseLockError(text)) {
		return new Error(
			"Bird could not read Helium's X cookies because Helium has the cookie database locked. Close Helium fully, wait a few seconds, then run the live sync/fetch again. Birdclaw stopped this request instead of retrying in a loop.",
		);
	}

	return error;
}

function isUnsupportedBirdOptionError(error: unknown, option: string) {
	if (!error || typeof error !== "object") {
		return false;
	}
	const text = [
		error instanceof Error ? error.message : "",
		"stderr" in error && typeof error.stderr === "string" ? error.stderr : "",
		"stdout" in error && typeof error.stdout === "string" ? error.stdout : "",
	].join("\n");
	return text.includes(option) && /unknown option|error:/i.test(text);
}

function makeBirdStdoutTempEffect() {
	return Effect.acquireRelease(
		Effect.sync(() => {
			const tempDir = mkdtempSync(join(tmpdir(), "birdclaw-bird-"));
			return { tempDir, stdoutPath: join(tempDir, "stdout.json") };
		}),
		({ tempDir }) =>
			Effect.sync(() => rmSync(tempDir, { recursive: true, force: true })),
	);
}

function getBirdShellCommand() {
	if (process.platform !== "win32") return "/bin/bash";
	return (
		process.env.BIRDCLAW_BASH_COMMAND?.trim() || "D:/Programs/Git/bin/bash.exe"
	);
}

export function runBirdJsonCommandEffect(args: string[], timeoutMs?: number) {
	return Effect.scoped(
		Effect.gen(function* () {
			const birdCommand = yield* Effect.try({
				try: () => getBirdCommand(),
				catch: (error) =>
					error instanceof Error ? error : new Error(String(error)),
			});
			const { stdoutPath } = yield* makeBirdStdoutTempEffect();
			yield* Effect.tryPromise({
				try: () =>
					enqueueBirdCommand(() =>
						execFileAsync(
							getBirdShellCommand(),
							[
								"-c",
								BIRD_STDOUT_REDIRECT_SCRIPT,
								"birdclaw-bird",
								stdoutPath,
								birdCommand,
								...args,
							],
							{
								...BIRD_EXEC_OPTIONS,
								maxBuffer: BIRD_JSON_MAX_BUFFER_BYTES,
								timeout: timeoutMs,
							},
						),
					),
				catch: (error) => formatBirdCommandError(error, birdCommand),
			});
			return yield* Effect.try({
				try: () => readFileSync(stdoutPath, "utf8"),
				catch: (error) => error,
			});
		}),
	);
}

function runBirdJsonCommandAllowFailureEffect(
	args: string[],
	timeoutMs?: number,
) {
	return Effect.scoped(
		Effect.gen(function* () {
			const birdCommand = yield* Effect.try({
				try: () => getBirdCommand(),
				catch: (error) =>
					error instanceof Error ? error : new Error(String(error)),
			});
			const { stdoutPath } = yield* makeBirdStdoutTempEffect();
			yield* Effect.tryPromise({
				try: () =>
					enqueueBirdCommand(() =>
						execFileAsync(
							getBirdShellCommand(),
							[
								"-c",
								BIRD_STDOUT_REDIRECT_SCRIPT,
								"birdclaw-bird",
								stdoutPath,
								birdCommand,
								...args,
							],
							{
								...BIRD_EXEC_OPTIONS,
								maxBuffer: BIRD_JSON_MAX_BUFFER_BYTES,
								timeout: timeoutMs,
							},
						),
					).catch((error: unknown) => {
						const stdout = readFileSync(stdoutPath, "utf8");
						if (stdout.trim().length > 0) {
							return { stdout: "", stderr: "" };
						}
						throw formatBirdCommandError(error, birdCommand);
					}),
				catch: (error) => error,
			});
			return yield* Effect.try({
				try: () => readFileSync(stdoutPath, "utf8"),
				catch: (error) => error,
			});
		}),
	);
}

function runBirdTweetJsonCommandEffect(args: string[], timeoutMs?: number) {
	return runBirdJsonCommandEffect([...args, "--json-full"], timeoutMs).pipe(
		Effect.catchAll((error) => {
			if (!isUnsupportedBirdOptionError(error, "--json-full")) {
				return Effect.fail(error);
			}
			return runBirdJsonCommandEffect([...args, "--json"], timeoutMs);
		}),
	);
}

function getBirdTweetItems(payload: unknown, command: string) {
	if (Array.isArray(payload)) {
		return payload as BirdTweetItem[];
	}

	if (
		payload &&
		typeof payload === "object" &&
		Array.isArray((payload as { tweets?: unknown }).tweets)
	) {
		return (payload as { tweets: BirdTweetItem[] }).tweets;
	}

	throw new Error(`bird ${command} returned unexpected JSON`);
}

function getBirdTweetItem(payload: unknown, command: string) {
	if (payload && typeof payload === "object") {
		const record = payload as { id?: unknown };
		if (typeof record.id === "string" && record.id.length > 0) {
			return payload as BirdTweetItem;
		}
	}

	throw new Error(`bird ${command} returned unexpected JSON`);
}

function toMediaEntities(item: BirdTweetItem | BirdTweetMedia[] | undefined) {
	const media = Array.isArray(item) || item === undefined ? item : item.media;
	const tweetId = Array.isArray(item) || item === undefined ? "0" : item.id;
	const includes = toMediaIncludes(media, tweetId);
	if (includes.length === 0) {
		return undefined;
	}

	return {
		urls: includes
			.filter((item) => item.url || item.preview_image_url)
			.map((item, index) => ({
				start: index,
				end: index,
				url: (item.url ?? item.preview_image_url) as string,
				expanded_url: (item.url ?? item.preview_image_url) as string,
				display_url: (item.url ?? item.preview_image_url) as string,
				media_key: item.media_key,
			})),
	};
}

function toMediaKey(tweetId: string, index: number) {
	return `bird_media_${tweetId.replace(/[^A-Za-z0-9_-]/g, "_")}_${index}`;
}

function toXurlMediaType(type: string | undefined): XurlMediaItem["type"] {
	if (type === "photo" || type === "image") return "photo";
	if (type === "animated_gif" || type === "gif") return "animated_gif";
	if (type === "video") return "video";
	return type ?? "unknown";
}

function toMediaIncludes(media: BirdTweetMedia[] | undefined, tweetId: string) {
	if (!Array.isArray(media) || media.length === 0) {
		return [];
	}
	const items: XurlMediaItem[] = [];
	for (const item of media) {
		const url = item.url?.trim();
		const preview = item.previewUrl?.trim();
		const videoUrl = item.videoUrl?.trim();
		const type = toXurlMediaType(item.type);
		if (!url && !preview && !videoUrl) continue;
		const variants = [
			...(item.variants ?? [])
				.map((variant) => {
					const variantUrl = variant.url?.trim();
					if (!variantUrl) return null;
					return {
						url: variantUrl,
						content_type:
							variant.contentType ?? variant.content_type ?? "video/mp4",
						...(Number.isFinite(Number(variant.bitRate ?? variant.bit_rate))
							? { bit_rate: Number(variant.bitRate ?? variant.bit_rate) }
							: {}),
					};
				})
				.filter((variant): variant is NonNullable<typeof variant> =>
					Boolean(variant),
				),
			...(videoUrl ? [{ url: videoUrl, content_type: "video/mp4" }] : []),
		];
		items.push({
			media_key: toMediaKey(tweetId, items.length),
			type,
			...(type === "photo" && url ? { url } : {}),
			...(type !== "photo" && (preview || url)
				? { preview_image_url: preview ?? url }
				: {}),
			...(type === "photo" && preview && preview !== url
				? { preview_image_url: preview }
				: {}),
			...(Number.isFinite(Number(item.width))
				? { width: Number(item.width) }
				: {}),
			...(Number.isFinite(Number(item.height))
				? { height: Number(item.height) }
				: {}),
			...(Number.isFinite(Number(item.durationMs))
				? { duration_ms: Number(item.durationMs) }
				: {}),
			...(item.altText ? { alt_text: item.altText } : {}),
			...(variants.length > 0 ? { variants } : {}),
		});
	}
	return items;
}

function toTweetEntities(item: BirdTweetItem) {
	const mediaEntities = toMediaEntities(item);
	const title = item.article?.title?.trim();
	if (!title) return mediaEntities;
	const handle = item.author?.username?.replace(/^@/, "");
	const url = handle
		? `https://x.com/${handle}/status/${item.id}`
		: `https://x.com/i/status/${item.id}`;
	return {
		...mediaEntities,
		article: {
			title,
			url,
			...(item.article?.previewText?.trim()
				? { previewText: item.article.previewText.trim() }
				: {}),
			...(item.article?.coverImageUrl?.trim()
				? { coverImageUrl: item.article.coverImageUrl.trim() }
				: {}),
		},
	};
}

function toReferencedTweets(
	item: BirdTweetItem,
	retweetedStatusId?: string | null,
) {
	const references: XurlReferencedTweet[] = [];
	if (typeof item.inReplyToStatusId === "string" && item.inReplyToStatusId) {
		references.push({ type: "replied_to", id: item.inReplyToStatusId });
	}

	const quotedTweetId =
		typeof item.quotedStatusId === "string" && item.quotedStatusId
			? item.quotedStatusId
			: typeof item.quotedTweet?.id === "string" && item.quotedTweet.id
				? item.quotedTweet.id
				: null;
	if (quotedTweetId) {
		references.push({ type: "quoted", id: quotedTweetId });
	}

	const retweetedTweetId =
		typeof item.retweetedStatusId === "string" && item.retweetedStatusId
			? item.retweetedStatusId
			: typeof item.retweetedTweet?.id === "string" && item.retweetedTweet.id
				? item.retweetedTweet.id
				: retweetedStatusId;
	if (retweetedTweetId) {
		references.push({ type: "retweeted", id: retweetedTweetId });
	}

	return references.length > 0 ? references : undefined;
}

function getRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === "object"
		? (value as Record<string, unknown>)
		: undefined;
}

function findGraphqlAvatarUrl(value: unknown, authorId: string) {
	const pending: unknown[] = [value];
	const seen = new Set<object>();

	while (pending.length > 0) {
		const current = pending.pop();
		const record = getRecord(current);
		if (!record || seen.has(record)) continue;
		seen.add(record);

		if (record.rest_id === authorId) {
			const avatar = getRecord(record.avatar);
			if (typeof avatar?.image_url === "string" && avatar.image_url) {
				return avatar.image_url;
			}
		}

		for (const child of Object.values(record)) {
			if (child && typeof child === "object") {
				pending.push(child);
			}
		}
	}

	return undefined;
}

function isHydratedBirdTweetItem(value: unknown): value is BirdTweetItem {
	const item = value as BirdTweetItem | undefined;
	return (
		typeof item?.id === "string" &&
		typeof item.text === "string" &&
		typeof item.createdAt === "string"
	);
}

function getQuoteCountFromRaw(raw: unknown) {
	if (!raw || typeof raw !== "object") return undefined;
	const record = raw as Record<string, any>;
	const metrics = record.public_metrics || record.legacy;
	if (!metrics || typeof metrics !== "object") return undefined;
	const count = Number(metrics.quote_count);
	return Number.isFinite(count) ? count : undefined;
}

function getViewsCountFromRaw(raw: unknown) {
	if (!raw || typeof raw !== "object") return undefined;
	const record = raw as Record<string, any>;
	const views = record.views;
	if (!views || typeof views !== "object") return undefined;
	const count = Number(views.count);
	return Number.isFinite(count) ? count : undefined;
}

function extractRetweetedStatusFromRaw(raw: unknown): BirdTweetItem | null {
	if (!raw || typeof raw !== "object") return null;
	const record = raw as Record<string, any>;
	let tweetResult = record.legacy?.retweeted_status_result?.result;
	if (!tweetResult) return null;
	if (tweetResult.__typename === "TweetWithVisibilityResults") {
		tweetResult = tweetResult.tweet;
	}
	const legacy = tweetResult.legacy;
	if (!legacy) return null;

	const restId = tweetResult.rest_id;
	if (typeof restId !== "string") return null;

	const userResult = tweetResult.core?.user_results?.result;
	let userLegacy = userResult?.legacy;
	let userCore = userResult?.core;
	let userAvatar = userResult?.avatar;
	if (userResult?.__typename === "UserWithVisibilityResults") {
		userLegacy = userResult.user?.legacy;
		userCore = userResult.user?.core;
		userAvatar = userResult.user?.avatar;
	}

	const authorId = legacy.user_id_str;
	const authorUsername = userLegacy?.screen_name ?? userCore?.screen_name;
	const authorName = userLegacy?.name ?? userCore?.name;
	const authorAvatar =
		userLegacy?.profile_image_url_https ?? userAvatar?.image_url;
	const author: BirdTweetAuthor | undefined = authorUsername || authorName || authorAvatar
		? {
				username: authorUsername,
				name: authorName,
				profileImageUrl: authorAvatar,
			}
		: undefined;

	const media: BirdTweetMedia[] = [];
	const rawMedia = legacy.extended_entities?.media || legacy.entities?.media;
	if (Array.isArray(rawMedia)) {
		for (const m of rawMedia) {
			media.push({
				type: m.type,
				url: m.media_url_https,
				previewUrl: m.media_url_https,
				videoUrl: m.video_info?.variants?.find((v: any) => v.url && v.content_type === "video/mp4")?.url,
				width: m.original_info?.width,
				height: m.original_info?.height,
				durationMs: m.video_info?.duration_millis,
				altText: m.ext_alt_text,
				variants: m.video_info?.variants?.map((v: any) => ({
					url: v.url,
					contentType: v.content_type,
					bitRate: v.bitrate,
				})),
			});
		}
	}

	return {
		id: restId,
		text: legacy.full_text ?? "",
		createdAt: legacy.created_at ?? "",
		replyCount: Number(legacy.reply_count ?? 0),
		retweetCount: Number(legacy.retweet_count ?? 0),
		likeCount: Number(legacy.favorite_count ?? 0),
		conversationId: legacy.conversation_id_str,
		inReplyToStatusId: legacy.in_reply_to_status_id_str,
		author,
		authorId,
		_raw: tweetResult,
		media,
	};
}

function normalizeBirdTweets(items: BirdTweetItem[]): XurlMentionsResponse {
	const users = new Map<string, XurlMentionUser>();
	const includedTweets = new Map<string, XurlMentionData>();
	const media = new Map<string, XurlMediaItem>();
	const normalizeItem = (
		item: BirdTweetItem,
		preserveMissingMetrics = false,
	): XurlMentionData => {
		const authorId = String(
			item.authorId ?? item.author?.username ?? "unknown",
		);
		const profileImageUrl =
			item.author?.profileImageUrl ?? findGraphqlAvatarUrl(item._raw, authorId);
		const existingUser = users.get(authorId);
		if (!existingUser) {
			users.set(authorId, {
				id: authorId,
				username: item.author?.username ?? `user_${authorId}`,
				name: item.author?.name ?? item.author?.username ?? `user_${authorId}`,
				...(profileImageUrl ? { profile_image_url: profileImageUrl } : {}),
			});
		} else if (profileImageUrl && !existingUser.profile_image_url) {
			users.set(authorId, {
				...existingUser,
				profile_image_url: profileImageUrl,
			});
		}

		if (isHydratedBirdTweetItem(item.quotedTweet)) {
			const quotedTweet = normalizeItem(item.quotedTweet, true);
			if (quotedTweet.id !== item.id) {
				includedTweets.set(quotedTweet.id, quotedTweet);
			}
		}

		const retweetedStatus = extractRetweetedStatusFromRaw(item._raw);
		if (retweetedStatus) {
			const retweetedTweet = normalizeItem(retweetedStatus, true);
			if (retweetedTweet.id !== item.id) {
				includedTweets.set(retweetedTweet.id, retweetedTweet);
			}
		}

		const itemMedia = toMediaIncludes(item.media, item.id);
		for (const mediaItem of itemMedia) {
			media.set(mediaItem.media_key, mediaItem);
		}

		const quoteCount = getQuoteCountFromRaw(item._raw);
		const viewsCount = getViewsCountFromRaw(item._raw);

		return {
			id: item.id,
			author_id: authorId,
			text: item.text,
			created_at: toIsoTimestamp(item.createdAt),
			conversation_id: item.conversationId ?? item.id,
			...(itemMedia.length > 0
				? {
						attachments: {
							media_keys: itemMedia.map((entry) => entry.media_key),
						},
					}
				: {}),
			entities: toTweetEntities(item),
			referenced_tweets: toReferencedTweets(item, retweetedStatus?.id),
			public_metrics: preserveMissingMetrics
				? {
						...(item.replyCount === undefined
							? {}
							: { reply_count: Number(item.replyCount) }),
						...(item.retweetCount === undefined
							? {}
							: { retweet_count: Number(item.retweetCount) }),
						...(item.likeCount === undefined
							? {}
							: { like_count: Number(item.likeCount) }),
						...(quoteCount === undefined ? {} : { quote_count: quoteCount }),
					}
				: {
						reply_count: Number(item.replyCount ?? 0),
						retweet_count: Number(item.retweetCount ?? 0),
						like_count: Number(item.likeCount ?? 0),
						quote_count: quoteCount ?? 0,
					},
			edit_history_tweet_ids: [item.id],
			views: viewsCount !== undefined ? { count: String(viewsCount), state: "EnabledWithCount" } : undefined,
		};
	};
	const data = items.map((item): XurlMentionData => normalizeItem(item));
	const includes: XurlMentionsResponse["includes"] = {};
	if (users.size > 0) {
		includes.users = Array.from(users.values());
	}
	if (includedTweets.size > 0) {
		includes.tweets = Array.from(includedTweets.values());
	}
	if (media.size > 0) {
		includes.media = Array.from(media.values());
	}

	return {
		data,
		includes: users.size > 0 || includedTweets.size > 0 ? includes : undefined,
		meta: {
			result_count: data.length,
			page_count: 1,
			next_token: null,
			...(data[0] ? { newest_id: data[0].id } : {}),
			...(data.at(-1) ? { oldest_id: data.at(-1)?.id } : {}),
		},
	};
}

function parseBirdJsonEffect(stdout: string) {
	return Effect.try({
		try: () => parseBirdJson(stdout),
		catch: (error) => error,
	});
}

function normalizeBirdTweetsPayloadEffect(payload: unknown, command: string) {
	return Effect.try({
		try: () => normalizeBirdTweets(getBirdTweetItems(payload, command)),
		catch: (error) => error,
	});
}

function normalizeBirdTweetItemEffect(payload: unknown, command: string) {
	return Effect.try({
		try: () => getBirdTweetItem(payload, command),
		catch: (error) => error,
	});
}

export function listMentionsViaBirdEffect({
	maxResults,
}: {
	maxResults: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const stdout = yield* runBirdTweetJsonCommandEffect([
			"mentions",
			"-n",
			String(maxResults),
		]);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, "mentions");
	});
}

export function listMentionsViaBird(options: {
	maxResults: number;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listMentionsViaBirdEffect(options));
}

function listTweetsViaBirdCommandEffect({
	command,
	maxResults,
	all,
	maxPages,
}: {
	command: "likes" | "bookmarks";
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const args = [command, "-n", String(maxResults)];
		if (all) {
			args.push("--all");
		}
		if (maxPages !== undefined) {
			args.push("--max-pages", String(maxPages));
		}
		const stdout = yield* runBirdTweetJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, command);
	});
}

export function listLikedTweetsViaBirdEffect(options: {
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return listTweetsViaBirdCommandEffect({
		command: "likes",
		...options,
	});
}

export function listLikedTweetsViaBird(options: {
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listLikedTweetsViaBirdEffect(options));
}

export function listBookmarkedTweetsViaBirdEffect(options: {
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return listTweetsViaBirdCommandEffect({
		command: "bookmarks",
		...options,
	});
}

export function listBookmarkedTweetsViaBird(options: {
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listBookmarkedTweetsViaBirdEffect(options));
}

export function listQuotesViaBirdEffect(options: {
	tweetId: string;
	all?: boolean;
	maxPages?: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const args = ["search", `quoted_tweet_id:${options.tweetId}`];
		if (options.all) {
			args.push("--all");
		}
		if (options.maxPages !== undefined) {
			args.push("--max-pages", String(options.maxPages));
		}
		const stdout = yield* runBirdTweetJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, "search");
	});
}

export function listQuotesViaBird(options: {
	tweetId: string;
	all?: boolean;
	maxPages?: number;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listQuotesViaBirdEffect(options));
}

export function searchTweetsViaBirdEffect(
	query: string,
	options: {
		maxResults: number;
		all?: boolean;
		maxPages?: number;
	},
): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const args = ["search", query, "-n", String(options.maxResults)];
		if (options.all) {
			args.push("--all");
		}
		if (options.all && options.maxPages !== undefined) {
			args.push("--max-pages", String(options.maxPages));
		}
		const stdout = yield* runBirdTweetJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, "search");
	});
}

export function searchTweetsViaBird(
	query: string,
	options: {
		maxResults: number;
		all?: boolean;
		maxPages?: number;
	},
): Promise<XurlMentionsResponse> {
	return runEffectPromise(searchTweetsViaBirdEffect(query, options));
}

export function lookupTweetsByIdsViaBirdEffect(
	ids: string[],
): Effect.Effect<XurlTweetsResponse, unknown> {
	if (ids.length === 0) {
		return Effect.succeed({ data: [] });
	}

	return Effect.gen(function* () {
		const tweets = yield* Effect.forEach(
			ids,
			(id) =>
				Effect.gen(function* () {
					const stdout = yield* runBirdTweetJsonCommandEffect(["read", id]);
					const payload = yield* parseBirdJsonEffect(stdout);
					return yield* normalizeBirdTweetItemEffect(payload, "read");
				}),
			{ concurrency: "unbounded" },
		);
		return normalizeBirdTweets(tweets);
	});
}

export function lookupTweetsByIdsViaBird(
	ids: string[],
): Promise<XurlTweetsResponse> {
	return runEffectPromise(lookupTweetsByIdsViaBirdEffect(ids));
}

export function listHomeTimelineViaBirdEffect({
	maxResults,
	following = true,
}: {
	maxResults: number;
	following?: boolean;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const args = ["home", "-n", String(maxResults)];
		if (following) {
			args.push("--following");
		}
		const stdout = yield* runBirdTweetJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, "home");
	});
}

export function listHomeTimelineViaBird(options: {
	maxResults: number;
	following?: boolean;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listHomeTimelineViaBirdEffect(options));
}

export function listUserTweetsViaBirdEffect({
	handle,
	maxResults,
	maxPages,
	delayMs,
}: {
	handle: string;
	maxResults: number;
	all?: boolean;
	maxPages?: number;
	delayMs?: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const args = ["user-tweets", handle, "-n", String(maxResults)];
		if (maxPages !== undefined) {
			args.push("--max-pages", String(maxPages));
		}
		if (delayMs !== undefined) {
			args.push("--delay", String(Math.max(0, Math.floor(delayMs))));
		}
		const stdout = yield* runBirdTweetJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, "user-tweets");
	});
}

export function listUserTweetsViaBird(options: {
	handle: string;
	maxResults: number;
	all?: boolean;
	maxPages?: number;
	delayMs?: number;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listUserTweetsViaBirdEffect(options));
}

function normalizeBirdFollowUsers(
	payload: unknown,
	command: "followers" | "following",
	maxResults: number,
): XurlFollowUsersResponse {
	const rawPayload = payload as BirdFollowUsersPayload;
	const users = Array.isArray(rawPayload) ? rawPayload : rawPayload.users;
	if (!Array.isArray(users)) {
		throw new Error(`bird ${command} returned unexpected JSON`);
	}

	const data = users
		.map(toXurlMentionUser)
		.filter((user): user is XurlMentionUser => Boolean(user));
	const nextToken =
		!Array.isArray(rawPayload) && typeof rawPayload.nextCursor === "string"
			? rawPayload.nextCursor
			: null;

	return {
		data,
		meta: {
			result_count: data.length,
			page_count:
				data.length > 0 ? Math.max(1, Math.ceil(data.length / maxResults)) : 1,
			next_token: nextToken,
		},
	};
}

function normalizeBirdFollowUsersEffect(
	payload: unknown,
	command: "followers" | "following",
	maxResults: number,
) {
	return Effect.try({
		try: () => normalizeBirdFollowUsers(payload, command, maxResults),
		catch: (error) => error,
	});
}

export function listFollowUsersViaBirdEffect({
	direction,
	userId,
	maxResults,
	all,
	maxPages,
}: {
	direction: "followers" | "following";
	userId?: string;
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Effect.Effect<XurlFollowUsersResponse, unknown> {
	return Effect.gen(function* () {
		const args = [direction, "-n", String(maxResults), "--json"];
		if (userId) {
			args.push("--user", userId);
		}
		if (all) {
			args.push("--all");
		}
		if (maxPages !== undefined) {
			args.push("--max-pages", String(maxPages));
		}
		const stdout = yield* runBirdJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdFollowUsersEffect(
			payload,
			direction,
			maxResults,
		);
	});
}

export function listFollowUsersViaBird(options: {
	direction: "followers" | "following";
	userId?: string;
	maxResults: number;
	all?: boolean;
	maxPages?: number;
}): Promise<XurlFollowUsersResponse> {
	return runEffectPromise(listFollowUsersViaBirdEffect(options));
}

export function listThreadViaBirdEffect({
	tweetId,
	all,
	maxPages,
	timeoutMs,
}: {
	tweetId: string;
	all?: boolean;
	maxPages?: number;
	timeoutMs?: number;
}): Effect.Effect<XurlMentionsResponse, unknown> {
	return Effect.gen(function* () {
		const args = ["thread", tweetId];
		if (all) {
			args.push("--all");
		}
		if (maxPages !== undefined) {
			args.push("--max-pages", String(maxPages));
		}
		const stdout = yield* runBirdTweetJsonCommandEffect(args, timeoutMs);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdTweetsPayloadEffect(payload, "thread");
	});
}

export function listThreadViaBird(options: {
	tweetId: string;
	all?: boolean;
	maxPages?: number;
	timeoutMs?: number;
}): Promise<XurlMentionsResponse> {
	return runEffectPromise(listThreadViaBirdEffect(options));
}

function normalizeBirdDmsPayloadEffect(payload: unknown) {
	return Effect.try({
		try: () => {
			if (
				!payload ||
				typeof payload !== "object" ||
				(payload as { success?: unknown }).success !== true ||
				!Array.isArray(
					(payload as { conversations?: unknown }).conversations,
				) ||
				!Array.isArray((payload as { events?: unknown }).events)
			) {
				throw new Error("bird dms returned unexpected JSON");
			}

			return payload as BirdDmsResponse;
		},
		catch: (error) => error,
	});
}

function parseBirdWhoami(stdout: string): BirdAuthenticatedAccount {
	const usernameMatch = stdout.match(/@([A-Za-z0-9_]{1,15})\b/);
	if (!usernameMatch?.[1]) {
		throw new Error("bird whoami did not report an authenticated username");
	}
	const id = stdout
		.split(/\r?\n/)
		.map((line) => line.trim())
		.map((line) => {
			const labeled = line.match(/(?:🪪|user_?id:?)[^\d]*(\d{2,})/i);
			if (labeled?.[1]) {
				return labeled[1];
			}
			if (/[A-Za-z@]/.test(line)) {
				return undefined;
			}
			return line.match(/^\D*(\d{2,})\D*$/)?.[1];
		})
		.find((value): value is string => Boolean(value));
	return {
		username: usernameMatch[1],
		...(id ? { id } : {}),
	};
}

export function getAuthenticatedBirdAccountEffect(): Effect.Effect<
	BirdAuthenticatedAccount,
	unknown
> {
	return Effect.gen(function* () {
		const stdout = yield* runBirdJsonCommandEffect(["whoami"]);
		return yield* Effect.try({
			try: () => parseBirdWhoami(stdout),
			catch: (error) => error,
		});
	});
}

export function getAuthenticatedBirdAccount(): Promise<BirdAuthenticatedAccount> {
	return runEffectPromise(getAuthenticatedBirdAccountEffect());
}

export function listDirectMessagesViaBirdEffect({
	maxResults,
	inbox = "all",
	maxPages,
	allPages = false,
	pageDelayMs,
}: {
	maxResults: number;
	inbox?: "all" | "accepted" | "requests";
	maxPages?: number;
	allPages?: boolean;
	pageDelayMs?: number;
}): Effect.Effect<BirdDmsResponse, unknown> {
	return Effect.gen(function* () {
		const args = ["dms", "-n", String(maxResults), "--json"];
		if (inbox !== "all") {
			args.push("--inbox", inbox);
		}
		if (allPages) {
			args.push("--all-pages");
		} else if (typeof maxPages === "number") {
			args.push("--max-pages", String(maxPages));
		}
		if (typeof pageDelayMs === "number" && pageDelayMs > 0) {
			args.push("--page-delay-ms", String(pageDelayMs));
		}
		const stdout = yield* runBirdJsonCommandEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		return yield* normalizeBirdDmsPayloadEffect(payload);
	});
}

export function listDirectMessagesViaBird(options: {
	maxResults: number;
	inbox?: "all" | "accepted" | "requests";
	maxPages?: number;
	allPages?: boolean;
	pageDelayMs?: number;
}): Promise<BirdDmsResponse> {
	return runEffectPromise(listDirectMessagesViaBirdEffect(options));
}

export function runDirectMessageRequestMutationViaBirdEffect({
	action,
	conversationId,
	maxPages,
	allPages = false,
}: {
	action: BirdDmRequestAction;
	conversationId: string;
	maxPages?: number;
	allPages?: boolean;
}): Effect.Effect<BirdDmMutationResponse, unknown> {
	return Effect.gen(function* () {
		const command =
			action === "accept"
				? "dm-accept"
				: action === "reject"
					? "dm-reject"
					: "dm-block";
		const args = [command, conversationId, "--json"];
		if (action === "block") {
			if (allPages) {
				args.push("--all-pages");
			} else if (typeof maxPages === "number") {
				args.push("--max-pages", String(maxPages));
			}
		}
		const stdout = yield* runBirdJsonCommandAllowFailureEffect(args);
		const payload = yield* parseBirdJsonEffect(stdout);
		if (
			payload &&
			typeof payload === "object" &&
			typeof (payload as { success?: unknown }).success === "boolean"
		) {
			return payload as BirdDmMutationResponse;
		}
		throw new Error(`bird ${command} returned unexpected JSON`);
	});
}

export function runDirectMessageRequestMutationViaBird(options: {
	action: BirdDmRequestAction;
	conversationId: string;
	maxPages?: number;
	allPages?: boolean;
}): Promise<BirdDmMutationResponse> {
	return runEffectPromise(
		runDirectMessageRequestMutationViaBirdEffect(options),
	);
}

export function lookupProfileViaBirdEffect(
	usernameOrId: string,
): Effect.Effect<XurlMentionUser | null, unknown> {
	return Effect.gen(function* () {
		const target = usernameOrId.trim().replace(/^@/, "");
		if (!target) {
			return null;
		}

		const stdout = yield* runBirdJsonCommandEffect([
			"user",
			target,
			"--json",
			"--profile-only",
		]).pipe(
			Effect.catchAll((error) => {
				if (!isUnsupportedBirdOptionError(error, "--profile-only")) {
					return Effect.fail(error);
				}
				return runBirdJsonCommandEffect([
					"user",
					target,
					"--json",
					"--count",
					"1",
				]);
			}),
		);
		const payload = (yield* parseBirdJsonEffect(
			stdout,
		)) as BirdUserOverviewPayload;
		return toXurlMentionUser(payload.user);
	});
}

export function lookupProfileViaBird(
	usernameOrId: string,
): Promise<XurlMentionUser | null> {
	return runEffectPromise(lookupProfileViaBirdEffect(usernameOrId));
}

function toXurlMentionUser(
	user: BirdUserOverviewPayload["user"],
): XurlMentionUser | null {
	if (!user?.id || !user.username) {
		return null;
	}

	return {
		id: String(user.id),
		username: String(user.username).replace(/^@/, ""),
		name: String(user.name ?? user.username),
		description:
			typeof user.description === "string" ? user.description : undefined,
		location: typeof user.location === "string" ? user.location : undefined,
		url: typeof user.url === "string" ? user.url : undefined,
		verified: typeof user.verified === "boolean" ? user.verified : undefined,
		verified_type:
			typeof user.verifiedType === "string"
				? user.verifiedType
				: typeof user.verified_type === "string"
					? user.verified_type
					: undefined,
		profile_image_url:
			typeof user.profileImageUrl === "string"
				? user.profileImageUrl
				: undefined,
		entities:
			user.entities && typeof user.entities === "object"
				? user.entities
				: undefined,
		affiliation:
			user.affiliation && typeof user.affiliation === "object"
				? user.affiliation
				: undefined,
		created_at: typeof user.createdAt === "string" ? user.createdAt : undefined,
		public_metrics: {
			followers_count: Number(user.followersCount ?? 0),
			following_count: Number(user.followingCount ?? 0),
		},
	};
}

export function lookupProfilesViaBirdEffect(
	usernameOrIds: string[],
): Effect.Effect<
	Array<{ target: string; user: XurlMentionUser | null; error?: string }>,
	unknown
> {
	const targets = Array.from(
		new Set(
			usernameOrIds
				.map((target) => target.trim().replace(/^@/, ""))
				.filter((target) => target.length > 0),
		),
	);
	if (targets.length === 0) {
		return Effect.succeed([]);
	}

	return runBirdJsonCommandEffect(["profiles", ...targets, "--json"]).pipe(
		Effect.flatMap((stdout) =>
			Effect.gen(function* () {
				const payload = (yield* parseBirdJsonEffect(
					stdout,
				)) as BirdProfilesPayload;
				const users = (payload.users ?? [])
					.map(toXurlMentionUser)
					.filter((user): user is XurlMentionUser => Boolean(user));
				const byTarget = new Map<string, XurlMentionUser>();
				for (const user of users) {
					byTarget.set(String(user.id), user);
					byTarget.set(user.username.toLowerCase(), user);
				}
				const errors = new Map(
					(payload.errors ?? []).map((item) => [
						String(item.target ?? "")
							.replace(/^@/, "")
							.toLowerCase(),
						item.error ?? "Unknown error",
					]),
				);
				return targets.map((target) => ({
					target,
					user: byTarget.get(target.toLowerCase()) ?? null,
					...(errors.has(target.toLowerCase())
						? { error: errors.get(target.toLowerCase()) }
						: {}),
				}));
			}),
		),
		Effect.catchAll((error) => {
			if (!isUnsupportedBirdOptionError(error, "profiles")) {
				return Effect.fail(error);
			}
			return Effect.forEach(
				targets,
				(target) =>
					lookupProfileViaBirdEffect(target).pipe(
						Effect.map((user) => ({ target, user })),
						Effect.catchAll((lookupError) =>
							Effect.succeed({
								target,
								user: null,
								error:
									lookupError instanceof Error
										? lookupError.message
										: String(lookupError),
							}),
						),
					),
				{ concurrency: "unbounded" },
			);
		}),
	);
}

export function lookupProfilesViaBird(
	usernameOrIds: string[],
): Promise<
	Array<{ target: string; user: XurlMentionUser | null; error?: string }>
> {
	return runEffectPromise(lookupProfilesViaBirdEffect(usernameOrIds));
}

export const __test__ = {
	toIsoTimestamp,
	escapeJsonStringControlChars,
	parseBirdJson,
	formatBirdCommandError,
	isUnsupportedBirdOptionError,
	getBirdTweetItems,
	getBirdTweetItem,
	toMediaEntities,
	toTweetEntities,
	toReferencedTweets,
	normalizeBirdTweets,
};
