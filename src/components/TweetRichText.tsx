import { Fragment, useState, useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, ChevronUp, Users } from "lucide-react";
import type { ReactNode } from "react";
import {
	collectTweetSegmentsForText,
	enrichFallbackUrlEntities,
	isTweetArticleUrlEntity,
	normalizeTweetUrlEntityRangeForText,
} from "#/lib/tweet-render";
import type { TweetEntities } from "#/lib/types";
import {
	bodyCopyClass,
	tweetHashtagClass,
	tweetLinkClass,
	tweetMentionClass,
} from "#/lib/ui";
import { safeHttpUrl } from "#/lib/url-safety";
import { ProfilePreview } from "./ProfilePreview";

function rangeKey(range: { start: number; end: number }) {
	return `${range.start}:${range.end}`;
}

function isShortUrl(value: string) {
	try {
		return new URL(value).hostname.replace(/^www\./, "") === "t.co";
	} catch {
		return false;
	}
}

export function TweetRichText({
	text,
	entities,
	className = "body-copy",
	hiddenUrlRanges = [],
	urlLabel = "display",
	as = "p",
}: {
	text: string;
	entities: TweetEntities;
	className?: string;
	hiddenUrlRanges?: Array<{ start: number; end: number }>;
	urlLabel?: "display" | "expanded";
	as?: "p" | "span";
}) {
	const richEntities = enrichFallbackUrlEntities(text, entities);
	const segments = collectTweetSegmentsForText(text, richEntities);
	const hiddenRawRangeKeys = new Set(hiddenUrlRanges.map(rangeKey));
	const article = entities.article;
	if (article) {
		const urlEntries = richEntities.urls ?? [];
		const articleUrlEntries = urlEntries.filter((entry) =>
			isTweetArticleUrlEntity(entry, article),
		);
		const onlyUrlEntry = urlEntries[0];
		if (
			articleUrlEntries.length === 0 &&
			urlEntries.length === 1 &&
			onlyUrlEntry &&
			(isShortUrl(onlyUrlEntry.url) || isShortUrl(onlyUrlEntry.expandedUrl))
		) {
			articleUrlEntries.push(onlyUrlEntry);
		}
		for (const entry of articleUrlEntries) {
			hiddenRawRangeKeys.add(rangeKey(entry));
		}
	}
	const hiddenRangeKeys = new Set(hiddenRawRangeKeys);
	for (const entry of richEntities.urls ?? []) {
		if (!hiddenRawRangeKeys.has(rangeKey(entry))) continue;
		hiddenRangeKeys.add(
			rangeKey(normalizeTweetUrlEntityRangeForText(text, entry)),
		);
	}
	const Wrapper = as;
	let cursor = 0;
	const hideArticleTitle =
		entities.article && text.trim() === entities.article.title.trim();
	const visibleSegments = hideArticleTitle ? [] : segments;

	const uniqueMentions = useMemo(() => {
		const raw = richEntities.mentions ?? [];
		const seen = new Set<string>();
		return raw.filter((m) => {
			const uname = m.username.toLowerCase();
			if (seen.has(uname)) return false;
			seen.add(uname);
			return true;
		});
	}, [richEntities.mentions]);

	const shouldGroupMentions = uniqueMentions.length > 1;
	const [mentionsExpanded, setMentionsExpanded] = useState(false);
	let hasRenderedText = false;

	return (
		<div className="flex flex-col gap-1 w-full">
			{shouldGroupMentions && (
				<div className="flex flex-col items-start gap-1.5 shrink-0" onClick={(e) => e.stopPropagation()}>
					<button
						type="button"
						onClick={() => setMentionsExpanded(!mentionsExpanded)}
						className="inline-flex h-7 items-center gap-1.5 rounded-full bg-[var(--bg-hover)] hover:bg-[var(--bg-active)] px-2.5 text-[11px] font-semibold text-[var(--ink)] transition-colors border border-[var(--line)]"
					>
						<Users className="size-3.5 text-[var(--ink-soft)]" />
						<span>
							Tagged {uniqueMentions.length} users
						</span>
						{mentionsExpanded ? (
							<ChevronUp className="size-3 text-[var(--ink-soft)] ml-0.5" />
						) : (
							<ChevronDown className="size-3 text-[var(--ink-soft)] ml-0.5" />
						)}
					</button>
					{mentionsExpanded && (
						<div className="flex flex-wrap gap-1 p-1.5 rounded-xl border border-[var(--line)] bg-[var(--panel)] w-full max-h-[140px] overflow-y-auto custom-scrollbar">
							{uniqueMentions.map((m, i) => {
								if (m.profile) {
									return (
										<ProfilePreview key={i} profile={m.profile}>
											<span className="inline-flex items-center rounded-full bg-[var(--bg)] border border-[var(--line)] px-2 py-0.5 text-[11px] font-medium text-[var(--ink)] cursor-pointer hover:bg-[var(--bg-hover)] transition-colors">
												@{m.username}
											</span>
										</ProfilePreview>
									);
								}
								return (
									<Link
										key={i}
										to="/profiles/$handle"
										params={{ handle: m.username }}
										className="inline-flex items-center rounded-full bg-[var(--bg)] border border-[var(--line)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)] hover:bg-[var(--bg-hover)] transition-colors"
									>
										@{m.username}
									</Link>
								);
							})}
						</div>
					)}
				</div>
			)}
			<Wrapper className={className === "body-copy" ? bodyCopyClass : className}>
				{visibleSegments.map((segment, index) => {
					if (
						segment.start < cursor ||
						segment.end <= segment.start ||
						segment.end > text.length
					) {
						return null;
					}

					let prefix = text.slice(cursor, segment.start);
					cursor = segment.end;

					if (shouldGroupMentions && !hasRenderedText) {
						prefix = prefix.replace(/^\s+/, "");
					}

					let node: ReactNode = (
						<Fragment key={`segment-${String(index)}`}>
							{text.slice(segment.start, segment.end)}
						</Fragment>
					);
					if (segment.kind === "url" && hiddenRangeKeys.has(rangeKey(segment))) {
						node = null;
					} else if (segment.kind === "mention" && shouldGroupMentions) {
						node = null;
					} else if (segment.kind === "mention" && segment.profile) {
						node = (
							<ProfilePreview
								key={`segment-${String(index)}`}
								profile={segment.profile}
							>
								<span className={tweetMentionClass}>@{segment.username}</span>
							</ProfilePreview>
						);
					} else if (segment.kind === "mention") {
						node = (
							<Link
								key={`segment-${String(index)}`}
								className={tweetMentionClass}
								to="/profiles/$handle"
								params={{ handle: segment.username }}
							>
								@{segment.username}
							</Link>
						);
					} else if (segment.kind === "url") {
						const href = safeHttpUrl(segment.expandedUrl);
						if (href) {
							node = (
								<a
									key={`segment-${String(index)}`}
									className={tweetLinkClass}
									href={href}
									rel="noreferrer"
									target="_blank"
								>
									{urlLabel === "expanded"
										? segment.expandedUrl
										: segment.displayUrl}
								</a>
							);
						}
					} else if (segment.kind === "hashtag") {
						node = (
							<span
								className={tweetHashtagClass}
								key={`segment-${String(index)}`}
							>
								#{segment.tag}
							</span>
						);
					}

					const isNodeEmpty = node === null;
					const isPrefixEmpty = prefix === "";
					if (!isNodeEmpty || !isPrefixEmpty) {
						hasRenderedText = true;
					}

					return (
						<Fragment key={`piece-${String(index)}`}>
							{prefix}
							{node}
						</Fragment>
					);
				})}
				{hideArticleTitle ? null : (() => {
					let trailing = text.slice(cursor);
					if (shouldGroupMentions && !hasRenderedText) {
						trailing = trailing.replace(/^\s+/, "");
					}
					return trailing;
				})()}
			</Wrapper>
		</div>
	);
}
