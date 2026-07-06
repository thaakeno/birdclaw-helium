import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
	BookmarkCheck,
	CheckCircle2,
	Circle,
	Copy,
	ExternalLink,
	Eye,
	Heart,
	MessageCircle,
	MoreHorizontal,
	Quote,
	RefreshCw,
	Repeat2,
	Share,
	UserSearch,
} from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { queryKeys } from "#/lib/query-client";
import { formatCompactNumber } from "#/lib/present";
import {
	isTweetArticleUrlEntity,
	normalizeTweetUrlEntityRangeForText,
} from "#/lib/tweet-render";
import type {
	EmbeddedTweet,
	TimelineItem,
	TweetEntities,
	TweetMediaItem,
	TweetUrlEntity,
} from "#/lib/types";
import { useConversationSurface } from "#/lib/conversation-surface";
import {
	cx,
	embeddedCardClass,
	feedActionButtonClass,
	feedActionIconClass,
	feedActionIconWrapClass,
	feedRowActionsClass,
	feedRowBodyClass,
	feedRowClass,
	feedRowDotClass,
	feedRowHandleClass,
	feedRowNameClass,
	feedRowStatePillActiveClass,
	feedRowStatePillClass,
	feedRowStatePillOpenClass,
	feedRowTextClass,
	feedRowTimestampClass,
} from "#/lib/ui";
import { AvatarChip } from "./AvatarChip";
import { ConversationThread } from "./ConversationThread";
import { QuotesThread } from "./QuotesThread";
import { EmbeddedTweetCard } from "./EmbeddedTweetCard";
import { LinkPreviewCard } from "./LinkPreviewCard";
import { ProfilePreview } from "./ProfilePreview";
import { SmartTimestamp } from "./SmartTimestamp";
import { TweetArticleCard } from "./TweetArticleCard";
import { TweetMediaGrid } from "./TweetMediaGrid";
import { TweetRichText } from "./TweetRichText";

function comparableUrl(value: string | null | undefined) {
	if (!value) return null;
	try {
		const parsed = new URL(value);
		return `${parsed.protocol}//${parsed.hostname}${parsed.pathname}`;
	} catch {
		return value.split("?")[0] ?? value;
	}
}

function getMediaUrlSet(media: TweetMediaItem[]) {
	const urls = new Set<string>();
	for (const item of media) {
		for (const url of [item.url, item.thumbnailUrl]) {
			const comparable = comparableUrl(url);
			if (comparable) urls.add(comparable);
		}
	}
	return urls;
}

function isMediaUrlEntity(
	entry: TweetUrlEntity,
	mediaUrls: Set<string>,
	tweetId: string,
) {
	if (mediaUrls.size > 0 && isOwnStatusMediaUrl(entry.expandedUrl, tweetId)) {
		return true;
	}
	for (const url of [entry.url, entry.expandedUrl, entry.displayUrl]) {
		const comparable = comparableUrl(url);
		if (comparable && mediaUrls.has(comparable)) {
			return true;
		}
	}
	return false;
}

function isShortUrl(value: string | null | undefined) {
	if (!value) return false;
	try {
		const candidate = value.includes("://") ? value : `https://${value}`;
		const parsed = new URL(candidate);
		return parsed.hostname.replace(/^www\./, "") === "t.co";
	} catch {
		return false;
	}
}

function isUnresolvedShortUrlEntity(entry: TweetUrlEntity) {
	if (isShortUrl(entry.expandedUrl)) return true;
	if (entry.expandedUrl) return false;
	if (isShortUrl(entry.displayUrl)) return true;
	return !entry.displayUrl && isShortUrl(entry.url);
}

function isTrailingUnresolvedShortUrlEntity(
	entry: TweetUrlEntity,
	text: string,
) {
	if (!isUnresolvedShortUrlEntity(entry)) return false;
	const range = normalizeTweetUrlEntityRangeForText(text, entry);
	const trailingText = text.slice(range.end).trim();
	return trailingText.length === 0;
}

function unresolvedShortUrlRanges(text: string, entities: TweetEntities) {
	return (entities.urls ?? [])
		.filter(isUnresolvedShortUrlEntity)
		.map((entry) => normalizeTweetUrlEntityRangeForText(text, entry));
}

function textOutsideRanges(
	text: string,
	ranges: Array<{ start: number; end: number }>,
) {
	let cursor = 0;
	let output = "";
	for (const range of [...ranges].sort(
		(left, right) => left.start - right.start,
	)) {
		if (
			range.start < cursor ||
			range.end <= range.start ||
			range.end > text.length
		) {
			continue;
		}
		output += text.slice(cursor, range.start);
		cursor = range.end;
	}
	output += text.slice(cursor);
	return output;
}

function shouldHideUnresolvedShortUrls(
	text: string,
	entities: TweetEntities,
	mediaUrls: Set<string>,
) {
	if (mediaUrls.size === 0) return false;
	const ranges = unresolvedShortUrlRanges(text, entities);
	if (ranges.length === 0) return false;
	return textOutsideRanges(text, ranges).trim().length === 0;
}

function isOwnStatusMediaUrl(
	value: string | null | undefined,
	tweetId: string,
) {
	if (!value) return false;
	try {
		const parsed = new URL(value);
		const host = parsed.hostname.replace(/^www\./, "");
		if (host !== "x.com" && host !== "twitter.com") return false;
		const segments = parsed.pathname.split("/").filter(Boolean);
		const statusIndex = segments.indexOf("status");
		if (statusIndex < 0 || segments[statusIndex + 1] !== tweetId) {
			return false;
		}
		const mediaSegment = segments[statusIndex + 2];
		return mediaSegment === "photo" || mediaSegment === "video";
	} catch {
		return false;
	}
}

function getVisibleEntities(
	entities: TweetEntities,
	media: TweetMediaItem[],
	tweetId: string,
	text: string,
) {
	const mediaUrls = getMediaUrlSet(media);
	if (mediaUrls.size === 0) return entities;
	const hideUnresolvedShortUrls = shouldHideUnresolvedShortUrls(
		text,
		entities,
		mediaUrls,
	);
	return {
		...entities,
		urls: (entities.urls ?? []).filter(
			(entry) =>
				!isMediaUrlEntity(entry, mediaUrls, tweetId) &&
				!(hideUnresolvedShortUrls && isUnresolvedShortUrlEntity(entry)) &&
				!isTrailingUnresolvedShortUrlEntity(entry, text),
		),
	};
}

function getHiddenMediaUrlRanges(
	entities: TweetEntities,
	media: TweetMediaItem[],
	tweetId: string,
	text: string,
) {
	const mediaUrls = getMediaUrlSet(media);
	if (mediaUrls.size === 0) return [];
	const hideUnresolvedShortUrls = shouldHideUnresolvedShortUrls(
		text,
		entities,
		mediaUrls,
	);
	return (entities.urls ?? [])
		.filter(
			(entry) =>
				isMediaUrlEntity(entry, mediaUrls, tweetId) ||
				(hideUnresolvedShortUrls && isUnresolvedShortUrlEntity(entry)) ||
				isTrailingUnresolvedShortUrlEntity(entry, text),
		)
		.map((entry) => normalizeTweetUrlEntityRangeForText(text, entry));
}

function getVisibleUrlCards(
	entities: TweetEntities,
	quotedTweetId: string | null,
) {
	return (entities.urls ?? []).filter((entry) => {
		if (isUnresolvedShortUrlEntity(entry)) return false;
		if (entities.article && isTweetArticleUrlEntity(entry, entities.article)) {
			return false;
		}
		if (!quotedTweetId) return true;
		return !entry.expandedUrl.includes(quotedTweetId);
	});
}

function isInteractiveTarget(target: EventTarget | null) {
	return (
		target instanceof Element &&
		Boolean(target.closest("a,button,input,textarea,select,[role='button']"))
	);
}

function TweetPresentation({
	tweet,
	hiddenUrlRanges,
	onHydrateVideo,
	visibleUrlCards,
	viewerAside,
	replyToTweet,
	quotedTweet,
}: {
	tweet: TimelineItem | EmbeddedTweet;
	hiddenUrlRanges: Array<{ start: number; end: number }>;
	onHydrateVideo?: () => Promise<void> | void;
	visibleUrlCards: TweetUrlEntity[];
	viewerAside?: ReactNode;
	replyToTweet?: EmbeddedTweet | null;
	quotedTweet?: EmbeddedTweet | null;
}) {
	return (
		<>
			<TweetRichText
				className={feedRowTextClass}
				entities={tweet.entities}
				hiddenUrlRanges={hiddenUrlRanges}
				text={tweet.text}
			/>
			<TweetMediaGrid
				items={tweet.media}
				onHydrateVideo={onHydrateVideo}
				postUrl={tweetUrl(tweet)}
				viewerAside={viewerAside ?? <MediaViewerTweetAside tweet={tweet} />}
			/>
			{tweet.entities.article ? (
				<TweetArticleCard article={tweet.entities.article} />
			) : null}
			{replyToTweet ? (
				<div className={embeddedCardClass}>
					<EmbeddedTweetCard item={replyToTweet} label="In reply to" />
				</div>
			) : null}
			{quotedTweet ? (
				<div className={embeddedCardClass}>
					<EmbeddedTweetCard item={quotedTweet} label="Quoted tweet" />
				</div>
			) : null}
			{visibleUrlCards.map((entry, index) => (
				<LinkPreviewCard
					key={`${entry.expandedUrl}-${String(index)}`}
					entry={entry}
					index={index}
				/>
			))}
		</>
	);
}

function MediaViewerTweetAside({
	anchorId,
	error,
	loading,
	threadItems,
	tweet,
}: {
	anchorId?: string;
	error?: string | null;
	loading?: boolean;
	threadItems?: EmbeddedTweet[];
	tweet: TimelineItem | EmbeddedTweet;
}) {
	const showThread =
		Boolean(loading) || Boolean(error) || (threadItems?.length ?? 0) > 1;

	return (
		<div className="flex min-h-full flex-col">
			<div className="flex gap-3 border-b border-[var(--line)] px-4 py-4">
				<AvatarChip
					avatarUrl={tweet.author.avatarUrl}
					hue={tweet.author.avatarHue}
					name={tweet.author.displayName}
					profileId={tweet.author.id}
				/>
				<div className="min-w-0 flex-1">
					<header className="flex min-w-0 items-center gap-1.5 text-[15px]">
						<ProfilePreview profile={tweet.author}>
							<span className="flex min-w-0 items-center gap-1.5">
								<span className={feedRowNameClass}>
									{tweet.author.displayName}
								</span>
								<span className={feedRowHandleClass}>
									@{tweet.author.handle}
								</span>
							</span>
						</ProfilePreview>
						<span className={feedRowDotClass}>Â·</span>
						<SmartTimestamp
							className={feedRowTimestampClass}
							value={tweet.createdAt}
						/>
					</header>
					<TweetRichText
						className="mt-1 whitespace-pre-wrap break-words text-[15px] leading-[1.45] text-[var(--ink)] [overflow-wrap:anywhere]"
						entities={tweet.entities}
						text={tweet.text}
					/>
					<a
						className="mt-3 inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5 text-[13px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]"
						href={tweetUrl(tweet)}
						rel="noreferrer"
						target="_blank"
					>
						<ExternalLink className="size-4" strokeWidth={1.9} />
						Open on X
					</a>
				</div>
			</div>
			{showThread && anchorId ? (
				<div className="border-b border-[var(--line)] px-3 py-3">
					<ConversationThread
						anchorId={anchorId}
						error={error}
						items={threadItems ?? []}
						loading={Boolean(loading)}
					/>
				</div>
			) : null}
		</div>
	);
}

function tweetUrl(tweet: TimelineItem | EmbeddedTweet) {
	const handle = tweet.author.handle?.trim().replace(/^@/, "");
	return handle
		? `https://x.com/${handle}/status/${tweet.id}`
		: `https://x.com/i/status/${tweet.id}`;
}

export function TimelineCard({
	item,
	onReply: _onReply,
	showReplyControls = true,
}: {
	item: TimelineItem;
	onReply: (tweetId: string) => void;
	showReplyControls?: boolean;
}) {
	const queryClient = useQueryClient();
	const [threadSyncState, setThreadSyncState] = useState<
		"idle" | "syncing" | "error"
	>("idle");
	const [mediaSyncState, setMediaSyncState] = useState<
		"idle" | "syncing" | "error"
	>("idle");
	const [contextMenu, setContextMenu] = useState<{
		x: number;
		y: number;
	} | null>(null);
	const [activeExpandedTab, setActiveExpandedTab] = useState<"replies" | "quotes">("replies");
	const displayTweet = item.retweetedTweet ?? item;
	const displayTweetId = displayTweet.id;
	const unresolvedRetweet =
		Boolean(item.retweetedTweet) && displayTweetId === `${item.id}:retweeted`;
	const canReply =
		showReplyControls &&
		!unresolvedRetweet &&
		item.kind !== "like" &&
		item.kind !== "bookmark";
	const interactionTweetId =
		item.retweetedTweet && !unresolvedRetweet ? displayTweetId : item.id;
	const displayAuthor = displayTweet.author;
	const displayTweetUrl = unresolvedRetweet ? tweetUrl(item) : tweetUrl(displayTweet);
	const conversation = useConversationSurface(item.id, interactionTweetId);
	const visibleEntities = getVisibleEntities(
		displayTweet.entities,
		displayTweet.media,
		displayTweet.id,
		displayTweet.text,
	);
	const hiddenMediaUrlRanges = getHiddenMediaUrlRanges(
		displayTweet.entities,
		displayTweet.media,
		displayTweet.id,
		displayTweet.text,
	);
	const visibleUrlCards = getVisibleUrlCards(
		visibleEntities,
		item.retweetedTweet ? null : (item.quotedTweet?.id ?? null),
	);
	const displayIsReplied = displayTweet.isReplied ?? item.isReplied;
	const displayReplyCount =
		displayTweet.replyCount ?? item.replyCount ?? item.localReplyCount ?? 0;
	const displayLocalReplyCount =
		displayTweet.localReplyCount ?? item.localReplyCount ?? 0;
	const displayLikeCount = displayTweet.likeCount ?? item.likeCount;
	const displayRetweetCount = displayTweet.retweetCount ?? item.retweetCount ?? 0;
	const displayBookmarked = displayTweet.bookmarked ?? item.bookmarked;
	const displayLiked = displayTweet.liked ?? item.liked;
	const displayQuoteCount = displayTweet.quoteCount ?? item.quoteCount ?? 0;
	const displayViewsCount = displayTweet.viewsCount ?? item.viewsCount ?? 0;
	const canFetchConversation = !unresolvedRetweet;
	const hasConversation = canFetchConversation && Boolean(
		item.retweetedTweet
			? displayTweet.replyToId
			: item.replyToTweet || item.replyToId,
	);
	const syncThread = async () => {
		if (!canFetchConversation) return;
		setThreadSyncState("syncing");
		try {
			const response = await fetch("/api/thread-sync", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					tweetId: interactionTweetId,
					accountId: item.accountId,
					maxPages: 3,
					timeoutMs: 20_000,
				}),
			});
			if (!response.ok) {
				throw new Error("Thread sync failed");
			}
			const payload = (await response.json()) as { ok?: boolean };
			if (!payload.ok) {
				throw new Error("Thread sync failed");
			}
			await conversation.refresh();
			await queryClient.invalidateQueries({ queryKey: queryKeys.timelines });
			if (!conversation.isOpen) {
				conversation.toggle();
			}
			setThreadSyncState("idle");
		} catch {
			setThreadSyncState("error");
		}
	};
	const hydrateTweetMedia = async () => {
		if (mediaSyncState === "syncing") return;
		setMediaSyncState("syncing");
		try {
			const response = await fetch("/api/tweet-sync", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					tweetId: interactionTweetId,
					accountId: item.accountId,
				}),
			});
			if (!response.ok) {
				throw new Error("Tweet sync failed");
			}
			const payload = (await response.json()) as { ok?: boolean };
			if (!payload.ok) {
				throw new Error("Tweet sync failed");
			}
			await queryClient.invalidateQueries({ queryKey: queryKeys.timelines });
			setMediaSyncState("idle");
		} catch {
			setMediaSyncState("error");
		}
	};
	return (
		<article
			className={cx(
				feedRowClass,
				"cursor-pointer [content-visibility:auto] [contain-intrinsic-size:auto_280px]",
			)}
			data-perf="timeline-card"
			onContextMenu={(event) => {
				event.preventDefault();
				setContextMenu({ x: event.clientX, y: event.clientY });
			}}
			onClick={(event) => {
				if (isInteractiveTarget(event.target)) return;
				if (!canFetchConversation) return;
				conversation.toggle();
			}}
		>
			<AvatarChip
				avatarUrl={displayAuthor.avatarUrl}
				hue={displayAuthor.avatarHue}
				name={displayAuthor.displayName}
				profileId={displayAuthor.id}
			/>
			<div className={feedRowBodyClass}>
				{item.retweetedTweet ? (
					<div className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ink-soft)]">
						<Repeat2 className="size-4" strokeWidth={1.8} />
						<ProfilePreview profile={item.author}>
							<span>{item.author.displayName} reposted</span>
						</ProfilePreview>
					</div>
				) : null}
				<div className="flex items-start justify-between gap-2 min-w-0">
					<header className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px]">
						<ProfilePreview profile={displayAuthor}>
							<span className="flex min-w-0 items-center gap-1.5">
								<span className={feedRowNameClass}>
									{displayAuthor.displayName}
								</span>
								<span className={feedRowHandleClass}>
									@{displayAuthor.handle}
								</span>
							</span>
						</ProfilePreview>
						<span className={feedRowDotClass}>·</span>
						<SmartTimestamp
							className={feedRowTimestampClass}
							value={displayTweet.createdAt}
						/>
					</header>
					<div className="flex items-center gap-1 shrink-0">
						{hasConversation ? (
							<span
								aria-label="Part of a conversation"
								className={cx(
									feedRowStatePillClass,
									feedRowStatePillActiveClass,
								)}
								title="Part of a conversation"
							>
								<MessageCircle className="size-3.5" strokeWidth={2} />
								thread
							</span>
						) : null}
						{canReply ? (
							<span
								aria-label={displayIsReplied ? "We replied" : "Reply open"}
								className={cx(
									feedRowStatePillClass,
									displayIsReplied
										? feedRowStatePillActiveClass
										: feedRowStatePillOpenClass,
								)}
								title={displayIsReplied ? "We replied" : "Reply open"}
							>
								{displayIsReplied ? (
									<CheckCircle2 className="size-3.5" strokeWidth={2} />
								) : (
									<Circle className="size-3" strokeWidth={2.2} />
								)}
								{displayIsReplied ? "replied" : null}
							</span>
						) : null}
						<button
							aria-label="More actions"
							className="grid size-8 place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
							onClick={(event) => {
								event.stopPropagation();
								setContextMenu({
									x: event.currentTarget.getBoundingClientRect().right - 248,
									y: event.currentTarget.getBoundingClientRect().bottom + 8,
								});
							}}
							type="button"
						>
							<MoreHorizontal className="size-5" strokeWidth={2} />
						</button>
					</div>
				</div>
				<TweetPresentation
					hiddenUrlRanges={hiddenMediaUrlRanges}
					onHydrateVideo={hydrateTweetMedia}
					quotedTweet={item.retweetedTweet ? null : item.quotedTweet}
					replyToTweet={item.retweetedTweet ? null : item.replyToTweet}
					tweet={displayTweet}
					visibleUrlCards={visibleUrlCards}
					viewerAside={
						<MediaViewerTweetAside
							anchorId={interactionTweetId}
							error={conversation.error}
							loading={conversation.loading}
							threadItems={conversation.items}
							tweet={displayTweet}
						/>
					}
				/>
				<footer className={feedRowActionsClass}>
					<div
						className={cx(
							"flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px] text-[var(--ink-soft)]",
						)}
					>
						{canReply ? (
							<button
								aria-label="Reply"
								className={feedActionButtonClass}
								onClick={(event) => {
									event.stopPropagation();
									_onReply(interactionTweetId);
								}}
								title="Reply in Birdclaw"
								type="button"
							>
								<span className={feedActionIconWrapClass}>
									<MessageCircle
										className={feedActionIconClass}
										strokeWidth={1.9}
									/>
								</span>
							</button>
						) : null}
						{displayViewsCount > 0 ? (
							<span
								aria-label={`${formatCompactNumber(displayViewsCount)} views`}
								className={cx(feedActionButtonClass, "pointer-events-none")}
								title={`${formatCompactNumber(displayViewsCount)} views`}
							>
								<span className={feedActionIconWrapClass}>
									<Eye
										className={feedActionIconClass}
										strokeWidth={1.9}
									/>
								</span>
								<span>{formatCompactNumber(displayViewsCount)}</span>
							</span>
						) : null}
						{canFetchConversation ? (
							<>
								<button
									aria-expanded={conversation.isOpen && activeExpandedTab === "replies"}
									aria-label={
										conversation.isOpen && activeExpandedTab === "replies"
											? "Hide local thread"
											: "Show local thread"
									}
									className={cx(
										feedActionButtonClass,
										conversation.isOpen && activeExpandedTab === "replies" && "text-[var(--accent)]"
									)}
									onClick={(event) => {
										event.stopPropagation();
										setActiveExpandedTab("replies");
										if (!conversation.isOpen) {
											conversation.toggle();
										} else if (activeExpandedTab === "replies") {
											conversation.toggle();
										}
									}}
									title={
										displayLocalReplyCount > 0
											? `${formatCompactNumber(displayLocalReplyCount)} archived replies`
											: displayReplyCount > 0
												? `${formatCompactNumber(displayReplyCount)} replies reported by X`
												: "Show archived replies"
									}
									type="button"
								>
									<span className={feedActionIconWrapClass}>
										<MessageCircle
											className={feedActionIconClass}
											strokeWidth={1.9}
										/>
									</span>
									<span>
										{formatCompactNumber(
											displayLocalReplyCount > 0 ? displayLocalReplyCount : displayReplyCount,
										)}
									</span>
								</button>
								<button
									aria-expanded={conversation.isOpen && activeExpandedTab === "quotes"}
									aria-label="Quote tweets"
									className={cx(
										feedActionButtonClass,
										conversation.isOpen && activeExpandedTab === "quotes" && "text-[var(--accent)]"
									)}
									onClick={(event) => {
										event.stopPropagation();
										setActiveExpandedTab("quotes");
										if (!conversation.isOpen) {
											conversation.toggle();
										} else if (activeExpandedTab === "quotes") {
											conversation.toggle();
										}
									}}
									title={`${formatCompactNumber(displayQuoteCount)} quote tweets`}
									type="button"
								>
									<span className={feedActionIconWrapClass}>
										<Quote
											className={feedActionIconClass}
											strokeWidth={1.9}
										/>
									</span>
									<span>{formatCompactNumber(displayQuoteCount)}</span>
								</button>
							</>
						) : null}
						<span
							aria-label={`${formatCompactNumber(displayRetweetCount)} reposts`}
							className={cx(feedActionButtonClass, "pointer-events-none")}
							title={`${formatCompactNumber(displayRetweetCount)} reposts`}
						>
							<span className={feedActionIconWrapClass}>
								<Repeat2 className={feedActionIconClass} strokeWidth={1.9} />
							</span>
							<span>{formatCompactNumber(displayRetweetCount)}</span>
						</span>
						<span
							aria-label={`${formatCompactNumber(displayLikeCount)} likes`}
							className={cx(
								feedActionButtonClass,
								"pointer-events-none",
								displayLiked && "text-[var(--like)]",
							)}
							title={`${formatCompactNumber(displayLikeCount)} likes`}
						>
							<span className={feedActionIconWrapClass}>
								<Heart
									className={feedActionIconClass}
									fill={displayLiked ? "currentColor" : "none"}
									strokeWidth={1.9}
								/>
							</span>
							<span>{formatCompactNumber(displayLikeCount)}</span>
						</span>
						{displayBookmarked ? (
							<span
								aria-label="Bookmarked"
								className="inline-flex items-center gap-1 px-2 py-1 text-[13px] text-[var(--accent)]"
								title="Bookmarked"
							>
								<span className={feedActionIconWrapClass}>
									<BookmarkCheck
										className={feedActionIconClass}
										strokeWidth={1.9}
									/>
								</span>
							</span>
						) : null}
						<a
							aria-label="Open on X"
							className={feedActionButtonClass}
							href={displayTweetUrl}
							onClick={(event) => {
								event.stopPropagation();
							}}
							rel="noreferrer"
							target="_blank"
							title="Open original post on X"
						>
							<span className={feedActionIconWrapClass}>
								<Share className={feedActionIconClass} strokeWidth={1.9} />
							</span>
						</a>
					</div>
				</footer>
				{conversation.isOpen && canFetchConversation ? (
					<>
						{/* Tabs selection bar */}
						<div className="flex items-center justify-between border-b border-[var(--line)] px-2 mt-3">
							<div className="flex gap-1">
								<button
									className={cx(
										"px-4 py-2 text-[13px] font-bold transition-colors border-b-2",
										activeExpandedTab === "replies"
											? "border-[var(--accent)] text-[var(--accent)]"
											: "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
									)}
									onClick={() => setActiveExpandedTab("replies")}
									type="button"
								>
									Replies ({displayLocalReplyCount > 0 ? displayLocalReplyCount : displayReplyCount})
								</button>
								<button
									className={cx(
										"px-4 py-2 text-[13px] font-bold transition-colors border-b-2",
										activeExpandedTab === "quotes"
											? "border-[var(--accent)] text-[var(--accent)]"
											: "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]"
									)}
									onClick={() => setActiveExpandedTab("quotes")}
									type="button"
								>
									Quotes ({displayQuoteCount})
								</button>
							</div>

							{activeExpandedTab === "replies" && (
								<button
									className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-active)] px-3 py-1.5 text-[12px] font-bold text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50 mr-2"
									disabled={threadSyncState === "syncing"}
									onClick={() => void syncThread()}
									type="button"
									title="Refresh replies thread from X"
								>
									<RefreshCw className={cx("size-3.5", threadSyncState === "syncing" && "animate-spin")} />
									{threadSyncState === "syncing" ? "Syncing..." : "Sync replies"}
								</button>
							)}
						</div>

						{activeExpandedTab === "replies" ? (
							<ConversationThread
								anchorId={interactionTweetId}
								error={conversation.error}
								items={conversation.items}
								loading={conversation.loading}
							/>
						) : (
							<QuotesThread
								tweetId={interactionTweetId}
								accountId={item.accountId}
								renderCard={(quoteItem) => (
									<TimelineCard
										item={quoteItem as any}
										onReply={() => {}}
										showReplyControls={true}
									/>
								)}
							/>
						)}
					</>
				) : null}
			</div>
			{contextMenu && typeof document !== "undefined"
				? createPortal(
						<TimelineCardContextMenu
							authorHandle={displayAuthor.handle}
							canFetchThread={canFetchConversation}
							onClose={() => setContextMenu(null)}
							onFetchThread={() => void syncThread()}
							position={contextMenu}
							tweetId={interactionTweetId}
							tweetUrl={displayTweetUrl}
							item={displayTweet}
							replies={conversation.items || []}
						/>,
						document.body,
					)
				: null}
		</article>
	);
}

function TimelineCardContextMenu({
	authorHandle,
	canFetchThread,
	onClose,
	onFetchThread,
	position,
	tweetId,
	tweetUrl,
	item,
	replies,
}: {
	authorHandle: string;
	canFetchThread: boolean;
	onClose: () => void;
	onFetchThread: () => void;
	position: { x: number; y: number };
	tweetId: string;
	tweetUrl: string;
	item: any;
	replies: any[];
}) {
	useEffect(() => {
		const close = () => onClose();
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onClose();
		};
		window.addEventListener("click", close);
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("click", close);
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [onClose]);

	const left = Math.min(
		Math.max(12, position.x),
		Math.max(12, window.innerWidth - 260),
	);
	const top = Math.min(
		Math.max(12, position.y),
		Math.max(12, window.innerHeight - 270),
	);
	const copyText = async (value: string) => {
		await navigator.clipboard.writeText(value);
		onClose();
	};

	return (
		<div
			className="fixed z-[9999] w-[248px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] py-2 text-[15px] text-[var(--ink)] shadow-[0_18px_60px_var(--shadow-strong)]"
			onClick={(event) => event.stopPropagation()}
			style={{ left, top }}
		>
			<a
				className="flex items-center gap-3 px-4 py-3 font-semibold transition-colors hover:bg-[var(--bg-hover)]"
				href={tweetUrl}
				rel="noreferrer"
				target="_blank"
			>
				<ExternalLink className="size-5" strokeWidth={2} />
				Open on X
			</a>
			<Link
				className="flex items-center gap-3 px-4 py-3 font-semibold transition-colors hover:bg-[var(--bg-hover)]"
				to="/profiles/$handle"
				params={{ handle: authorHandle }}
				onClick={onClose}
			>
				<UserSearch className="size-5" strokeWidth={2} />
				Analyse @{authorHandle}
			</Link>
			{canFetchThread ? (
				<button
					className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold transition-colors hover:bg-[var(--bg-hover)]"
					onClick={() => {
						onFetchThread();
						onClose();
					}}
					type="button"
				>
					<RefreshCw className="size-5" strokeWidth={2} />
					Fetch thread
				</button>
			) : null}
			<button
				className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold transition-colors hover:bg-[var(--bg-hover)]"
				onClick={() => void copyText(tweetId)}
				type="button"
			>
				<Copy className="size-5" strokeWidth={2} />
				Copy Birdclaw post ID
			</button>
			<button
				className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold transition-colors hover:bg-[var(--bg-hover)]"
				onClick={() => void copyText(tweetUrl)}
				type="button"
			>
				<Copy className="size-5" strokeWidth={2} />
				Copy X URL
			</button>
			<div className="border-t border-[var(--line)] my-1" />
			<button
				className="flex w-full items-center gap-3 px-4 py-3 text-left font-semibold transition-colors hover:bg-[var(--bg-hover)]"
				onClick={() => void copyText(formatTweetAsMarkdown(item, replies))}
				type="button"
			>
				<Copy className="size-5" strokeWidth={2} />
				Copy as Markdown
			</button>
		</div>
	);
}

function formatTweetAsMarkdown(tweet: any, replies: any[] = []) {
	const handle = tweet.author.handle?.replace(/^@/, "");
	const profileUrl = `https://x.com/${handle}`;
	const tweetUrl = `https://x.com/${handle}/status/${tweet.id}`;
	const dateStr = new Date(tweet.createdAt).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});

	let md = `> **[${tweet.author.displayName}](${profileUrl})** (@${tweet.author.handle}) · [${dateStr}](${tweetUrl})\n>\n`;
	md += `> ${tweet.text.replace(/\n/g, "\n> ")}\n>\n`;

	const likeCount = tweet.likeCount ?? tweet.public_metrics?.like_count ?? 0;
	const replyCount = tweet.replyCount ?? tweet.public_metrics?.reply_count ?? 0;
	md += `> *Likes: ${Number(likeCount).toLocaleString()} | Replies: ${Number(replyCount).toLocaleString()}*\n`;

	if (replies && replies.length > 0) {
		md += `\n---\n**Replies:**\n`;
		for (const reply of replies) {
			const replyDate = new Date(reply.createdAt).toLocaleDateString("en-US", {
				year: "numeric",
				month: "short",
				day: "numeric",
			});
			md += `* **[${reply.name || reply.author}](https://x.com/${reply.author})** (@${reply.author}) · ${replyDate}:\n  ${reply.text.replace(/\n/g, "\n  ")}\n`;
		}
	}
	return md;
}
