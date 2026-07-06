import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { RefreshCw, ChevronDown, ChevronUp, TrendingUp, Heart, MessageCircle, Sparkles, ExternalLink } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AvatarChip } from "#/components/AvatarChip";
import { SyncNowButton } from "#/components/SyncNowButton";
import { TimelineCard } from "#/components/TimelineCard";
import {
	TimelineFeedHeader,
	TimelineFeedShell,
	TimelineHeaderSubtitle,
	TimelineSearchAndSortField,
} from "#/components/TimelineFeedShell";
import { useTimelineRouteData } from "#/components/useTimelineRouteData";
import type { AccountRecord } from "#/lib/types";
import {
	cx,
	secondaryButtonClass,
	selectFieldClass,
	tabButtonActiveClass,
	tabButtonClass,
	tabButtonIndicatorClass,
	tabStripClass,
	timestampClass,
} from "#/lib/ui";



export const Route = createFileRoute("/my-posts")({
	component: MyPostsRoute,
});

type MyPostsTab = "all" | "originals" | "replies";

const TABS: Array<{ value: MyPostsTab; label: string }> = [
	{ value: "all", label: "All" },
	{ value: "originals", label: "Originals" },
	{ value: "replies", label: "Replies" },
];

function accountLabel(account: AccountRecord | undefined) {
	if (!account) return "Your profile";
	return account.name || account.handle || account.id;
}

function accountHandle(account: AccountRecord | undefined) {
	if (!account) return "";
	return account.handle || (account.name ? `@${account.name}` : account.id);
}

function hueForAccount(account: AccountRecord | undefined) {
	const value = account?.handle || account?.name || account?.id || "birdclaw";
	let hash = 0;
	for (const character of value) {
		hash = (hash * 31 + character.charCodeAt(0)) % 360;
	}
	return hash;
}

function accountXUrl(account: AccountRecord | undefined) {
	const handle = account?.handle?.replace(/^@/, "");
	return handle ? `https://x.com/${handle}` : "https://x.com";
}

function MyPostsProfilePanel({
	account,
	count,
	repostsCount,
}: {
	account: AccountRecord | undefined;
	count: number;
	repostsCount: number;
}) {
	return (
		<section className="border-b border-[var(--line)] bg-[var(--bg)]">
			<div className="h-28 bg-[color:color-mix(in_srgb,var(--accent)_16%,var(--bg-active))]" />
			<div className="px-4 pb-4">
				<div className="-mt-10 flex items-end justify-between gap-3">
					<span className="rounded-full bg-[var(--bg)] p-1">
						<AvatarChip
							avatarUrl={account?.avatarUrl}
							hue={account?.avatarHue ?? hueForAccount(account)}
							name={accountLabel(account)}
							profileId={account?.profileId}
							size="large"
						/>
					</span>
					<a
						className={cx(secondaryButtonClass, "h-9 px-4 text-[13px]")}
						href={accountXUrl(account)}
						rel="noreferrer"
						target="_blank"
					>
						Open on X
					</a>
				</div>
				<div className="mt-3 min-w-0">
					<h2 className="truncate text-[20px] font-black text-[var(--ink)]">
						{accountLabel(account)}
					</h2>
					<p className="truncate text-[15px] text-[var(--ink-soft)]">
						{accountHandle(account)}
					</p>
					<p className="mt-3 text-[14px] leading-[1.45] text-[var(--ink)]">
						Locally archived originals, replies, and reposts fetched through
						Birdclaw.
					</p>
					<div className="mt-3 flex flex-wrap gap-4 text-[14px]">
						<span>
							<strong className="font-bold text-[var(--ink)]">
								{count.toLocaleString()}
							</strong>{" "}
							<span className="text-[var(--ink-soft)]">local items</span>
						</span>
						<span>
							<strong className="font-bold text-[var(--ink)]">
								{repostsCount.toLocaleString()}
							</strong>{" "}
							<span className="text-[var(--ink-soft)]">reposts</span>
						</span>
					</div>
				</div>
			</div>
		</section>
	);
}

function MyPostsFooter({
	count,
	syncControl,
}: {
	count: number;
	syncControl: ReactNode;
}) {
	return (
		<section className="border-b border-[var(--line)] px-4 py-5">
			<div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] px-4 py-4">
				<div className="flex items-start gap-3">
					<div className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)]">
						<RefreshCw className="size-5" strokeWidth={2.1} />
					</div>
					<div className="min-w-0 flex-1">
						<div className="text-[15px] font-bold text-[var(--ink)]">
							Keep your profile archive fresh
						</div>
						<p className="mt-1 text-[13px] leading-[1.45] text-[var(--ink-soft)]">
							{count.toLocaleString()} authored posts are local. Fetching uses
							the authenticated Bird helper and stores originals, replies, and
							reposts.
						</p>
						<div className="mt-3">{syncControl}</div>
					</div>
				</div>
			</div>
		</section>
	);
}

function MyPostsRoute() {
	const [sortBy, setSortBy] = useState<"newest" | "oldest" | "likes" | "replies">("newest");
	const [tab, setTab] = useState<MyPostsTab>("all");
	const [search, setSearch] = useState("");
	const [syncMaxPages, setSyncMaxPages] = useState(1);
	const [statsCollapsed, setStatsCollapsed] = useState(true);
	const {
		meta,
		items,
		loading,
		error,
		replyError,
		retry,
		refreshLocalView,
		replyToTweet,
		selectedAccountId,
		hasMore,
		loadingMore,
		loadMore,
	} = useTimelineRouteData({
		resource: "authored",
		search,
		errorFallback: "Authored posts unavailable",
		originalsOnly: tab === "originals",
		repliesOnly: tab === "replies",
		sort:
			sortBy === "newest"
				? "created-desc"
				: sortBy === "oldest"
					? "created-asc"
					: sortBy === "likes"
						? "likes-desc"
						: sortBy === "replies"
							? "replies-desc"
							: undefined,
	});

	const statsQuery = useQuery({
		queryKey: ["authored-stats", selectedAccountId],
		queryFn: async () => {
			if (!selectedAccountId) return null;
			const response = await fetch(`/api/authored-stats?account=${selectedAccountId}`);
			if (!response.ok) throw new Error("Failed to fetch stats");
			return response.json() as Promise<{
				totalPosts: number;
				totalLikes: number;
				totalReplies: number;
				repostsCount: number;
				broadcastsCount: number;
				repliesCount: number;
				replyRatio: number;
				avgLikes: number;
				avgReplies: number;
				mostLikedTweet: { id: string; text: string; likeCount: number; replyCount: number } | null;
				mostRepliedTweet: { id: string; text: string; likeCount: number; replyCount: number } | null;
				radarItems: Array<{
					id: string;
					text: string;
					createdAt: string;
					likeCount: number;
					authorHandle: string;
					authorName: string;
					authorAvatarUrl: string | null;
					authorFollowers: number;
					replyCount: number;
				}>;
			}>;
		},
		enabled: !!selectedAccountId,
	});
	const stats = statsQuery.data ?? null;

	const selectedAccount = useMemo(
		() =>
			meta?.accounts.find((account) => account.id === selectedAccountId) ??
			meta?.accounts[0],
		[meta?.accounts, selectedAccountId],
	);

	const sortedItems = items;

	const authoredCount = meta?.stats.authored ?? items.length;
	const repostsCount = stats?.repostsCount ?? 0;
	const subtitles = meta
		? `${authoredCount.toLocaleString()} local posts, replies, and reposts - ${meta.transport.statusText}`
		: "Loading authored posts...";
	const syncButton = (
		<SyncNowButton
			accounts={meta?.accounts}
			kind="authored"
			label="Fetch posts"
			onSynced={refreshLocalView}
			showAccountPicker
			syncOptions={{ limit: 50, maxPages: syncMaxPages }}
		/>
	);

	return (
		<TimelineFeedShell
			header={
				<TimelineFeedHeader
					title="My Posts"
					subtitles={
						<TimelineHeaderSubtitle>{subtitles}</TimelineHeaderSubtitle>
					}
					action={
						<div className="flex flex-wrap items-center justify-end gap-2">
							<select
								aria-label="Authored fetch depth"
								className={cx(selectFieldClass, "h-9 w-[120px]!")}
								onChange={(event) =>
									setSyncMaxPages(Number(event.target.value))
								}
								title="More pages fetch more of your profile history"
								value={syncMaxPages}
							>
								<option value={1}>1 page</option>
								<option value={3}>3 pages</option>
								<option value={5}>5 pages</option>
								<option value={10}>10 pages</option>
							</select>
							{syncButton}
						</div>
					}
					controls={
						<>
							<div className="px-4 pb-3">
								<TimelineSearchAndSortField
									value={search}
									onChange={setSearch}
									placeholder="Search your posts"
									sortValue={sortBy || "newest"}
									onSortChange={setSortBy}
									sortOptions={[
										{ value: "newest", label: "Newest First" },
										{ value: "oldest", label: "Oldest First" },
										{ value: "likes", label: "Most Liked" },
										{ value: "replies", label: "Most Replied" },
									]}
								/>
							</div>
							<div className={tabStripClass}>
								{TABS.map((option) => {
									const active = tab === option.value;
									return (
										<button
											aria-pressed={active}
											className={cx(
												tabButtonClass,
												active && tabButtonActiveClass,
											)}
											key={option.value}
											onClick={() => setTab(option.value)}
											type="button"
										>
											<span className="relative inline-flex flex-col items-center justify-center py-1">
												{option.label}
												{active ? (
													<span className={tabButtonIndicatorClass} />
												) : null}
											</span>
										</button>
									);
								})}
							</div>
						</>
					}
				/>
			}
			notice={
				replyError ? (
					<p className={cx(timestampClass, "px-4 py-2 text-red-500")}>
						{replyError}
					</p>
				) : null
			}
			loading={loading}
			loadingLabel="Loading authored posts"
			loadingDetail="Reading locally archived posts and replies"
			error={error}
			errorTitle="Could not load authored posts"
			onRetry={retry}
			empty={items.length === 0}
			emptyLabel="No authored posts in this local archive yet"
			emptyDetail="Fetch your profile posts through Bird to fill this page."
			hasMore={hasMore}
			loadingMore={loadingMore}
			onLoadMore={loadMore}
		>
			<MyPostsProfilePanel
				account={selectedAccount}
				count={authoredCount}
				repostsCount={repostsCount}
			/>


			{stats && stats.totalPosts > 0 && (
				<div className="mx-4 mb-4 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm transition-all duration-200">
					<button
						className="flex w-full items-center justify-between px-4 py-3 text-left font-bold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
						onClick={() => setStatsCollapsed(!statsCollapsed)}
						type="button"
					>
						<span className="flex items-center gap-2 text-[14px]">
							<TrendingUp className="size-4 text-[var(--accent)]" />
							Archive Insights & Stats
						</span>
						{statsCollapsed ? (
							<ChevronDown className="size-4 text-[var(--ink-soft)]" />
						) : (
							<ChevronUp className="size-4 text-[var(--ink-soft)]" />
						)}
					</button>

					{!statsCollapsed && (
						<div className="flex flex-col border-t border-[var(--line)] divide-y divide-[var(--line)]">
							{/* Grid Metrics Section */}
							<div className="grid grid-cols-1 md:grid-cols-4 divide-y divide-[var(--line)] md:divide-y-0 md:divide-x">
								{/* Column 1: Overview */}
								<div className="flex flex-col gap-4 p-4">
									<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
										Overview
									</h3>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<div className="text-[20px] font-extrabold text-[var(--ink)]">
												{stats.totalPosts.toLocaleString()}
											</div>
											<div className="text-[12px] text-[var(--ink-soft)]">Total Posts</div>
										</div>
										<div>
											<div className="text-[20px] font-extrabold text-[var(--ink)]">
												{(stats.totalLikes + stats.totalReplies).toLocaleString()}
											</div>
											<div className="text-[12px] text-[var(--ink-soft)]">Total Engagement</div>
										</div>
									</div>
								</div>

								<div className="flex flex-col gap-4 p-4">
									<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
										Profile Mix
									</h3>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<div className="text-[20px] font-extrabold text-[var(--ink)]">
												{stats.repostsCount.toLocaleString()}
											</div>
											<div className="text-[12px] text-[var(--ink-soft)]">Reposts</div>
										</div>
										<div>
											<div className="text-[20px] font-extrabold text-[var(--ink)]">
												{(stats.broadcastsCount + stats.repliesCount).toLocaleString()}
											</div>
											<div className="text-[12px] text-[var(--ink-soft)]">Own Posts</div>
										</div>
									</div>
								</div>

								{/* Column 2: Averages */}
								<div className="flex flex-col gap-4 p-4">
									<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
										Averages
									</h3>
									<div className="grid grid-cols-2 gap-4">
										<div>
											<div className="text-[20px] font-extrabold text-[var(--ink)]">
												{stats.avgLikes}
											</div>
											<div className="text-[12px] text-[var(--ink-soft)]">Likes / Post</div>
										</div>
										<div>
											<div className="text-[20px] font-extrabold text-[var(--ink)]">
												{stats.avgReplies}
											</div>
											<div className="text-[12px] text-[var(--ink-soft)]">Replies / Post</div>
										</div>
									</div>
								</div>

								{/* Column 3: Highlights */}
								<div className="flex flex-col gap-3 p-4">
									<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
										Highlights
									</h3>
									<div className="flex flex-col gap-2">
										{stats.mostLikedTweet && (
											<a
												className="group flex items-start gap-2 rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-hover)] text-[13px] text-[var(--ink)] no-underline"
												href={`https://x.com/${selectedAccount?.handle?.replace(/^@/, "")}/status/${stats.mostLikedTweet.id}`}
												rel="noreferrer"
												target="_blank"
											>
												<Heart className="mt-0.5 size-4 shrink-0 text-red-500" />
												<div className="min-w-0">
													<div className="flex items-center gap-1.5 font-bold">
														Most Liked ({stats.mostLikedTweet.likeCount})
													</div>
													<div className="truncate text-[12px] text-[var(--ink-soft)] group-hover:text-[var(--ink)]">
														{stats.mostLikedTweet.text}
													</div>
												</div>
											</a>
										)}
										{stats.mostRepliedTweet && (
											<a
												className="group flex items-start gap-2 rounded-lg p-1.5 transition-colors hover:bg-[var(--bg-hover)] text-[13px] text-[var(--ink)] no-underline"
												href={`https://x.com/${selectedAccount?.handle?.replace(/^@/, "")}/status/${stats.mostRepliedTweet.id}`}
												rel="noreferrer"
												target="_blank"
											>
												<MessageCircle className="mt-0.5 size-4 shrink-0 text-blue-500" />
												<div className="min-w-0">
													<div className="flex items-center gap-1.5 font-bold">
														Most Replied ({stats.mostRepliedTweet.replyCount})
													</div>
													<div className="truncate text-[12px] text-[var(--ink-soft)] group-hover:text-[var(--ink)]">
														{stats.mostRepliedTweet.text}
													</div>
												</div>
											</a>
										)}
									</div>
								</div>
							</div>

							{/* Engagement Balance Progress Bar */}
							<div className="flex flex-col gap-2.5 p-4 bg-[var(--bg-hover)]">
								<div className="flex items-center justify-between text-[13px]">
									<span className="font-bold text-[var(--ink)]">Engagement Balance</span>
									<span className={cx(
										"font-extrabold text-[12px] px-2 py-0.5 rounded-full",
										stats.replyRatio < 20 
											? "bg-orange-500/10 text-orange-500 border border-orange-500/25 animate-pulse" 
											: "bg-green-500/10 text-green-500 border border-green-500/25"
									)}>
										{stats.replyRatio}% replies {stats.replyRatio < 20 && "⚠️ Isolation Risk"}
									</span>
								</div>
								<div className="h-3 w-full overflow-hidden rounded-full bg-[var(--line)] flex">
									<div 
										style={{ width: `${100 - stats.replyRatio}%` }} 
										className="h-full bg-[var(--accent)] transition-all duration-500" 
										title={`Broadcasts: ${stats.broadcastsCount}`}
									/>
									<div 
										style={{ width: `${stats.replyRatio}%` }} 
										className="h-full bg-green-500 transition-all duration-500" 
										title={`Replies: ${stats.repliesCount}`}
									/>
								</div>
								<div className="flex justify-between text-[11px] font-medium text-[var(--ink-soft)]">
									<span>Broadcasts: {stats.broadcastsCount} ({Math.round(100 - stats.replyRatio)}%)</span>
									<span>Replies: {stats.repliesCount} ({Math.round(stats.replyRatio)}%)</span>
								</div>
							</div>

							{/* High-Authority Radar Widget */}
							{stats.radarItems && stats.radarItems.length > 0 && (
								<div className="p-4 flex flex-col gap-3">
									<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)] flex items-center gap-1.5">
										<Sparkles className="size-4 text-[var(--accent)]" />
										High-Authority Radar (Engage Upstream)
									</h3>
									<div className="flex flex-col gap-3 max-h-[340px] overflow-y-auto pr-1 scrollbar-thin">
										{stats.radarItems.map((item) => {
											const timeDiff = Date.now() - new Date(item.createdAt).getTime();
											const under30m = timeDiff < 30 * 60 * 1000;
											const under2h = timeDiff < 2 * 60 * 60 * 1000;
											
											const timeLabel = timeDiff < 60 * 1000 
												? "Just now" 
												: timeDiff < 60 * 60 * 1000 
													? `${Math.floor(timeDiff / 60000)}m ago` 
													: timeDiff < 24 * 60 * 60 * 1000 
														? `${Math.floor(timeDiff / 3600000)}h ago` 
														: new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

											return (
												<div key={item.id} className="group flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 transition-all hover:border-[var(--accent-soft)] hover:bg-[var(--bg-hover)]">
													{item.authorAvatarUrl ? (
														<img src={item.authorAvatarUrl} alt="" className="size-9 rounded-full object-cover shrink-0 ring-1 ring-[var(--line)]" />
													) : (
														<div className="size-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-bold flex items-center justify-center shrink-0">
															{item.authorName.slice(0, 1).toUpperCase()}
														</div>
													)}
													<div className="min-w-0 flex-1">
														<div className="flex flex-wrap items-center gap-1.5 text-[12px]">
															<span className="font-bold text-[var(--ink)]">{item.authorName}</span>
															<span className="text-[var(--ink-soft)]">@{item.authorHandle}</span>
															<span className="rounded-full bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-soft)]">
																{(item.authorFollowers / 1000).toFixed(1)}k followers
															</span>
															<span className="text-[var(--ink-soft)] ml-auto text-[11px]">{timeLabel}</span>
														</div>
														
														<p className="mt-1.5 text-[13px] leading-[1.45] text-[var(--ink)] line-clamp-2 select-text">
															{item.text}
														</p>
														
														<div className="mt-2 flex flex-wrap items-center gap-3 text-[11px] text-[var(--ink-soft)]">
															<span>{item.likeCount} likes</span>
															<span>{item.replyCount} replies</span>
															
															{under30m ? (
																<span className="inline-flex items-center gap-1 font-bold text-green-500">
																	<span className="size-1.5 rounded-full bg-green-500 animate-pulse" />
																	Live Algorithmic Window (under 30m)
																</span>
															) : under2h ? (
																<span className="inline-flex items-center gap-1 font-semibold text-blue-500">
																	<span className="size-1.5 rounded-full bg-blue-500" />
																	High Priority (under 2h)
																</span>
															) : null}
															
															<a 
																href={`https://x.com/${item.authorHandle}/status/${item.id}`}
																target="_blank"
																rel="noreferrer"
																className="ml-auto font-semibold text-[var(--accent)] hover:underline flex items-center gap-0.5"
															>
																Engage on X <ExternalLink className="size-3" />
															</a>
														</div>
													</div>
												</div>
											);
										})}
									</div>
								</div>
							)}
						</div>
					)}
				</div>
			)}
			{sortedItems.map((item) => (
				<TimelineCard key={item.id} item={item} onReply={replyToTweet} />
			))}
			<MyPostsFooter count={authoredCount} syncControl={syncButton} />
		</TimelineFeedShell>
	);
}
