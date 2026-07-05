import {
	ExternalLink,
	Heart,
	MessageCircle,
	Copy,
	Quote,
	Repeat2,
} from "lucide-react";
import { formatCompactNumber } from "#/lib/present";
import type { EmbeddedTweet } from "#/lib/types";
import {
	embeddedCardBodyClass,
	embeddedCardCopyClass,
	embeddedCardHandleClass,
	embeddedCardHeaderClass,
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
	return (
		<section className={embeddedCardBodyClass}>
			<p className={embeddedCardLabelClass}>{label}</p>
			<header className={embeddedCardHeaderClass}>
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
				<a
					aria-label="Open original post"
					className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--ink)]"
					href={tweetUrl(item)}
					onClick={(event) => event.stopPropagation()}
					rel="noreferrer"
					target="_blank"
				>
					<ExternalLink className="size-3.5" strokeWidth={1.8} />
					Open
				</a>
			</header>
			<TweetRichText
				className={embeddedCardCopyClass}
				entities={item.entities}
				text={item.text}
			/>
			<TweetMediaGrid items={item.media} postUrl={tweetUrl(item)} />
			{item.entities.article ? (
				<TweetArticleCard article={item.entities.article} />
			) : null}
			<EmbeddedTweetMetrics item={item} />
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
			<div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 text-[13px] text-[var(--ink-soft)]">
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
							<span>{formatCompactNumber(metric.value)}</span>
						</button>
					);
				})}
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
	);
}

function tweetUrl(tweet: EmbeddedTweet) {
	const handle = tweet.author.handle?.trim().replace(/^@/, "");
	return handle
		? `https://x.com/${handle}/status/${tweet.id}`
		: `https://x.com/i/status/${tweet.id}`;
}
