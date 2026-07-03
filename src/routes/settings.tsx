import { createFileRoute } from "@tanstack/react-router";
import { ArrowDown, ArrowUp, Eye, EyeOff, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
	NAV_HIDDEN_KEY,
	NAV_ORDER_KEY,
	orderNavItems,
	readStringArray,
	writeStringArray,
} from "#/lib/nav-preferences";
import {
	cx,
	pageHeaderClass,
	pageHeaderRowClass,
	pageSubtitleClass,
	pageTitleClass,
	secondaryButtonClass,
} from "#/lib/ui";

const navItems = [
	{ to: "/inbox", label: "Inbox" },
	{ to: "/today", label: "Today" },
	{ to: "/discuss", label: "Discuss" },
	{ to: "/profile-analyze", label: "Analyse" },
	{ to: "/network-map", label: "Map" },
	{ to: "/data-sources", label: "Sources" },
	{ to: "/", label: "Home" },
	{ to: "/mentions", label: "Mentions" },
	{ to: "/likes", label: "Likes" },
	{ to: "/bookmarks", label: "Bookmarks" },
	{ to: "/links", label: "Links" },
	{ to: "/rate-limits", label: "Rate Limits" },
	{ to: "/dms", label: "DMs" },
	{ to: "/blocks", label: "Blocks" },
] as const;

export const Route = createFileRoute("/settings")({
	component: SettingsRoute,
});

function SettingsRoute() {
	const [hidden, setHidden] = useState<string[]>([]);
	const [order, setOrder] = useState<string[]>([]);

	useEffect(() => {
		setHidden(readStringArray(NAV_HIDDEN_KEY));
		setOrder(readStringArray(NAV_ORDER_KEY));
	}, []);

	const orderedItems = useMemo(() => orderNavItems(navItems, order), [order]);

	function persistHidden(next: string[]) {
		setHidden(next);
		writeStringArray(NAV_HIDDEN_KEY, next);
	}

	function persistOrder(next: string[]) {
		setOrder(next);
		writeStringArray(NAV_ORDER_KEY, next);
	}

	function move(path: string, direction: -1 | 1) {
		const current: string[] = orderedItems.map((item) => item.to);
		const index = current.indexOf(path);
		const nextIndex = index + direction;
		if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return;
		const next = [...current];
		const [item] = next.splice(index, 1);
		if (!item) return;
		next.splice(nextIndex, 0, item);
		persistOrder(next);
	}

	return (
		<>
			<header className={pageHeaderClass}>
				<div className={pageHeaderRowClass}>
					<div>
						<h1 className={pageTitleClass}>Settings</h1>
						<p className={pageSubtitleClass}>
							Clean up the local workspace without changing archived data.
						</p>
					</div>
					<button
						className={secondaryButtonClass}
						onClick={() => {
							persistHidden([]);
							persistOrder([]);
						}}
						type="button"
					>
						<RotateCcw className="size-4" strokeWidth={1.8} />
						Reset
					</button>
				</div>
			</header>
			<section className="border-b border-[var(--line)] px-4 py-4">
				<h2 className="text-[16px] font-bold text-[var(--ink)]">Sidebar</h2>
				<p className="mt-1 text-[13px] text-[var(--ink-soft)]">
					Hide noisy lanes and move the stuff you use most toward the top.
				</p>
				<div className="mt-4 overflow-hidden rounded-2xl border border-[var(--line)]">
					{orderedItems.map((item, index) => {
						const isHidden = hidden.includes(item.to);
						return (
							<div
								className="flex min-w-0 items-center gap-2 border-t border-[var(--line)] px-3 py-2.5 first:border-t-0"
								key={item.to}
							>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[14px] font-bold text-[var(--ink)]">
										{item.label}
									</div>
									<div className="truncate text-[12px] text-[var(--ink-soft)]">
										{item.to}
									</div>
								</div>
								<button
									aria-label={`Move ${item.label} up`}
									className={cx(secondaryButtonClass, "size-8 px-0")}
									disabled={index === 0}
									onClick={() => move(item.to, -1)}
									type="button"
								>
									<ArrowUp className="size-4" strokeWidth={1.8} />
								</button>
								<button
									aria-label={`Move ${item.label} down`}
									className={cx(secondaryButtonClass, "size-8 px-0")}
									disabled={index === orderedItems.length - 1}
									onClick={() => move(item.to, 1)}
									type="button"
								>
									<ArrowDown className="size-4" strokeWidth={1.8} />
								</button>
								<button
									aria-label={isHidden ? `Show ${item.label}` : `Hide ${item.label}`}
									className={cx(secondaryButtonClass, "min-w-[88px]")}
									onClick={() =>
										persistHidden(
											isHidden
												? hidden.filter((path) => path !== item.to)
												: [...hidden, item.to],
										)
									}
									type="button"
								>
									{isHidden ? (
										<Eye className="size-4" strokeWidth={1.8} />
									) : (
										<EyeOff className="size-4" strokeWidth={1.8} />
									)}
									{isHidden ? "Show" : "Hide"}
								</button>
							</div>
						);
					})}
				</div>
			</section>
		</>
	);
}
