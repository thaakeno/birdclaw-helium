import {
	ExternalLink,
	Heart,
	MessageCircle,
	Copy,
	Quote,
	Repeat2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { readBoolean, HIDE_QUOTE_INFO_KEY } from "#/lib/nav-preferences";
import { formatCompactNumber } from "#/lib/present";
import type { EmbeddedTweet } from "#/lib/types";
import {
	embeddedCardBodyClass,
	embeddedCardCopyClass,
	embeddedCardHandleClass,
	embeddedCardLabelClass,
	embeddedCardNameClass,
	feedActionButtonClass,
	feedActionIconClass,
	feedActionIconWrapClass,
	feedRowActionsClass,
	feedRowTimestampClass,
} from "#/lib/ui";
import { ProfilePreview } from "./ProfilePreview";
import { SmartTimestamp } from "./SmartTimestamp";
import { TweetArticleCard } from "./TweetArticleCard";
import { TweetMediaGrid } from "./TweetMediaGrid";
import { TweetRichText } from "./TweetRichText";

export function EmbeddedTweetCard({
	item,
	label,
}: {
	item: EmbeddedTweet;
	label: string;
}) {
	const [hideMetrics, setHideMetrics] = useState(false);
	useEffect(() => {
		setHideMetrics(readBoolean(HIDE_QUOTE_INFO_KEY));
	}, []);

	return (
		<section className={embeddedCardBodyClass}>
			<p className={embeddedCardLabelClass}>{label}</p>
			<div className="flex items-start justify-between gap-2 min-w-0">
				<header className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[14px]">
					<ProfilePreview profile={item.author}>
						<span className="flex min-w-0 items-center gap-1.5">
							<span className={embeddedCardNameClass}>
								{item.author.displayName}
							</span>
							<span className={embeddedCardHandleClass}>
								@{item.author.handle}
							</span>
						</span>
					</ProfilePreview>
					<span className="text-[var(--ink-soft)]">·</span>
					<SmartTimestamp
						className={feedRowTimestampClass}
						value={item.createdAt}
					/>
				</header>
				<a
					aria-label="Open original post"
					className="shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--ink)]"
					href={tweetUrl(item)}
					onClick={(event) => event.stopPropagation()}
					rel="noreferrer"
					target="_blank"
				>
					<ExternalLink className="size-3.5" strokeWidth={1.8} />
					Open
				</a>
			</div>
			<TweetRichText
				className={embeddedCardCopyClass}
				entities={item.entities}
				text={item.text}
			/>
			<TweetMediaGrid items={item.media} postUrl={tweetUrl(item)} />
			{item.entities.article ? (
				<TweetArticleCard article={item.entities.article} />
			) : null}
			{hideMetrics ? null : <EmbeddedTweetMetrics item={item} />}
		</section>
	);
}

export function EmbeddedTweetMetrics({ item }: { item: EmbeddedTweet }) {
	const metrics = [
		{
			label: "replies",
			value: item.localReplyCount ?? item.replyCount ?? 0,
			icon: MessageCircle,
		},
		{ label: "quotes", value: item.quoteCount ?? 0, icon: Quote },
		{ label: "reposts", value: item.retweetCount ?? 0, icon: Repeat2 },
		{ label: "likes", value: item.likeCount ?? 0, icon: Heart },
	];
	return (
		<div className={feedRowActionsClass}>
			<div className="flex w-full items-center justify-between gap-x-2 text-[13px] text-[var(--ink-soft)]">
				<div className="flex items-center gap-1 sm:gap-2 min-w-0">
					{metrics.map((metric) => {
						const Icon = metric.icon;
						return (
							<button
								aria-label={`${formatCompactNumber(metric.value)} ${metric.label}`}
								className={feedActionButtonClass}
								key={metric.label}
								onClick={(event) => event.stopPropagation()}
								title={`${formatCompactNumber(metric.value)} ${metric.label}`}
								type="button"
							>
								<span className={feedActionIconWrapClass}>
									<Icon className={feedActionIconClass} strokeWidth={1.9} />
								</span>
								<span className="tabular-nums">{formatCompactNumber(metric.value)}</span>
							</button>
						);
					})}
				</div>
				<div className="flex items-center gap-0.5 shrink-0">
					<a
						aria-label="Open reply on X"
						className={feedActionButtonClass}
						href={tweetUrl(item)}
						onClick={(event) => event.stopPropagation()}
						rel="noreferrer"
						target="_blank"
						title="Open on X"
					>
						<span className={feedActionIconWrapClass}>
							<ExternalLink className={feedActionIconClass} strokeWidth={1.9} />
						</span>
					</a>
					<button
						aria-label="Copy reply link"
						className={feedActionButtonClass}
						onClick={(event) => {
							event.stopPropagation();
							void navigator.clipboard?.writeText(tweetUrl(item));
						}}
						title="Copy X URL"
						type="button"
					>
						<span className={feedActionIconWrapClass}>
							<Copy className={feedActionIconClass} strokeWidth={1.9} />
						</span>
					</button>
				</div>
			</div>
		</div>
	);
}

function tweetUrl(tweet: EmbeddedTweet) {
	const handle = tweet.author.handle?.trim().replace(/^@/, "");
	return handle
		? `https://x.com/${handle}/status/${tweet.id}`
		: `https://x.com/i/status/${tweet.id}`;
}
