import { useState, useEffect } from "react";
import { Quote, Search, RefreshCw, Eye, Heart, ExternalLink } from "lucide-react";
import type { EmbeddedTweet } from "#/lib/types";
import { formatCompactNumber } from "#/lib/present";
import { ConversationSurfaceScope } from "#/lib/conversation-surface";
import {
	cx,
	feedRowHandleClass,
	feedRowNameClass,
	feedRowTimestampClass,
} from "#/lib/ui";
import { AvatarChip } from "./AvatarChip";
import { BirdclawEmpty, BirdclawLoading } from "./BrandMark";
import { ProfilePreview } from "./ProfilePreview";
import { SmartTimestamp } from "./SmartTimestamp";
import { TweetMediaGrid } from "./TweetMediaGrid";
import { TweetRichText } from "./TweetRichText";

export function QuotesThread({
	tweetId,
	accountId,
	renderCard,
}: {
	tweetId: string;
	accountId: string;
	renderCard?: (item: any) => React.ReactNode;
}) {
	const [quotes, setQuotes] = useState<EmbeddedTweet[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [refreshing, setRefreshing] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [sortBy, setSortBy] = useState<"newest" | "likes" | "views">("likes");

	const fetchQuotes = async (isRefresh = false) => {
		if (isRefresh) {
			setRefreshing(true);
		} else {
			setLoading(true);
		}
		setError(null);
		try {
			const res = await fetch("/api/quotes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ tweetId, accountId, refresh: isRefresh }),
			});
			if (!res.ok) {
				throw new Error("Failed to fetch quotes");
			}
			const data = (await res.json()) as { ok: boolean; quotes: EmbeddedTweet[]; error?: string };
			if (data.ok) {
				setQuotes(data.quotes);
			} else {
				throw new Error(data.error || "Failed to fetch quotes");
			}
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setLoading(false);
			setRefreshing(false);
		}
	};

	useEffect(() => {
		const load = async () => {
			await fetchQuotes(false);
		};
		void load();
	}, [tweetId, accountId]);

	if (loading) {
		return (
			<section className="mt-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)]">
				<BirdclawLoading
					detail="Scanning X search for quote tweets..."
					label="Loading quotes"
				/>
			</section>
		);
	}

	if (error && quotes.length === 0) {
		return (
			<section className="mt-3 rounded-2xl border border-[var(--alert)] bg-[var(--alert-soft)] p-4">
				<div className="flex items-center justify-between">
					<span className="text-[14px] font-semibold text-[var(--alert)]">{error}</span>
					<button
						className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-active)] px-3 py-1.5 text-[12px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]"
						onClick={() => void fetchQuotes(false)}
						type="button"
					>
						<RefreshCw className="size-3.5" />
						Retry
					</button>
				</div>
			</section>
		);
	}

	// Filter in-memory
	const filteredQuotes = quotes.filter((q) => {
		const textMatch = q.text.toLowerCase().includes(searchQuery.toLowerCase());
		const authorMatch =
			q.author.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
			q.author.handle.toLowerCase().includes(searchQuery.toLowerCase());
		return textMatch || authorMatch;
	});

	// Sort in-memory
	const sortedQuotes = [...filteredQuotes].sort((a, b) => {
		if (sortBy === "likes") {
			return (b.likeCount ?? 0) - (a.likeCount ?? 0);
		}
		if (sortBy === "views") {
			return (b.viewsCount ?? 0) - (a.viewsCount ?? 0);
		}
		// newest
		return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
	});

	return (
		<section
			aria-label="Quotes List"
			className="mt-3 min-w-0 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--panel)] shadow-[0_8px_28px_var(--shadow)]"
		>
			{/* Header bar */}
			<div className="flex flex-col gap-2.5 border-b border-[var(--line)] p-4">
				<div className="flex items-center justify-between gap-2 text-[14px] font-bold text-[var(--ink)]">
					<div className="flex items-center gap-2">
						<Quote className="size-4 text-[var(--accent)]" strokeWidth={2.2} />
						<span>{quotes.length} quote tweets found</span>
					</div>
					<button
						className="flex items-center gap-1.5 rounded-lg bg-[var(--bg-active)] px-3 py-1.5 text-[12px] font-bold text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-hover)] disabled:opacity-50"
						disabled={refreshing}
						onClick={() => void fetchQuotes(true)}
						type="button"
						title="Force refresh live quotes from X"
					>
						<RefreshCw className={cx("size-3.5", refreshing && "animate-spin")} />
						{refreshing ? "Refreshing..." : "Refresh live"}
					</button>
				</div>

				{/* Filter & Sort Controls */}
				<div className="flex flex-wrap items-center gap-2.5">
					<div className="relative flex flex-1 min-w-[150px] items-center">
						<Search className="absolute left-3 size-4 text-[var(--ink-soft)]" />
						<input
							className="w-full rounded-lg border border-[var(--line)] bg-[var(--bg-active)] py-1.5 pl-9 pr-3 text-[13px] outline-none placeholder:text-[var(--ink-soft)] focus:border-[var(--accent)]"
							onChange={(e) => setSearchQuery(e.target.value)}
							placeholder="Filter quotes by text or user..."
							type="text"
							value={searchQuery}
						/>
					</div>

					<div className="flex items-center gap-1.5 text-[13px]">
						<span className="text-[var(--ink-soft)] font-medium">Sort:</span>
						<select
							className="rounded-lg border border-[var(--line)] bg-[var(--bg-active)] px-2.5 py-1.5 text-[13px] font-semibold text-[var(--ink)] outline-none cursor-pointer focus:border-[var(--accent)]"
							onChange={(e) => setSortBy(e.target.value as any)}
							value={sortBy}
						>
							<option value="likes">Most Likes</option>
							<option value="views">Most Views</option>
							<option value="newest">Newest</option>
						</select>
					</div>
				</div>
			</div>

			{/* Main list */}
			<div className="custom-scrollbar flex max-h-[min(68vh,760px)] flex-col overflow-y-auto overscroll-contain">
				{sortedQuotes.length === 0 ? (
					<BirdclawEmpty
						detail={searchQuery ? "Try searching for something else" : "No quotes match filters"}
						label="No quotes found"
					/>
				) : (
					<ConversationSurfaceScope>
						{sortedQuotes.map((tweet, index) => (
							<div
								className={cx(
									"transition-colors hover:bg-[var(--bg-hover)]",
									index > 0 && "border-t border-[var(--line)]",
								)}
								key={tweet.id}
							>
								{renderCard ? (
									renderCard({
										...tweet,
										kind: "home",
										accountId,
									})
								) : (
									<div className="flex gap-3 px-4 py-3.5">
										<div className="flex flex-col items-center">
											<AvatarChip
												avatarUrl={tweet.author.avatarUrl}
												hue={tweet.author.avatarHue}
												name={tweet.author.displayName}
												profileId={tweet.author.id}
												size="small"
											/>
										</div>
										<div className="min-w-0 flex-1 overflow-hidden">
											<header className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[14px]">
												<ProfilePreview profile={tweet.author}>
													<span className="flex min-w-0 max-w-full items-center gap-1.5">
														<span className={feedRowNameClass}>
															{tweet.author.displayName}
														</span>
														<span className={feedRowHandleClass}>
															@{tweet.author.handle}
														</span>
													</span>
												</ProfilePreview>
												<span className="text-[var(--ink-soft)]">·</span>
												<SmartTimestamp
													className={feedRowTimestampClass}
													value={tweet.createdAt}
												/>
												<span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
													<a
														aria-label="Open original quote post"
														className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--ink)]"
														href={tweetUrl(tweet)}
														onClick={(event) => event.stopPropagation()}
														rel="noreferrer"
														target="_blank"
													>
														<ExternalLink className="size-3.5" strokeWidth={1.8} />
														Open
													</a>
												</span>
											</header>
											<TweetRichText
												className="mt-1 whitespace-pre-wrap break-words text-[14px] leading-[1.45] text-[var(--ink)] [overflow-wrap:anywhere]"
												entities={tweet.entities}
												text={tweet.text}
											/>
											<TweetMediaGrid items={tweet.media} postUrl={tweetUrl(tweet)} />

											{/* Quote Card Footer: Metrics */}
											<div className="flex items-center gap-4 mt-2 text-[12px] text-[var(--ink-soft)] font-medium">
												{tweet.viewsCount !== undefined && (
													<span className="inline-flex items-center gap-1" title={`${tweet.viewsCount} views`}>
														<Eye className="size-3.5" />
														{formatCompactNumber(tweet.viewsCount)}
													</span>
												)}
												<span className="inline-flex items-center gap-1" title={`${tweet.likeCount || 0} likes`}>
													<Heart className="size-3.5" />
													{formatCompactNumber(tweet.likeCount || 0)}
												</span>
											</div>
										</div>
									</div>
								)}
							</div>
						))}
					</ConversationSurfaceScope>
				)}
			</div>
		</section>
	);
}

function tweetUrl(tweet: EmbeddedTweet) {
	const handle = tweet.author.handle?.trim().replace(/^@/, "");
	return handle
		? `https://x.com/${handle}/status/${tweet.id}`
		: `https://x.com/i/status/${tweet.id}`;
}
