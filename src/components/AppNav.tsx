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
import { useEffect, useMemo, useState } from "react";
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
	readBoolean,
	readStringArray,
	SIDEBAR_COLLAPSED_KEY,
	writeBoolean,
} from "#/lib/nav-preferences";
import { AccountSwitcher } from "./AccountSwitcher";
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
	const [collapsedPreference, setCollapsedPreference] = useState(false);
	const [hidden, setHidden] = useState<string[]>([]);
	const [order, setOrder] = useState<string[]>([]);

	useEffect(() => {
		function load() {
			setCollapsedPreference(readBoolean(SIDEBAR_COLLAPSED_KEY));
			setHidden(readStringArray(NAV_HIDDEN_KEY));
			setOrder(readStringArray(NAV_ORDER_KEY));
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
			<div className="flex flex-col">
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
								<Icon
									className={navLinkIconClass}
									size={22}
									strokeWidth={active ? 2.4 : 1.8}
									aria-hidden="true"
								/>
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
		</aside>
	);
}
