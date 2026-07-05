import { createFileRoute } from "@tanstack/react-router";
import {
	ChevronDown,
	ExternalLink,
	Loader2,
	Pin,
	PinOff,
	RefreshCw,
	Sparkles,
	TrendingUp,
} from "lucide-react";
import { useEffect, useRef, useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { SyncNowButton } from "#/components/SyncNowButton";

import { AvatarChip } from "#/components/AvatarChip";
import { TimelineCard } from "#/components/TimelineCard";
import { TweetRichText } from "#/components/TweetRichText";
import { ConversationSurfaceScope } from "#/lib/conversation-surface";
import {
	cx,
	feedClass,
	secondaryButtonClass,
	selectFieldClass,
} from "#/lib/ui";
import {
	cleanProfileHandle,
	formatProfileAnalysisCounts,
	ProfileAnalysisOutput,
	ProfileAnalysisStatusLine,
	useProfileAnalysisStream,
} from "#/components/ProfileAnalysisStream";
import {
	PROFILE_CONTEXT_VIEW_LIMITS,
	profileContextRequestError,
	profileContextUrl,
} from "#/components/ProfileAnalysisClient";
import { formatCompactNumber } from "#/lib/present";
import type { ProfileAnalysisContext } from "#/lib/profile-analysis";
import {
	readPinnedProfiles,
	writePinnedProfiles,
	type PinnedProfileNavItem,
} from "#/lib/nav-preferences";
import { profileDescriptionEntitiesFromXurl } from "#/lib/tweet-render";
import type {
	EmbeddedTweet,
	ProfileRecord,
	TimelineItem,
	TweetEntities,
} from "#/lib/types";

export const Route = createFileRoute("/profiles/$handle")({
	component: ProfilesHandleRoute,
});

const profileHeaderButtonClass =
	"inline-flex items-center justify-center gap-1.5 rounded-full border border-[var(--line-strong)] bg-[var(--bg)] px-4 py-1.5 text-[14px] font-bold text-[var(--ink)] shadow-sm transition-colors duration-150 hover:bg-[var(--bg-hover)] disabled:cursor-default disabled:opacity-55";
const profileMentionRe = /(^|[^\w@./])@([A-Za-z0-9_]{1,15})\b/g;

const profileTimelineShellClass =
	"overflow-hidden border-y border-[var(--line)] bg-[var(--bg)]";

function stableHue(value: string) {
	let hash = 0;
	for (const char of value) {
		hash = (hash * 31 + char.charCodeAt(0)) % 360;
	}
	return hash;
}

function ProfilesHandleRoute() {
	const { handle } = Route.useParams();
	return <ProfileRouteView handle={handle} />;
}

function profilesByHandleFromContext(context: ProfileAnalysisContext | null) {
	const profilesByHandle = new Map<string, ProfileRecord>();
	if (!context) return profilesByHandle;
	profilesByHandle.set(context.profile.handle.toLowerCase(), context.profile);
	for (const profile of context.profiles ?? []) {
		profilesByHandle.set(profile.handle.toLowerCase(), profile);
	}
	for (const tweet of context.conversations) {
		profilesByHandle.set(tweet.author.toLowerCase(), {
			id: tweet.profileId,
			handle: tweet.author,
			displayName: tweet.name || tweet.author,
			bio: tweet.bio,
			followersCount: tweet.followersCount,
			avatarHue: 210,
			avatarUrl: tweet.avatarUrl,
			createdAt: tweet.createdAt,
		});
	}
	return profilesByHandle;
}

function profileBioEntities(
	profile: ProfileRecord,
	profilesByHandle: Map<string, ProfileRecord>,
) {
	const entities = profileDescriptionEntitiesFromXurl(profile.entities);
	const mentions = entities.mentions ?? [];
	const existingMentionRanges = new Set(
		mentions.map((mention) => `${mention.start}:${mention.end}`),
	);
	for (const match of profile.bio.matchAll(profileMentionRe)) {
		const start = (match.index ?? 0) + match[1].length;
		const username = match[2];
		const end = start + username.length + 1;
		const key = `${start}:${end}`;
		if (existingMentionRanges.has(key)) continue;
		const linkedProfile = profilesByHandle.get(username.toLowerCase());
		mentions.push({
			username,
			start,
			end,
			...(linkedProfile ? { profile: linkedProfile } : {}),
		});
	}
	const next: TweetEntities = {
		...entities,
		...(mentions.length ? { mentions } : {}),
	};
	return next;
}

function ProfileBioText({
	profile,
	profilesByHandle,
}: {
	profile: ProfileRecord;
	profilesByHandle: Map<string, ProfileRecord>;
}) {
	return (
		<TweetRichText
			className="m-0 max-w-2xl whitespace-pre-wrap text-[15px] leading-[1.45] text-[var(--ink)] [overflow-wrap:anywhere]"
			entities={profileBioEntities(profile, profilesByHandle)}
			text={profile.bio}
			urlLabel="expanded"
		/>
	);
}

export function ProfileRouteView({ handle }: { handle: string }) {
	const cleanHandle = cleanProfileHandle(handle);
	const sessionKey = `birdclaw.session.profile.${cleanHandle.toLowerCase()}`;
	const analysis = useProfileAnalysisStream(cleanHandle);
	const [context, setContext] = useState<ProfileAnalysisContext | null>(null);
	const [contextLoading, setContextLoading] = useState(false);
	const [contextError, setContextError] = useState<string | null>(null);
	const autoRunHandleRef = useRef("");
	const [syncDropdownOpen, setSyncDropdownOpen] = useState(false);

	useEffect(() => {
		if (!syncDropdownOpen) return;
		const close = () => setSyncDropdownOpen(false);
		window.addEventListener("click", close);
		return () => window.removeEventListener("click", close);
	}, [syncDropdownOpen]);

	const profile = analysis.context?.profile ?? context?.profile;
	const displayName = profile?.displayName || `@${cleanHandle}`;
	const bio = profile?.bio ?? "";
	const activeContext = analysis.context ?? context;
	const profilesByHandle = profilesByHandleFromContext(activeContext);

	const isCurrentUser = useMemo(() => {
		if (!cleanHandle) return false;
		if (cleanHandle.toLowerCase() === "thaakeno") return true;
		if (activeContext?.accountHandle) {
			return (
				cleanHandle.toLowerCase() ===
				activeContext.accountHandle.replace(/^@/, "").toLowerCase()
			);
		}
		return false;
	}, [cleanHandle, activeContext?.accountHandle]);

	const [profileTab, setProfileTab] = useState<"timeline" | "insights">(
		() => readProfileSession(sessionKey).tab ?? "timeline",
	);
	const [pinnedProfiles, setPinnedProfiles] = useState<PinnedProfileNavItem[]>(
		[],
	);
	const pinnedProfileHandle = (profile?.handle ?? cleanHandle).replace(
		/^@/,
		"",
	);
	const isPinnedProfile = pinnedProfiles.some(
		(item) => item.handle.toLowerCase() === pinnedProfileHandle.toLowerCase(),
	);

	const statsQuery = useQuery({
		queryKey: ["authored-stats", activeContext?.accountId],
		queryFn: async () => {
			if (!activeContext?.accountId) return null;
			const response = await fetch(
				`/api/authored-stats?account=${activeContext.accountId}`,
			);
			if (!response.ok) throw new Error("Failed to fetch stats");
			return response.json() as Promise<{
				totalPosts: number;
				totalLikes: number;
				totalReplies: number;
				broadcastsCount: number;
				repliesCount: number;
				replyRatio: number;
				avgLikes: number;
				avgReplies: number;
				mostLikedTweet: {
					id: string;
					text: string;
					likeCount: number;
					replyCount: number;
				} | null;
				mostRepliedTweet: {
					id: string;
					text: string;
					likeCount: number;
					replyCount: number;
				} | null;
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
		enabled: isCurrentUser && !!activeContext?.accountId,
	});
	const stats = statsQuery.data ?? null;

	async function fetchProfileContext(mode: "local" | "newest" | "deep") {
		if (!cleanHandle) return;
		setContextLoading(true);
		setContextError(null);
		try {
			const limits =
				mode === "deep"
					? {
							...PROFILE_CONTEXT_VIEW_LIMITS,
							maxPages: 10,
						}
					: PROFILE_CONTEXT_VIEW_LIMITS;
			const response = await fetch(
				profileContextUrl(cleanHandle, {
					refresh: mode !== "local",
					mode,
					...limits,
				}),
			);
			if (!response.ok) throw await profileContextRequestError(response);
			const payload = (await response.json()) as {
				context?: ProfileAnalysisContext;
			};
			if (!payload.context)
				throw new Error("Profile fetch returned no context.");
			setContext(payload.context);
		} catch (error) {
			setContextError(
				error instanceof Error ? error.message : "Profile fetch failed",
			);
		} finally {
			setContextLoading(false);
		}
	}

	useEffect(() => {
		if (cleanHandle && autoRunHandleRef.current !== cleanHandle) {
			autoRunHandleRef.current = cleanHandle;
			void fetchProfileContext("local");
		}
	}, [cleanHandle]);

	useEffect(() => {
		const saved = readProfileSession(sessionKey);
		if (!saved.scrollY) return;
		const frame = window.requestAnimationFrame(() =>
			window.scrollTo({ top: saved.scrollY }),
		);
		return () => window.cancelAnimationFrame(frame);
	}, [sessionKey]);

	useEffect(() => {
		writeProfileSession(sessionKey, { tab: profileTab });
		const saveScroll = () =>
			writeProfileSession(sessionKey, { scrollY: window.scrollY });
		window.addEventListener("scroll", saveScroll, { passive: true });
		return () => {
			saveScroll();
			window.removeEventListener("scroll", saveScroll);
		};
	}, [profileTab, sessionKey]);

	useEffect(() => {
		function loadPinnedProfiles() {
			setPinnedProfiles(readPinnedProfiles());
		}
		loadPinnedProfiles();
		window.addEventListener("birdclaw:nav-preferences", loadPinnedProfiles);
		window.addEventListener("storage", loadPinnedProfiles);
		return () => {
			window.removeEventListener(
				"birdclaw:nav-preferences",
				loadPinnedProfiles,
			);
			window.removeEventListener("storage", loadPinnedProfiles);
		};
	}, []);

	function togglePinnedProfile() {
		if (!pinnedProfileHandle) return;
		const normalized = pinnedProfileHandle.toLowerCase();
		if (isPinnedProfile) {
			writePinnedProfiles(
				pinnedProfiles.filter(
					(item) => item.handle.toLowerCase() !== normalized,
				),
			);
			return;
		}
		writePinnedProfiles([
			{
				handle: pinnedProfileHandle,
				displayName,
				avatarUrl: profile?.avatarUrl,
				avatarHue: profile?.avatarHue,
				profileId: profile?.id,
				lastSyncedAt: new Date().toISOString(),
			},
			...pinnedProfiles,
		]);
	}

	return (
		<section className="flex min-h-screen flex-col">
			<header className="border-b border-[var(--line)] bg-[var(--bg)]">
				<div
					className="h-32 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--bg-active)_68%,var(--accent)_32%),color-mix(in_srgb,var(--bg)_70%,var(--accent)_30%))]"
					data-testid="profile-cover"
				/>
				<div className="px-4 pb-5">
					<div className="flex flex-col gap-4">
						<div
							className="-mt-8 flex items-start justify-between gap-3"
							data-testid="profile-avatar-overlap"
						>
							<div className="flex min-w-0 items-start gap-3">
								<span className="inline-grid rounded-full ring-4 ring-[var(--bg)]">
									<AvatarChip
										avatarUrl={profile?.avatarUrl ?? undefined}
										hue={profile?.avatarHue ?? stableHue(cleanHandle)}
										name={displayName}
										profileId={profile?.id}
										size="large"
									/>
								</span>
								<div className="min-w-0 pb-1 pt-9">
									<h1 className="m-0 truncate text-[24px] font-bold text-[var(--ink)]">
										{displayName}
									</h1>
									<div className="truncate text-[14px] text-[var(--ink-soft)]">
										@{profile?.handle ?? cleanHandle}
									</div>
								</div>
							</div>
							<div className="mt-10 flex shrink-0 items-center gap-2">
								<a
									className={profileHeaderButtonClass}
									href={`https://x.com/${encodeURIComponent(profile?.handle ?? cleanHandle)}`}
									rel="noreferrer"
									target="_blank"
								>
									<ExternalLink className="size-4" strokeWidth={1.8} />X
								</a>
								<button
									className={profileHeaderButtonClass}
									disabled={!pinnedProfileHandle}
									onClick={togglePinnedProfile}
									type="button"
								>
									{isPinnedProfile ? (
										<PinOff className="size-4" strokeWidth={1.8} />
									) : (
										<Pin className="size-4" strokeWidth={1.8} />
									)}
									{isPinnedProfile ? "Unpin" : "Pin"}
								</button>
								<div className="relative inline-flex items-stretch rounded-full border border-[var(--line-strong)] bg-[var(--bg)] shadow-sm">
									<button
										className="inline-flex items-center justify-center gap-1.5 rounded-l-full bg-transparent pl-4 pr-3 py-1.5 text-[14px] font-bold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-55"
										disabled={!cleanHandle || contextLoading}
										onClick={() => void fetchProfileContext("newest")}
										type="button"
									>
										{contextLoading ? (
											<Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
										) : (
											<RefreshCw className="size-4" strokeWidth={1.8} />
										)}
										Sync Profile
									</button>
									<span className="w-px bg-[var(--line-strong)]" />
									<button
										className="inline-flex items-center justify-center rounded-r-full bg-transparent px-2.5 py-1.5 text-[14px] font-bold text-[var(--ink)] hover:bg-[var(--bg-hover)] disabled:opacity-55"
										disabled={!cleanHandle || contextLoading}
										onClick={(e) => {
											e.stopPropagation();
											setSyncDropdownOpen(!syncDropdownOpen);
										}}
										type="button"
										aria-label="More sync options"
									>
										<ChevronDown className="size-4" />
									</button>
									{syncDropdownOpen && (
										<div className="absolute right-0 top-full z-[100] mt-1.5 w-48 overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] py-1 shadow-lg text-[13px] text-[var(--ink)]">
											<button
												className="block w-full px-4 py-2 text-left font-semibold hover:bg-[var(--bg-hover)]"
												onClick={() => {
													setSyncDropdownOpen(false);
													void fetchProfileContext("newest");
												}}
												type="button"
											>
												Fetch newest
											</button>
											<button
												className="block w-full px-4 py-2 text-left font-semibold hover:bg-[var(--bg-hover)]"
												onClick={() => {
													setSyncDropdownOpen(false);
													void fetchProfileContext("deep");
												}}
												type="button"
											>
												Deep refresh
											</button>
											<button
												className="block w-full px-4 py-2 text-left font-semibold hover:bg-[var(--bg-hover)]"
												onClick={() => {
													setSyncDropdownOpen(false);
													void fetchProfileContext("local");
												}}
												type="button"
											>
												Load local only
											</button>
										</div>
									)}
								</div>
								{isCurrentUser && (
									<SyncNowButton
										kind="authored"
										label="Sync profile"
										onSynced={() => void fetchProfileContext("newest")}
									/>
								)}
								<button
									className={profileHeaderButtonClass}
									disabled={!cleanHandle || analysis.loading}
									onClick={() => analysis.run(true, cleanHandle)}
									type="button"
								>
									{analysis.loading ? (
										<Loader2
											className="size-4 animate-spin"
											strokeWidth={1.8}
										/>
									) : (
										<Sparkles className="size-4" strokeWidth={1.8} />
									)}
									Analyze
								</button>
							</div>
						</div>

						{profile && bio ? (
							<ProfileBioText
								profile={profile}
								profilesByHandle={profilesByHandle}
							/>
						) : null}

						<div className="flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-[var(--ink-soft)]">
							{profile ? (
								<>
									<span>
										<strong className="text-[var(--ink)]">
											{formatCompactNumber(profile.followersCount)}
										</strong>{" "}
										followers
									</span>
									<span>
										<strong className="text-[var(--ink)]">
											{formatCompactNumber(profile.followingCount ?? 0)}
										</strong>{" "}
										following
									</span>
								</>
							) : null}
							<span>{formatProfileAnalysisCounts(activeContext)}</span>
							{activeContext?.health ? (
								<span className="rounded-full border border-[var(--line)] bg-[var(--panel)] px-2 py-0.5">
									{activeContext.health.source === "merged"
										? "local archive protected"
										: activeContext.health.source}
								</span>
							) : null}
						</div>
					</div>
				</div>
			</header>

			{isCurrentUser && (
				<div className="flex border-b border-[var(--line)] px-4 bg-[var(--bg)] select-none">
					<button
						onClick={() => setProfileTab("timeline")}
						className={cx(
							"px-4 py-3 text-[14px] font-bold border-b-2 transition-colors",
							profileTab === "timeline"
								? "border-[var(--accent)] text-[var(--ink)]"
								: "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]",
						)}
						type="button"
					>
						Timeline
					</button>
					<button
						onClick={() => setProfileTab("insights")}
						className={cx(
							"px-4 py-3 text-[14px] font-bold border-b-2 transition-colors",
							profileTab === "insights"
								? "border-[var(--accent)] text-[var(--ink)]"
								: "border-transparent text-[var(--ink-soft)] hover:text-[var(--ink)]",
						)}
						type="button"
					>
						Curation Insights
					</button>
				</div>
			)}

			<div className="flex flex-col gap-5 px-4 py-5">
				{contextLoading ? (
					<div className="flex items-center gap-2 text-[13px] font-medium text-[var(--ink-soft)]">
						<Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
						<span>Fetching @{cleanHandle} posts</span>
					</div>
				) : null}
				{contextError ? (
					<div className="rounded-[8px] border border-[var(--alert)] bg-[var(--alert-soft)] px-3 py-2 text-[14px] text-[var(--alert)]">
						{contextError}
					</div>
				) : null}

				{profileTab === "timeline" ? (
					<ProfilePostPreview
						context={activeContext}
						handle={cleanHandle}
						sessionKey={sessionKey}
					/>
				) : (
					<div className="flex flex-col gap-5">
						{stats && stats.totalPosts > 0 ? (
							<div className="overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel)] shadow-sm">
								<div className="flex items-center gap-2 px-4 py-3 font-bold border-b border-[var(--line)] text-[var(--ink)] bg-[var(--bg-hover)]">
									<TrendingUp className="size-4 text-[var(--accent)]" />
									Archive Insights & Stats
								</div>

								<div className="flex flex-col divide-y divide-[var(--line)]">
									{/* Averages & Overview Grid */}
									<div className="grid grid-cols-1 md:grid-cols-2 divide-y divide-[var(--line)] md:divide-y-0 md:divide-x">
										<div className="p-4 flex flex-col gap-3">
											<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
												Overview
											</h3>
											<div className="grid grid-cols-2 gap-4">
												<div>
													<div className="text-[20px] font-extrabold text-[var(--ink)]">
														{stats.totalPosts.toLocaleString()}
													</div>
													<div className="text-[12px] text-[var(--ink-soft)]">
														Total Posts
													</div>
												</div>
												<div>
													<div className="text-[20px] font-extrabold text-[var(--ink)]">
														{(
															stats.totalLikes + stats.totalReplies
														).toLocaleString()}
													</div>
													<div className="text-[12px] text-[var(--ink-soft)]">
														Total Engagement
													</div>
												</div>
											</div>
										</div>

										<div className="p-4 flex flex-col gap-3">
											<h3 className="m-0 text-[11px] font-bold uppercase tracking-wider text-[var(--ink-soft)]">
												Averages
											</h3>
											<div className="grid grid-cols-2 gap-4">
												<div>
													<div className="text-[20px] font-extrabold text-[var(--ink)]">
														{stats.avgLikes}
													</div>
													<div className="text-[12px] text-[var(--ink-soft)]">
														Likes / Post
													</div>
												</div>
												<div>
													<div className="text-[20px] font-extrabold text-[var(--ink)]">
														{stats.avgReplies}
													</div>
													<div className="text-[12px] text-[var(--ink-soft)]">
														Replies / Post
													</div>
												</div>
											</div>
										</div>
									</div>

									{/* Engagement Balance Progress Bar */}
									<div className="flex flex-col gap-2.5 p-4 bg-[var(--bg-hover)]">
										<div className="flex items-center justify-between text-[13px]">
											<span className="font-bold text-[var(--ink)]">
												Engagement Balance
											</span>
											<span
												className={cx(
													"font-extrabold text-[12px] px-2 py-0.5 rounded-full",
													stats.replyRatio < 20
														? "bg-orange-500/10 text-orange-500 border border-orange-500/25 animate-pulse"
														: "bg-green-500/10 text-green-500 border border-green-500/25",
												)}
											>
												{stats.replyRatio}% replies{" "}
												{stats.replyRatio < 20 && "⚠️ Isolation Risk"}
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
											<span>
												Broadcasts: {stats.broadcastsCount} (
												{Math.round(100 - stats.replyRatio)}%)
											</span>
											<span>
												Replies: {stats.repliesCount} (
												{Math.round(stats.replyRatio)}%)
											</span>
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
													const timeDiff =
														Date.now() - new Date(item.createdAt).getTime();
													const under30m = timeDiff < 30 * 60 * 1000;
													const under2h = timeDiff < 2 * 60 * 60 * 1000;

													const timeLabel =
														timeDiff < 60 * 1000
															? "Just now"
															: timeDiff < 60 * 60 * 1000
																? `${Math.floor(timeDiff / 60000)}m ago`
																: timeDiff < 24 * 60 * 60 * 1000
																	? `${Math.floor(timeDiff / 3600000)}h ago`
																	: new Date(item.createdAt).toLocaleDateString(
																			"en-US",
																			{ month: "short", day: "numeric" },
																		);

													return (
														<div
															key={item.id}
															className="group flex items-start gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 transition-all hover:border-[var(--accent-soft)] hover:bg-[var(--bg-hover)]"
														>
															{item.authorAvatarUrl ? (
																<img
																	src={item.authorAvatarUrl}
																	alt=""
																	className="size-9 rounded-full object-cover shrink-0 ring-1 ring-[var(--line)]"
																/>
															) : (
																<div className="size-9 rounded-full bg-[var(--accent-soft)] text-[var(--accent)] font-bold flex items-center justify-center shrink-0">
																	{item.authorName.slice(0, 1).toUpperCase()}
																</div>
															)}
															<div className="min-w-0 flex-1">
																<div className="flex flex-wrap items-center gap-1.5 text-[12px]">
																	<span className="font-bold text-[var(--ink)]">
																		{item.authorName}
																	</span>
																	<span className="text-[var(--ink-soft)]">
																		@{item.authorHandle}
																	</span>
																	<span className="rounded-full bg-[var(--panel)] px-1.5 py-0.5 text-[10px] font-semibold text-[var(--ink-soft)]">
																		{(item.authorFollowers / 1000).toFixed(1)}k
																		followers
																	</span>
																	<span className="text-[var(--ink-soft)] ml-auto text-[11px]">
																		{timeLabel}
																	</span>
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
																		Engage on X{" "}
																		<ExternalLink className="size-3" />
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
							</div>
						) : (
							<div className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-6 text-[14px] text-[var(--ink-soft)]">
								No stats available yet. Sync your profile to calculate
								engagement.
							</div>
						)}
					</div>
				)}
				{analysis.loading || analysis.markdown || analysis.error ? (
					<>
						<ProfileAnalysisStatusLine analysis={analysis} />
						<ProfileAnalysisOutput
							analysis={analysis}
							emptyLabel={`Analyzing @${cleanHandle}.`}
						/>
					</>
				) : null}
			</div>
		</section>
	);
}

function ProfilePostPreview({
	context,
	handle,
	sessionKey,
}: {
	context: ProfileAnalysisContext | null;
	handle: string;
	sessionKey: string;
}) {
	const [sortBy, setSortBy] = useState<
		"newest" | "oldest" | "likes" | "replies"
	>(() => readProfileSession(sessionKey).sortBy ?? "newest");

	useEffect(() => {
		writeProfileSession(sessionKey, { sortBy });
	}, [sessionKey, sortBy]);

	const sortedTweets = useMemo(() => {
		if (!context) return [];
		const list = [...context.tweets];
		if (sortBy === "newest") {
			return list.sort(
				(a, b) =>
					new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
			);
		}
		if (sortBy === "oldest") {
			return list.sort(
				(a, b) =>
					new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
			);
		}
		if (sortBy === "likes") {
			return list.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
		}
		if (sortBy === "replies") {
			return list.sort((a, b) => (b.replyCount ?? 0) - (a.replyCount ?? 0));
		}
		return list;
	}, [context, sortBy]);

	const timelineItems = useMemo(() => {
		if (!context) return [];
		return sortedTweets.map((tweet) =>
			profileTweetToTimelineItem(context, tweet),
		);
	}, [context, sortedTweets]);

	if (!context) {
		return (
			<div className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-6 text-[14px] text-[var(--ink-soft)]">
				Preparing @{handle}.
			</div>
		);
	}

	return (
		<div className={profileTimelineShellClass}>
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
				<div>
					<h2 className="m-0 text-[16px] font-bold text-[var(--ink)]">
						Fetched posts
					</h2>
					<p className="m-0 text-[13px] text-[var(--ink-soft)]">
						{formatProfileAnalysisCounts(context)}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					<select
						aria-label="Sort posts"
						className={cx(
							selectFieldClass,
							"h-9 w-[130px] rounded-full border border-[var(--line-strong)] bg-[var(--bg)] px-3 text-[13px] font-medium text-[var(--ink)]",
						)}
						onChange={(e) => setSortBy(e.target.value as any)}
						value={sortBy}
					>
						<option value="newest">Newest First</option>
						<option value="oldest">Oldest First</option>
						<option value="likes">Most Liked</option>
						<option value="replies">Most Replied</option>
					</select>
					<a
						className={secondaryButtonClass}
						href={`https://x.com/${encodeURIComponent(context.profile.handle)}`}
						rel="noreferrer"
						target="_blank"
					>
						<ExternalLink className="size-4" strokeWidth={1.8} />
						Open profile
					</a>
				</div>
			</div>
			<ConversationSurfaceScope>
				<div className={feedClass}>
					{timelineItems.length > 0 ? (
						timelineItems.map((item) => (
							<TimelineCard
								key={item.id}
								item={item}
								onReply={() => {}}
								showReplyControls={false}
							/>
						))
					) : (
						<div className="px-4 py-8 text-center text-[14px] text-[var(--ink-soft)]">
							No fetched posts for @{handle} yet.
						</div>
					)}
				</div>
			</ConversationSurfaceScope>
		</div>
	);
}

function profileTweetToTimelineItem(
	context: ProfileAnalysisContext,
	tweet: ProfileAnalysisContext["tweets"][number],
): TimelineItem {
	return {
		id: tweet.id,
		accountId: context.accountId,
		accountHandle: context.accountHandle,
		kind: "search",
		text: tweet.text,
		createdAt: tweet.createdAt,
		replyToId: tweet.replyToId ?? null,
		isReplied: false,
		replyCount: tweet.replyCount ?? 0,
		likeCount: tweet.likeCount ?? 0,
		retweetCount: tweet.retweetCount ?? 0,
		quoteCount: tweet.quoteCount ?? 0,
		viewsCount: 0,
		mediaCount: tweet.mediaCount ?? tweet.media?.length ?? 0,
		bookmarked: tweet.bookmarkedCount > 0,
		liked: false,
		author: profileForHandle(context, tweet.author),
		entities: tweet.entities ?? {},
		media: tweet.media ?? [],
		replyToTweet: null,
		quotedTweet: findQuotedConversationTweet(context, tweet.id),
	};
}

function profileForHandle(
	context: ProfileAnalysisContext,
	handle: string,
): ProfileRecord {
	const normalized = handle.replace(/^@/, "").toLowerCase();
	const hydrated =
		normalized === context.profile.handle.toLowerCase()
			? context.profile
			: context.profiles?.find(
					(candidate) => candidate.handle.toLowerCase() === normalized,
				);
	if (hydrated) return hydrated;
	return {
		id: `profile_handle_${normalized || "unknown"}`,
		handle: handle.replace(/^@/, "") || context.profile.handle,
		displayName: handle.replace(/^@/, "") || context.profile.displayName,
		bio: "",
		followersCount: 0,
		avatarHue: stableHue(handle || context.profile.handle),
		createdAt: "",
	};
}

function findQuotedConversationTweet(
	context: ProfileAnalysisContext,
	tweetId: string,
): EmbeddedTweet | null {
	const quoted = context.conversations.find(
		(tweet) => tweet.conversationRootId === tweetId && tweet.id !== tweetId,
	);
	return quoted ? conversationTweetToEmbeddedTweet(context, quoted) : null;
}

function conversationTweetToEmbeddedTweet(
	context: ProfileAnalysisContext,
	tweet: ProfileAnalysisContext["conversations"][number],
): EmbeddedTweet {
	return {
		id: tweet.id,
		text: tweet.text,
		createdAt: tweet.createdAt,
		replyToId: tweet.replyToId ?? null,
		replyCount: tweet.replyCount,
		likeCount: tweet.likeCount,
		retweetCount: tweet.retweetCount,
		quoteCount: tweet.quoteCount,
		mediaCount: tweet.mediaCount,
		author: profileForConversationTweet(context, tweet),
		entities: tweet.entities ?? {},
		media: tweet.media ?? [],
	};
}

function profileForConversationTweet(
	context: ProfileAnalysisContext,
	tweet: ProfileAnalysisContext["conversations"][number],
): ProfileRecord {
	const normalized = tweet.author.replace(/^@/, "").toLowerCase();
	const hydrated = context.profiles?.find(
		(candidate) => candidate.handle.toLowerCase() === normalized,
	);
	if (hydrated) return hydrated;
	return {
		id: tweet.profileId,
		handle: tweet.author,
		displayName: tweet.name || tweet.author,
		bio: tweet.bio,
		followersCount: tweet.followersCount,
		avatarHue: stableHue(tweet.author),
		avatarUrl: tweet.avatarUrl,
		createdAt: tweet.createdAt,
	};
}

type ProfileSessionState = {
	tab?: "timeline" | "insights";
	sortBy?: "newest" | "oldest" | "likes" | "replies";
	scrollY?: number;
};

function readProfileSession(key: string): ProfileSessionState {
	if (typeof window === "undefined") return {};
	try {
		const parsed = JSON.parse(window.sessionStorage.getItem(key) ?? "{}");
		if (!parsed || typeof parsed !== "object") return {};
		const record = parsed as Record<string, unknown>;
		const sortBy = String(record.sortBy);
		return {
			...(record.tab === "timeline" || record.tab === "insights"
				? { tab: record.tab }
				: {}),
			...(["newest", "oldest", "likes", "replies"].includes(sortBy)
				? {
						sortBy: sortBy as "newest" | "oldest" | "likes" | "replies",
					}
				: {}),
			...(typeof record.scrollY === "number"
				? { scrollY: Math.max(0, record.scrollY) }
				: {}),
		};
	} catch {
		return {};
	}
}

function writeProfileSession(key: string, patch: ProfileSessionState) {
	if (typeof window === "undefined") return;
	const current = readProfileSession(key);
	window.sessionStorage.setItem(key, JSON.stringify({ ...current, ...patch }));
}
