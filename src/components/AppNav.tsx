import { Link, useRouterState } from "@tanstack/react-router";
import {
	Bell,
	Bookmark,
	CalendarDays,
	ChevronsLeft,
	ChevronsRight,
	Database,
	Gauge,
	Globe2,
	Heart,
	Home,
	Inbox,
	Link as LinkIcon,
	Loader2,
	Mail,
	MessagesSquare,
	Settings,
	ShieldOff,
	UserRound,
	UserSearch,
	Users,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { AvatarChip } from "./AvatarChip";
import {
	cx,
	navLinkActiveClass,
	navLinkClass,
	navLinkCompactClass,
	navLinkIconClass,
	navLinkLabelClass,
	navLinkLabelCompactClass,
	sidebarBrandClass,
	sidebarBrandCopyClass,
	sidebarBrandCopyCompactClass,
	sidebarBrandMarkClass,
	sidebarBrandTaglineClass,
	sidebarBrandTitleClass,
	sidebarShellCompactClass,
	sidebarFooterClass,
	sidebarNavClass,
	sidebarShellClass,
} from "#/lib/ui";
import {
	NAV_HIDDEN_KEY,
	NAV_ORDER_KEY,
	NAV_PREFERENCES_EVENT,
	orderNavItems,
	readPinnedProfiles,
	readBoolean,
	readStringArray,
	SIDEBAR_COLLAPSED_KEY,
	SIDEBAR_MY_POSTS_AVATAR_KEY,
	writeBoolean,
	writePinnedProfiles,
} from "#/lib/nav-preferences";
import { fetchQueryEnvelope } from "#/lib/api-client";
import { queryKeys } from "#/lib/query-client";
import { AccountSwitcher } from "./AccountSwitcher";
import { useSelectedAccountId } from "./account-selection";
import { BirdclawMark } from "./BrandMark";
import { ThemeSlider } from "./ThemeSlider";

const links = [
	{ to: "/inbox", label: "Inbox", icon: Inbox },
	{ to: "/today", label: "Today", icon: CalendarDays },
	{ to: "/discuss", label: "Discuss", icon: MessagesSquare },
	{ to: "/profile-analyze", label: "Analyse", icon: UserSearch },
	{ to: "/network-map", label: "Map", icon: Globe2 },
	{ to: "/data-sources", label: "Sources", icon: Database },
	{ to: "/", label: "Home", icon: Home },
	{ to: "/circle", label: "Circle", icon: Users },
	{ to: "/my-posts", label: "My Posts", icon: UserRound },
	{ to: "/mentions", label: "Mentions", icon: Bell },
	{ to: "/likes", label: "Likes", icon: Heart },
	{ to: "/bookmarks", label: "Bookmarks", icon: Bookmark },
	{ to: "/links", label: "Links", icon: LinkIcon },
	{ to: "/rate-limits", label: "Rate Limits", icon: Gauge },
	{ to: "/dms", label: "DMs", icon: Mail },
	{ to: "/blocks", label: "Blocks", icon: ShieldOff },
	{ to: "/settings", label: "Settings", icon: Settings },
] as const;

interface SyncProgress {
	handle: string;
	displayName?: string;
	avatarUrl?: string;
	avatarHue?: number;
	profileId?: string;
	status: "idle" | "checking" | "synced" | "error";
	message: string;
}

let startupSyncStarted = false;

export function AppNav({ compact = false }: { compact?: boolean }) {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const statusQuery = useQuery({
		queryKey: queryKeys.status,
		queryFn: ({ signal }) => fetchQueryEnvelope({ signal }),
	});
	const accounts = statusQuery.data?.accounts ?? [];
	const selectedAccountId = useSelectedAccountId(accounts);
	const selectedAccount = useMemo(
		() => accounts.find((account) => account.id === selectedAccountId),
		[accounts, selectedAccountId],
	);
	const [collapsedPreference, setCollapsedPreference] = useState(false);
	const [useMyPostsAvatar, setUseMyPostsAvatar] = useState(false);
	const [hidden, setHidden] = useState<string[]>([]);
	const [order, setOrder] = useState<string[]>([]);
	const [pinnedProfiles, setPinnedProfiles] = useState<
		ReturnType<typeof readPinnedProfiles>
	>([]);
	const [pinnedMenu, setPinnedMenu] = useState<{
		handle: string;
		x: number;
		y: number;
	} | null>(null);

	const [syncState, setSyncState] = useState<{
		isSyncing: boolean;
		activeHandle: string | null;
		logs: SyncProgress[];
		isVisible: boolean;
	} | null>(null);

	const syncSingleProfile = async (handle: string) => {
		setPinnedMenu(null);
		const profile = pinnedProfiles.find(
			(p) => p.handle.toLowerCase() === handle.toLowerCase(),
		);
		const initialProgress: SyncProgress[] = [
			{
				handle: handle,
				displayName: profile?.displayName || handle,
				avatarUrl: profile?.avatarUrl,
				avatarHue: profile?.avatarHue,
				profileId: profile?.profileId,
				status: "checking" as const,
				message: "Checking posts...",
			},
		];
		setSyncState({
			isSyncing: true,
			activeHandle: handle,
			logs: initialProgress,
			isVisible: true,
		});

		try {
			const response = await fetch(
				`/api/profile-context?handle=${encodeURIComponent(handle)}&refresh=true&maxTweets=2000&maxPages=1&maxConversations=0&maxConversationPages=1`,
			);
			if (response.ok) {
				const payload = (await response.json()) as {
					context?: {
						tweets?: Array<{ createdAt: string }>;
						health?: { liveTweets?: number };
					};
				};
				const tweets = payload.context?.tweets ?? [];
				const profiles = readPinnedProfiles();
				const pRecord = profiles.find(
					(p) => p.handle.toLowerCase() === handle.toLowerCase(),
				);
				const lastSync = pRecord?.lastSyncedAt
					? new Date(pRecord.lastSyncedAt).getTime()
					: 0;

				const newestTweetDate = tweets.length > 0
					? new Date(tweets[0].createdAt).toISOString()
					: new Date().toISOString();

				const newTweets = tweets.filter(
					(t) => new Date(t.createdAt).getTime() > lastSync,
				);
				const fetchedLiveCount = payload.context?.health?.liveTweets ?? tweets.length;
				const newCount = lastSync > 0 ? newTweets.length : fetchedLiveCount;

				writePinnedProfiles(
					profiles.map((p) =>
						p.handle.toLowerCase() === handle.toLowerCase()
							? {
									...p,
									lastSyncedAt: newestTweetDate,
									newCount: (p.newCount ?? 0) + newCount,
								}
							: p,
					),
				);

				setSyncState((prev) =>
					prev
						? {
								...prev,
								isSyncing: false,
								activeHandle: null,
								logs: prev.logs.map((item) =>
									item.handle.toLowerCase() === handle.toLowerCase()
										? {
												...item,
												status: "synced" as const,
												message: newCount > 0 ? `+${newCount} new` : "Up to date",
											}
										: item,
								),
							}
						: null,
				);
			} else {
				throw new Error(`HTTP ${String(response.status)}`);
			}
		} catch (err) {
			setSyncState((prev) =>
				prev
					? {
							...prev,
							isSyncing: false,
							activeHandle: null,
							logs: prev.logs.map((item) =>
								item.handle.toLowerCase() === handle.toLowerCase()
									? {
											...item,
											status: "error" as const,
											message: err instanceof Error ? err.message : String(err),
										}
									: item,
							),
						}
					: null,
			);
		}

		setTimeout(() => {
			setSyncState((prev) => (prev ? { ...prev, isVisible: false } : null));
		}, 4000);
	};

	useEffect(() => {
		function load() {
			setCollapsedPreference(readBoolean(SIDEBAR_COLLAPSED_KEY));
			setUseMyPostsAvatar(readBoolean(SIDEBAR_MY_POSTS_AVATAR_KEY));
			setHidden(readStringArray(NAV_HIDDEN_KEY));
			setOrder(readStringArray(NAV_ORDER_KEY));
			setPinnedProfiles(readPinnedProfiles());
		}
		load();
		window.addEventListener(NAV_PREFERENCES_EVENT, load);
		window.addEventListener("storage", load);
		return () => {
			window.removeEventListener(NAV_PREFERENCES_EVENT, load);
			window.removeEventListener("storage", load);
		};
	}, []);

	useEffect(() => {
		// Reset unread count when visiting a pinned profile page
		const match = pathname.match(/^\/profiles\/([^/]+)/);
		if (match) {
			const handle = decodeURIComponent(match[1]);
			const found = pinnedProfiles.find(
				(p) => p.handle.toLowerCase() === handle.toLowerCase(),
			);
			if (found && (found.newCount ?? 0) > 0) {
				writePinnedProfiles(
					pinnedProfiles.map((p) =>
						p.handle.toLowerCase() === handle.toLowerCase()
							? { ...p, newCount: 0 }
							: p,
					),
				);
			}
		}
	}, [pathname, pinnedProfiles]);

	useEffect(() => {
		if (startupSyncStarted) return;
		startupSyncStarted = true;

		const runStartupSync = async () => {
			const initialProfiles = readPinnedProfiles();
			if (initialProfiles.length === 0) {
				setSyncState({
					isSyncing: false,
					activeHandle: null,
					logs: [],
					isVisible: true,
				});
				setTimeout(() => {
					setSyncState((prev) =>
						prev ? { ...prev, isVisible: false } : null,
					);
				}, 3000);
				return;
			}

			const initialProgress: SyncProgress[] = initialProfiles.map((p) => ({
				handle: p.handle,
				displayName: p.displayName || p.handle,
				avatarUrl: p.avatarUrl,
				avatarHue: p.avatarHue,
				profileId: p.profileId,
				status: "idle" as const,
				message: "Waiting...",
			}));

			setSyncState({
				isSyncing: true,
				activeHandle: null,
				logs: initialProgress,
				isVisible: true,
			});

			const handlesToSync = initialProfiles.map((p) => p.handle);

			for (const handle of handlesToSync) {
				// Re-read latest list to check if user unpinned it while we were waiting
				const currentProfiles = readPinnedProfiles();
				const profile = currentProfiles.find(
					(p) => p.handle.toLowerCase() === handle.toLowerCase(),
				);
				if (!profile) continue; // Skipped since it was unpinned

				setSyncState((prev) =>
					prev
						? {
								...prev,
								activeHandle: handle,
								logs: prev.logs.map((item) =>
									item.handle.toLowerCase() === handle.toLowerCase()
										? { ...item, status: "checking" as const, message: "Checking posts..." }
										: item,
								),
							}
						: null,
				);

				try {
					const response = await fetch(
						`/api/profile-context?handle=${encodeURIComponent(handle)}&refresh=true&maxTweets=2000&maxPages=1&maxConversations=0&maxConversationPages=1`,
					);
					if (response.ok) {
						const payload = (await response.json()) as {
							context?: {
								tweets?: Array<{ createdAt: string }>;
								health?: { liveTweets?: number };
							};
						};
						const tweets = payload.context?.tweets ?? [];

						// Re-read latest list right before writing to avoid overwriting newer pins
						const latestProfiles = readPinnedProfiles();
						const latestProfile = latestProfiles.find(
							(p) => p.handle.toLowerCase() === handle.toLowerCase(),
						);
						if (latestProfile) {
							const lastSync = latestProfile.lastSyncedAt
								? new Date(latestProfile.lastSyncedAt).getTime()
								: 0;

							const newestTweetDate = tweets.length > 0
								? new Date(tweets[0].createdAt).toISOString()
								: new Date().toISOString();

							const newTweets = tweets.filter(
								(t) => new Date(t.createdAt).getTime() > lastSync,
							);
							const fetchedLiveCount = payload.context?.health?.liveTweets ?? tweets.length;
							const newCount = lastSync > 0 ? newTweets.length : fetchedLiveCount;

							writePinnedProfiles(
								latestProfiles.map((p) =>
									p.handle.toLowerCase() === handle.toLowerCase()
										? {
												...p,
												lastSyncedAt: newestTweetDate,
												newCount: (p.newCount ?? 0) + newCount,
											}
										: p,
								),
							);

							setSyncState((prev) =>
								prev
									? {
											...prev,
											logs: prev.logs.map((item) =>
												item.handle.toLowerCase() === handle.toLowerCase()
													? {
															...item,
															status: "synced" as const,
															message: newCount > 0 ? `+${newCount} new` : "Up to date",
														}
													: item,
											),
										}
									: null,
							);
						}
					} else {
						throw new Error(`HTTP ${String(response.status)}`);
					}
				} catch (err) {
					setSyncState((prev) =>
						prev
							? {
									...prev,
									logs: prev.logs.map((item) =>
										item.handle.toLowerCase() === handle.toLowerCase()
											? {
													...item,
													status: "error" as const,
													message: err instanceof Error ? err.message : String(err),
												}
											: item,
									),
								}
							: null,
					);
				}

				await new Promise((resolve) => setTimeout(resolve, 800));
			}

			setSyncState((prev) =>
				prev
					? {
							...prev,
							isSyncing: false,
							activeHandle: null,
						}
					: null,
			);

			setTimeout(() => {
				setSyncState((prev) => (prev ? { ...prev, isVisible: false } : null));
			}, 4000);
		};

		const timer = setTimeout(() => {
			void runStartupSync();
		}, 1500);
		return () => clearTimeout(timer);
	}, []);

	const isCompact = compact || collapsedPreference;
	const visibleLinks = useMemo(
		() =>
			orderNavItems(links, order).filter(
				(link) => link.to === "/settings" || !hidden.includes(link.to),
			),
		[hidden, order],
	);

	return (
		<aside className={isCompact ? sidebarShellCompactClass : sidebarShellClass}>
			<div className="flex min-h-0 flex-1 flex-col">
				<Link to="/" className={sidebarBrandClass}>
					<span className={sidebarBrandMarkClass}>
						<BirdclawMark className="size-10" />
					</span>
					<span
						className={
							isCompact ? sidebarBrandCopyCompactClass : sidebarBrandCopyClass
						}
					>
						<span className={sidebarBrandTitleClass}>
							birdclaw
							<span className="ml-1 text-[9px] font-mono font-normal tracking-wide text-[var(--ink-soft)] opacity-70">
								helium v0.8.5
							</span>
						</span>
						<span className={sidebarBrandTaglineClass}>
							Fast search for your archive.
						</span>
					</span>
				</Link>
				<nav className={sidebarNavClass} aria-label="Primary">
					{visibleLinks.map((link) => {
						const active = pathname === link.to;
						const Icon = link.icon;
						const showMyPostsAvatar =
							link.to === "/my-posts" && useMyPostsAvatar && selectedAccount;
						return (
							<Link
								key={link.to}
								to={link.to}
								aria-label={link.label}
								className={cx(
									isCompact ? navLinkCompactClass : navLinkClass,
									active && navLinkActiveClass,
								)}
							>
								{showMyPostsAvatar ? (
									<span className="grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-full">
										<AvatarChip
											avatarUrl={selectedAccount.avatarUrl}
											hue={selectedAccount.avatarHue ?? 210}
											name={
												selectedAccount.name ||
												selectedAccount.handle ||
												selectedAccount.id
											}
											profileId={selectedAccount.profileId}
											size="xsmall"
										/>
									</span>
								) : (
									<Icon
										className={navLinkIconClass}
										size={22}
										strokeWidth={active ? 2.4 : 1.8}
										aria-hidden="true"
									/>
								)}
								<span
									className={
										isCompact ? navLinkLabelCompactClass : navLinkLabelClass
									}
								>
									{link.label}
								</span>
							</Link>
						);
					})}
					{pinnedProfiles.length > 0 ? (
						<div className="flex flex-col min-h-0 flex-1 border-t border-[var(--line)] my-1 pt-1">
							<div
								className={cx(
									"max-h-[280px] w-full",
									isCompact
										? "flex flex-col items-center overflow-y-auto overflow-x-hidden scrollbar-none"
										: "custom-scrollbar overflow-y-auto",
								)}
							>
								{pinnedProfiles.map((profile) => {
									const to = `/profiles/${encodeURIComponent(profile.handle)}`;
									const active = pathname === to;
									const label = profile.displayName || `@${profile.handle}`;
									return (
										<Link
											aria-label={label}
											className={cx(
												isCompact ? navLinkCompactClass : navLinkClass,
												active && navLinkActiveClass,
											)}
											key={profile.handle.toLowerCase()}
											onContextMenu={(event) => {
												event.preventDefault();
												setPinnedMenu({
													handle: profile.handle,
													x: event.clientX,
													y: event.clientY,
												});
											}}
											to={to}
										>
											<span className="relative grid size-[22px] shrink-0 place-items-center overflow-visible rounded-full">
												<AvatarChip
													avatarUrl={profile.avatarUrl}
													hue={profile.avatarHue ?? 210}
													name={label}
													profileId={profile.profileId}
													size="xsmall"
												/>
												{profile.newCount && profile.newCount > 0 ? (
													<span
														className={cx(
															"absolute -top-1.5 -right-1.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-[#1d9bf0] px-0.5 text-[8px] font-bold text-white shadow-[0_0_0_1.5px_var(--bg)]",
															!isCompact && "min-[1100px]:hidden",
														)}
													>
														+{profile.newCount}
													</span>
												) : null}
											</span>
											<span
												className={cx(
													isCompact ? navLinkLabelCompactClass : navLinkLabelClass,
													"flex-1 min-w-0 flex items-center justify-between gap-2",
												)}
											>
												<span className="truncate">{label}</span>
												{profile.newCount && profile.newCount > 0 ? (
													<span className="shrink-0 rounded-full bg-[#1d9bf0] px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
														+{profile.newCount}
													</span>
												) : null}
											</span>
										</Link>
									);
								})}
							</div>
						</div>
					) : null}
				</nav>
			</div>
			<div className={sidebarFooterClass}>
				<button
					aria-label={
						collapsedPreference ? "Expand sidebar" : "Collapse sidebar"
					}
					className={cx(isCompact ? navLinkCompactClass : navLinkClass)}
					onClick={() => {
						writeBoolean(SIDEBAR_COLLAPSED_KEY, !collapsedPreference);
						setCollapsedPreference(!collapsedPreference);
					}}
					type="button"
				>
					{collapsedPreference ? (
						<ChevronsRight
							aria-hidden="true"
							className={navLinkIconClass}
							size={22}
							strokeWidth={1.8}
						/>
					) : (
						<ChevronsLeft
							aria-hidden="true"
							className={navLinkIconClass}
							size={22}
							strokeWidth={1.8}
						/>
					)}
					<span
						className={isCompact ? navLinkLabelCompactClass : navLinkLabelClass}
					>
						{collapsedPreference ? "Expand" : "Collapse"}
					</span>
				</button>
				<AccountSwitcher action={<ThemeSlider compact />} />
			</div>
			{pinnedMenu ? (
				<PinnedProfileMenu
					handle={pinnedMenu.handle}
					onClose={() => setPinnedMenu(null)}
					onRemove={() => {
						writePinnedProfiles(
							pinnedProfiles.filter(
								(profile) =>
									profile.handle.toLowerCase() !==
									pinnedMenu.handle.toLowerCase(),
							),
						);
						setPinnedMenu(null);
					}}
					onRefresh={() => void syncSingleProfile(pinnedMenu.handle)}
					position={{ x: pinnedMenu.x, y: pinnedMenu.y }}
				/>
			) : null}
			{syncState?.isVisible && (
				<div className="fixed bottom-4 right-4 z-[9999] w-[320px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_18px_50px_var(--shadow-strong)] transition-all duration-300">
					<div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3 bg-[var(--bg-active)]/30">
						<div className="flex items-center gap-2 min-w-0">
							{syncState.isSyncing ? (
								<Loader2 className="size-4 animate-spin text-[var(--accent)]" />
							) : (
								<span className="size-2 rounded-full bg-green-500" />
							)}
							<span className="text-[13px] font-bold text-[var(--ink)] truncate">
								{syncState.isSyncing
									? "Syncing profiles..."
									: "Sync complete"}
							</span>
						</div>
						{syncState.isSyncing && syncState.activeHandle && (
							<span className="text-[11px] text-[var(--ink-soft)] font-medium animate-pulse">
								@{syncState.activeHandle}
							</span>
						)}
					</div>
					<div className="custom-scrollbar max-h-[220px] overflow-y-auto divide-y divide-[var(--line)] bg-[var(--bg)]">
						{syncState.logs.map((option) => (
							<div
								className="flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-[var(--bg-hover)]"
								key={option.handle}
							>
								<AvatarChip
									avatarUrl={option.avatarUrl}
									hue={option.avatarHue ?? 0}
									name={option.displayName ?? option.handle}
									profileId={option.profileId}
								/>
								<div className="min-w-0 flex-1">
									<div className="block truncate text-[13px] font-bold leading-tight text-[var(--ink)]">
										{option.displayName}
									</div>
									<div className="block truncate text-[11px] leading-tight text-[var(--ink-soft)]">
										@{option.handle}
									</div>
								</div>
								<div className="shrink-0 text-right">
									{option.status === "checking" && (
										<span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--accent)]">
											<Loader2 className="size-3 animate-spin" />
											checking
										</span>
									)}
									{option.status === "synced" && (
										<span className={cx(
											"inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-bold",
											option.message.toLowerCase().includes("up to date")
												? "bg-[var(--bg-active)] text-[var(--ink-soft)]"
												: "bg-[var(--accent-soft)] text-[var(--accent)]"
										)}>
											{option.message}
										</span>
									)}
									{option.status === "error" && (
										<span className="inline-flex items-center rounded-full bg-red-500/10 px-2 py-0.5 text-[11px] font-bold text-red-500">
											failed
										</span>
									)}
									{option.status === "idle" && (
										<span className="text-[11px] font-medium text-[var(--ink-soft)]">
											queued
										</span>
									)}
								</div>
							</div>
						))}
						{syncState.logs.length === 0 && (
							<div className="px-4 py-6 text-center text-[12px] text-[var(--ink-soft)]">
								No active syncing items.
							</div>
						)}
					</div>
				</div>
			)}
		</aside>
	);
}

function PinnedProfileMenu({
	handle,
	onClose,
	onRefresh,
	onRemove,
	position,
}: {
	handle: string;
	onClose: () => void;
	onRefresh: () => void | Promise<void>;
	onRemove: () => void;
	position: { x: number; y: number };
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

	const left = Math.min(Math.max(12, position.x), window.innerWidth - 224);
	const top = Math.min(Math.max(12, position.y), window.innerHeight - 180);

	return (
		<div
			className="fixed z-[9999] w-[212px] overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] py-2 text-[14px] text-[var(--ink)] shadow-[0_18px_60px_var(--shadow-strong)]"
			onClick={(event) => event.stopPropagation()}
			style={{ left, top }}
		>
			<Link
				className="block px-4 py-2.5 font-semibold hover:bg-[var(--bg-hover)]"
				to="/profiles/$handle"
				params={{ handle }}
				onClick={onClose}
			>
				Open @{handle}
			</Link>
			<button
				className="block w-full px-4 py-2.5 text-left font-semibold hover:bg-[var(--bg-hover)]"
				onClick={() => void onRefresh()}
				type="button"
			>
				Fetch newest
			</button>
			<button
				className="block w-full px-4 py-2.5 text-left font-semibold text-[var(--alert)] hover:bg-[var(--bg-hover)]"
				onClick={onRemove}
				type="button"
			>
				Unpin profile
			</button>
		</div>
	);
}
