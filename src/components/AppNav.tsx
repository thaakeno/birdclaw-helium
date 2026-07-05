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
	Mail,
	MessagesSquare,
	Settings,
	ShieldOff,
	UserRound,
	UserSearch,
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
						<span className={sidebarBrandTitleClass}>birdclaw</span>
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
											size="small"
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
						<div
							className={cx(
								"my-1 border-t border-[var(--line)] pt-1",
								isCompact && "flex flex-col items-center",
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
										<span className="grid size-[22px] shrink-0 place-items-center overflow-hidden rounded-full">
											<AvatarChip
												avatarUrl={profile.avatarUrl}
												hue={profile.avatarHue ?? 210}
												name={label}
												profileId={profile.profileId}
												size="small"
											/>
										</span>
										<span
											className={
												isCompact ? navLinkLabelCompactClass : navLinkLabelClass
											}
										>
											{label}
											{profile.newCount && profile.newCount > 0 ? (
												<span className="ml-auto rounded-full bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-bold text-white">
													{profile.newCount}
												</span>
											) : null}
										</span>
									</Link>
								);
							})}
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
					onRefresh={async () => {
						const handle = pinnedMenu.handle;
						await fetch(
							`/api/profile-context?handle=${encodeURIComponent(handle)}&refresh=true&maxTweets=2000&maxPages=1&maxConversations=0&maxConversationPages=1`,
						).catch(() => undefined);
						writePinnedProfiles(
							pinnedProfiles.map((profile) =>
								profile.handle.toLowerCase() === handle.toLowerCase()
									? {
											...profile,
											lastSyncedAt: new Date().toISOString(),
											newCount: 0,
										}
									: profile,
							),
						);
						setPinnedMenu(null);
					}}
					position={{ x: pinnedMenu.x, y: pinnedMenu.y }}
				/>
			) : null}
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
			<a
				className="block px-4 py-2.5 font-semibold hover:bg-[var(--bg-hover)]"
				href={`/profiles/${encodeURIComponent(handle)}`}
				onClick={onClose}
			>
				Open @{handle}
			</a>
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
