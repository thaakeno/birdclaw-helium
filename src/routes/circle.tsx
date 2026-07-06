import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { X, Image, MessageSquareQuote, Rows3, UserRound, RefreshCw, ChevronDown } from "lucide-react";
import { AvatarChip } from "#/components/AvatarChip";
import { TimelineCard } from "#/components/TimelineCard";
import { readPinnedProfiles, writePinnedProfiles, type PinnedProfileNavItem } from "#/lib/nav-preferences";
import { TimelineFeedHeader, TimelineFeedShell, TimelineHeaderSubtitle, TimelineSearchAndSortField } from "#/components/TimelineFeedShell";
import { useTimelineRouteData } from "#/components/useTimelineRouteData";
import { cx } from "#/lib/ui";
import type { TimelineQuery } from "#/lib/types";

export const Route = createFileRoute("/circle")({
	component: CircleRoute,
});

const SORT_OPTIONS: Array<{
	value: NonNullable<TimelineQuery["sort"]>;
	label: string;
}> = [
	{ value: "created-desc", label: "Newest post" },
	{ value: "created-asc", label: "Oldest post" },
	{ value: "likes-desc", label: "Most liked" },
	{ value: "replies-desc", label: "Most replied" },
];

function CircleRoute() {
	const [pinnedProfiles, setPinnedProfiles] = useState<PinnedProfileNavItem[]>(() => readPinnedProfiles());
	const [searchQuery, setSearchQuery] = useState("");
	const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);

	// Filter state toggles
	const [sortBy, setSortBy] = useState<TimelineQuery["sort"]>("created-desc");
	const [mediaOnly, setMediaOnly] = useState(false);
	const [quotedOnly, setQuotedOnly] = useState(false);
	const [originalsOnly, setOriginalsOnly] = useState(false);
	const [repliesOnly, setRepliesOnly] = useState(false);

	// Sync state
	const [syncing, setSyncing] = useState(false);
	const [syncDropdownOpen, setSyncDropdownOpen] = useState(false);

	// Sync local state if storage updates elsewhere
	useEffect(() => {
		const handler = () => {
			setPinnedProfiles(readPinnedProfiles());
		};
		window.addEventListener("birdclaw:nav-preferences", handler);
		window.addEventListener("storage", handler);
		return () => {
			window.removeEventListener("birdclaw:nav-preferences", handler);
			window.removeEventListener("storage", handler);
		};
	}, []);

	// Click outside sync dropdown to close it
	useEffect(() => {
		if (!syncDropdownOpen) return;
		const close = () => setSyncDropdownOpen(false);
		window.addEventListener("click", close);
		return () => window.removeEventListener("click", close);
	}, [syncDropdownOpen]);

	// Unpin handler
	function handleUnpin(handle: string, e: React.MouseEvent) {
		e.stopPropagation();
		e.preventDefault();
		const filtered = pinnedProfiles.filter((p) => p.handle.toLowerCase() !== handle.toLowerCase());
		writePinnedProfiles(filtered);
		setPinnedProfiles(filtered);
		if (selectedAuthor?.toLowerCase() === handle.toLowerCase()) {
			setSelectedAuthor(null);
		}
		window.dispatchEvent(new Event("birdclaw:nav-preferences"));
	}

	// Trigger manual/auto profile feeds sync
	async function runSync(mode: "newest" | "deep" | "local") {
		if (pinnedProfiles.length === 0) return;
		setSyncing(true);
		try {
			const refreshParam = mode !== "local" ? "true" : "false";
			for (const profile of pinnedProfiles) {
				try {
					await fetch(
						`/api/profile-context?handle=${encodeURIComponent(
							profile.handle
						)}&refresh=${refreshParam}&mode=${mode}`
					);
				} catch (err) {
					console.error(`Failed to sync feed for @${profile.handle}:`, err);
				}
			}
			if (mode !== "local") {
				localStorage.setItem("birdclaw:circle-last-sync", Date.now().toString());
			}
			await refreshLocalView();
		} catch (err) {
			console.error("Circle sync failed:", err);
		} finally {
			setSyncing(false);
		}
	}

	// Auto-Sync Circle Profiles on mount/startup (cooldown: 5 minutes)
	useEffect(() => {
		const lastSyncStr = localStorage.getItem("birdclaw:circle-last-sync");
		const lastSync = lastSyncStr ? parseInt(lastSyncStr, 10) : 0;
		const cooldown = 5 * 60 * 1000; // 5 minutes

		if (Date.now() - lastSync < cooldown) {
			return;
		}
		// Default to "newest" feed sync on startup
		void runSync("newest");
	}, []);

	// Fetch unified timeline feed!
	const handlesQueryParam = useMemo(() => {
		if (selectedAuthor) return undefined;
		return pinnedProfiles.map((p) => p.handle).join(",");
	}, [selectedAuthor, pinnedProfiles]);

	const {
		items: timelineItems,
		loading,
		error,
		refreshLocalView,
		loadMore,
		loadingMore,
		hasMore,
	} = useTimelineRouteData({
		resource: "circle" as any,
		search: searchQuery,
		errorFallback: "Circle timeline unavailable",
		author: selectedAuthor || undefined,
		handles: handlesQueryParam,
		sort: sortBy,
		mediaOnly,
		quotedOnly,
		originalsOnly,
		repliesOnly,
	});

	// Smart client-side matching counts (No API search roundtrip, blazing fast!)
	const searchCounts = useMemo(() => {
		const counts: Record<string, number> = {};
		const query = searchQuery.trim().toLowerCase();
		if (!query) return counts;

		for (const item of timelineItems) {
			const text = item.text || "";
			if (text.toLowerCase().includes(query)) {
				const handle = item.author.handle.toLowerCase();
				counts[handle] = (counts[handle] || 0) + 1;
			}
		}
		return counts;
	}, [timelineItems, searchQuery]);

	const subtitleText = syncing
		? "Syncing feeds..."
		: pinnedProfiles.length === 1
			? "1 profile in your circle"
			: `${pinnedProfiles.length} profiles in your circle`;

	return (
		<TimelineFeedShell
			loading={loading}
			loadingLabel="Loading circle timeline..."
			loadingDetail="Merging posts from your circle"
			error={error}
			errorTitle="Could not load Circle timeline"
			onRetry={refreshLocalView}
			empty={timelineItems.length === 0}
			emptyLabel="No posts found"
			emptyDetail={
				pinnedProfiles.length === 0
					? "Pin profiles from user pages to build your circle."
					: "Try adjusting your search query or filters."
			}
			hasMore={hasMore}
			loadingMore={loadingMore}
			onLoadMore={loadMore}
			header={
				<TimelineFeedHeader
					title="My Circle"
					subtitles={
						<TimelineHeaderSubtitle>
							<span className="flex items-center gap-2">
								{syncing && <RefreshCw className="size-3 animate-spin text-[var(--accent)]" />}
								{subtitleText}
							</span>
						</TimelineHeaderSubtitle>
					}
					controls={
						<div className="flex flex-col gap-3 px-4 pb-3">
							{/* Unified Connected Search, Sort & Sync Row */}
							<div className="flex items-center gap-2">
								<div className="flex-1">
									<TimelineSearchAndSortField
										value={searchQuery}
										onChange={setSearchQuery}
										placeholder="Search keywords across your circle..."
										sortValue={sortBy || "created-desc"}
										onSortChange={setSortBy}
										sortOptions={SORT_OPTIONS}
									/>
								</div>

								{/* Sync Dropdown Button */}
								<div className="relative shrink-0">
									<button
										onClick={(e) => {
											e.stopPropagation();
											setSyncDropdownOpen(!syncDropdownOpen);
										}}
										disabled={syncing}
										className={cx(
											"inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--bg)] hover:bg-[var(--bg-hover)] px-4 text-[13px] font-bold text-[var(--ink)] cursor-pointer disabled:opacity-60 transition-all select-none"
										)}
										type="button"
									>
										<RefreshCw className={cx("size-3.5", syncing && "animate-spin")} />
										<span>Sync Feeds</span>
										<ChevronDown className="size-3.5" />
									</button>

									{syncDropdownOpen && (
										<div className="absolute right-0 top-full mt-1.5 z-55 min-w-[170px] rounded-2xl border border-[var(--line)] bg-[var(--panel)] py-1.5 shadow-xl animate-slide-in">
											<button
												onClick={() => runSync("newest")}
												className="w-full text-left px-3.5 py-2 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors cursor-pointer"
											>
												<RefreshCw className="size-3.5" />
												Sync newest
											</button>
											<button
												onClick={() => runSync("deep")}
												className="w-full text-left px-3.5 py-2 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors cursor-pointer"
											>
												<RefreshCw className="size-3.5 text-blue-500" />
												Deep Refresh
											</button>
											<button
												onClick={() => runSync("local")}
												className="w-full text-left px-3.5 py-2 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] flex items-center gap-2 transition-colors cursor-pointer"
											>
												<Rows3 className="size-3.5 text-green-500" />
												Use local only
											</button>
										</div>
									)}
								</div>
							</div>

							{/* Filter Pill Badges */}
							<div className="flex flex-wrap gap-2">
								<button
									aria-pressed={mediaOnly}
									onClick={() => setMediaOnly(!mediaOnly)}
									className={cx(
										"inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-all cursor-pointer",
										mediaOnly
											? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]"
											: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
									)}
									type="button"
								>
									<Image className="size-3.5" /> Media Only
								</button>

								<button
									aria-pressed={quotedOnly}
									onClick={() => setQuotedOnly(!quotedOnly)}
									className={cx(
										"inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-all cursor-pointer",
										quotedOnly
											? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]"
											: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
									)}
									type="button"
								>
									<MessageSquareQuote className="size-3.5" /> Quotes
								</button>

								<button
									aria-pressed={originalsOnly}
									onClick={() => {
										setOriginalsOnly(!originalsOnly);
										if (!originalsOnly) setRepliesOnly(false);
									}}
									className={cx(
										"inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-all cursor-pointer",
										originalsOnly
											? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]"
											: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
									)}
									type="button"
								>
									<Rows3 className="size-3.5" /> Originals
								</button>

								<button
									aria-pressed={repliesOnly}
									onClick={() => {
										setRepliesOnly(!repliesOnly);
										if (!repliesOnly) setOriginalsOnly(false);
									}}
									className={cx(
										"inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-[12px] font-bold transition-all cursor-pointer",
										repliesOnly
											? "border-[var(--accent-soft)] bg-[var(--accent-soft)] text-[var(--accent)]"
											: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
									)}
									type="button"
								>
									<UserRound className="size-3.5" /> Replies
								</button>
							</div>

							{/* Pinned profiles filters container */}
							{pinnedProfiles.length > 0 && (
								<div className="flex flex-wrap items-center gap-2 pt-2 border-t border-[var(--line)]">
									<button
										onClick={() => setSelectedAuthor(null)}
										className={cx(
											"inline-flex h-7 items-center rounded-full px-3 text-[11px] font-bold transition-all cursor-pointer",
											selectedAuthor === null
												? "bg-[var(--accent)] text-white shadow-sm"
												: "bg-[var(--bg-active)] text-[var(--ink-soft)] hover:text-[var(--ink)]"
										)}
										type="button"
									>
										All Profiles
									</button>

									{pinnedProfiles.map((p) => {
										const isSelected = selectedAuthor?.toLowerCase() === p.handle.toLowerCase();
										const matchCount = searchCounts[p.handle.toLowerCase()] ?? 0;
										const hasSearch = searchQuery.trim() !== "";

										return (
											<div
												key={p.handle}
												onClick={() => setSelectedAuthor(isSelected ? null : p.handle)}
												className={cx(
													"inline-flex h-7 items-center gap-1.5 rounded-full pl-1.5 pr-2.5 text-[11px] font-bold cursor-pointer transition-all border select-none",
													isSelected
														? "border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent)]"
														: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
												)}
											>
												<AvatarChip
													avatarUrl={p.avatarUrl}
													hue={p.avatarHue ?? 180}
													name={p.displayName || p.handle}
													profileId={p.profileId}
													size="small"
												/>
												<span>{p.displayName || p.handle}</span>
												{hasSearch && (
													<span className="rounded-full bg-[color:color-mix(in_srgb,var(--accent)_12%,var(--bg-active))] px-1.5 py-0.5 text-[9px]">
														{matchCount}
													</span>
												)}
												<button
													onClick={(e) => handleUnpin(p.handle, e)}
													className="ml-1 -mr-1 rounded-full p-0.5 hover:bg-black/10 hover:text-[var(--alert)] transition-colors"
													title="Unpin profile"
													type="button"
												>
													<X className="size-3" />
												</button>
											</div>
										);
									})}
								</div>
							)}
						</div>
					}
				/>
			}
		>
			<div className="flex flex-col animate-slide-in">
				{timelineItems.map((item) => (
					<TimelineCard key={item.id} item={item} onReply={() => {}} />
				))}
			</div>
		</TimelineFeedShell>
	);
}
