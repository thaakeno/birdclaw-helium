import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useMemo } from "react";
import { Search, X } from "lucide-react";
import { AvatarChip } from "#/components/AvatarChip";
import { TimelineCard } from "#/components/TimelineCard";
import { readPinnedProfiles, writePinnedProfiles } from "#/lib/nav-preferences";
import { TimelineFeedHeader, TimelineFeedShell, TimelineHeaderSubtitle } from "#/components/TimelineFeedShell";
import { useTimelineRouteData } from "#/components/useTimelineRouteData";
import { cx } from "#/lib/ui";

export const Route = createFileRoute("/circle")({
	component: CircleRoute,
});

function CircleRoute() {
	const [pinnedProfiles, setPinnedProfiles] = useState(() => readPinnedProfiles());
	const [searchQuery, setSearchQuery] = useState("");
	const [searchCounts, setSearchCounts] = useState<Record<string, number>>({});
	const [countsLoading, setCountsLoading] = useState(false);
	const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);

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

	// Fetch search counts when query changes
	useEffect(() => {
		const trimmed = searchQuery.trim();
		if (!trimmed || pinnedProfiles.length === 0) {
			setSearchCounts({});
			return;
		}

		const controller = new AbortController();
		const handles = pinnedProfiles.map((p) => p.handle).join(",");

		async function fetchCounts() {
			setCountsLoading(true);
			try {
				const response = await fetch(
					`/api/circle-search?search=${encodeURIComponent(trimmed)}&handles=${encodeURIComponent(handles)}`,
					{ signal: controller.signal }
				);
				if (response.ok) {
					const data = (await response.json()) as { counts: Record<string, number> };
					setSearchCounts(data.counts || {});
				}
			} catch (err) {
				if (err instanceof Error && err.name !== "AbortError") {
					console.error("Circle search count query failed:", err);
				}
			} finally {
				setCountsLoading(false);
			}
		}

		const timeoutId = setTimeout(() => {
			void fetchCounts();
		}, 250);

		return () => {
			clearTimeout(timeoutId);
			controller.abort();
		};
	}, [searchQuery, pinnedProfiles]);

	// Fetch unified timeline feed!
	// If a specific author is selected, we filter by that author handle.
	// Otherwise, we pass the handles of all pinned profiles.
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
	});

	const subtitleText =
		pinnedProfiles.length === 1
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
					subtitles={<TimelineHeaderSubtitle>{subtitleText}</TimelineHeaderSubtitle>}
					controls={
						<div className="flex flex-col gap-3 px-4 pb-3">
							{/* Global Search box */}
							<div className="relative w-full">
								<Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
								<input
									type="search"
									placeholder="Search keywords across your circle..."
									value={searchQuery}
									onChange={(e) => setSearchQuery(e.target.value)}
									className="h-10 w-full rounded-full border border-[var(--line-strong)] bg-[var(--bg)] pl-10 pr-10 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
								/>
								{searchQuery && (
									<button
										type="button"
										onClick={() => setSearchQuery("")}
										className="absolute right-3.5 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] hover:text-[var(--ink)]"
										aria-label="Clear search"
									>
										<X className="size-4" />
									</button>
								)}
							</div>

							{/* Pinned profiles filters container */}
							{pinnedProfiles.length > 0 && (
								<div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[var(--line)]">
									<button
										onClick={() => setSelectedAuthor(null)}
										className={cx(
											"inline-flex h-7 items-center rounded-full px-3 text-[11px] font-bold transition-all",
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
														{countsLoading ? "..." : matchCount}
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
