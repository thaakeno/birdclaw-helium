import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search, X, Users, PinOff, ExternalLink } from "lucide-react";
import { AvatarChip } from "#/components/AvatarChip";
import { readPinnedProfiles, writePinnedProfiles } from "#/lib/nav-preferences";
import { TimelineFeedHeader, TimelineFeedShell, TimelineHeaderSubtitle } from "#/components/TimelineFeedShell";
import { cx, secondaryButtonClass } from "#/lib/ui";

export const Route = createFileRoute("/circle")({
	component: CircleRoute,
});

function CircleRoute() {
	const [pinnedProfiles, setPinnedProfiles] = useState(() => readPinnedProfiles());
	const [searchQuery, setSearchQuery] = useState("");
	const [searchCounts, setSearchCounts] = useState<Record<string, number>>({});
	const [countsLoading, setCountsLoading] = useState(false);

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
	function handleUnpin(handle: string) {
		const filtered = pinnedProfiles.filter((p) => p.handle.toLowerCase() !== handle.toLowerCase());
		writePinnedProfiles(filtered);
		setPinnedProfiles(filtered);
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

	const subtitleText =
		pinnedProfiles.length === 1
			? "1 profile in your circle"
			: `${pinnedProfiles.length} profiles in your circle`;

	return (
		<TimelineFeedShell
			loading={false}
			loadingLabel=""
			loadingDetail=""
			error={null}
			errorTitle=""
			onRetry={() => {}}
			empty={false}
			emptyLabel=""
			emptyDetail=""
			hasMore={false}
			loadingMore={false}
			onLoadMore={() => {}}
			header={
				<TimelineFeedHeader
					title="My Circle"
					subtitles={<TimelineHeaderSubtitle>{subtitleText}</TimelineHeaderSubtitle>}
					controls={
						<div className="px-4 pb-3">
							<div className="relative w-full">
								<Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
								<input
									type="search"
									placeholder="Search query across all pinned profiles..."
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
						</div>
					}
				/>
			}
		>
			<div className="flex flex-col gap-4 px-4 py-5 animate-slide-in">
				{pinnedProfiles.length === 0 ? (
					<div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-12 text-center">
						<Users className="size-10 text-[var(--ink-soft)]" />
						<h3 className="m-0 text-[16px] font-bold text-[var(--ink)]">Your Circle is empty</h3>
						<p className="m-0 text-[13px] text-[var(--ink-soft)] max-w-sm">
							Pin profiles from the sidebar or user pages to keep track of them and query them globally.
						</p>
					</div>
				) : (
					<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
						{pinnedProfiles.map((profile) => {
							const hasMatches = searchQuery.trim() !== "";
							const matchCount = searchCounts[profile.handle.toLowerCase()] ?? 0;

							return (
								<div
									key={profile.handle}
									className="group flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4 transition-all hover:bg-[var(--bg-hover)] hover:shadow-sm"
								>
									<div className="flex items-start justify-between gap-3">
										<Link
											to="/profiles/$handle"
											params={{ handle: profile.handle }}
											className="flex items-center gap-3 min-w-0 no-underline"
										>
											<AvatarChip
												avatarUrl={profile.avatarUrl}
												hue={profile.avatarHue ?? 180}
												name={profile.displayName || profile.handle}
												profileId={profile.profileId}
												size="large"
											/>
											<div className="min-w-0">
												<h3 className="m-0 truncate text-[15px] font-bold text-[var(--ink)] hover:underline">
													{profile.displayName || profile.handle}
												</h3>
												<p className="m-0 truncate text-[13px] text-[var(--ink-soft)]">
													@{profile.handle}
												</p>
											</div>
										</Link>

										<button
											onClick={() => handleUnpin(profile.handle)}
											className="rounded-full p-2 text-[var(--ink-soft)] hover:bg-[var(--bg-active)] hover:text-[var(--alert)] transition-colors"
											title="Remove from Circle"
											type="button"
										>
											<PinOff className="size-4" />
										</button>
									</div>

									{hasMatches && (
										<div className="mt-auto flex items-center justify-between border-t border-[var(--line)] pt-3">
											{countsLoading ? (
												<span className="text-[12px] text-[var(--ink-soft)] animate-pulse">
													Counting...
												</span>
											) : (
												<span
													className={cx(
														"inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold",
														matchCount > 0
															? "bg-[var(--accent-soft)] text-[var(--accent)]"
															: "bg-[var(--bg-active)] text-[var(--ink-soft)]"
													)}
												>
													{matchCount.toLocaleString()} matches for query
												</span>
											)}

											<Link
												to="/profiles/$handle"
												params={{ handle: profile.handle }}
												search={{ search: searchQuery }}
												className="inline-flex items-center gap-1 text-[12px] font-semibold text-[var(--accent)] hover:underline no-underline"
											>
												View posts <ExternalLink className="size-3" />
											</Link>
										</div>
									)}

									{!hasMatches && (
										<div className="mt-auto flex justify-end border-t border-[var(--line)] pt-3">
											<Link
												to="/profiles/$handle"
												params={{ handle: profile.handle }}
												className={cx(
													secondaryButtonClass,
													"h-8.5 rounded-full px-3 text-[12px] gap-1.5 flex items-center"
												)}
											>
												Go to profile
												<ExternalLink className="size-3" />
											</Link>
										</div>
									)}
								</div>
							);
						})}
					</div>
				)}
			</div>
		</TimelineFeedShell>
	);
}
