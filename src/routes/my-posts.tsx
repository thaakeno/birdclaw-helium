import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { AvatarChip } from "#/components/AvatarChip";
import { SyncNowButton } from "#/components/SyncNowButton";
import { TimelineCard } from "#/components/TimelineCard";
import {
	TimelineFeedHeader,
	TimelineFeedShell,
	TimelineHeaderSubtitle,
	TimelineSearchField,
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
}: {
	account: AccountRecord | undefined;
	count: number;
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
						Locally archived originals and replies fetched through Birdclaw.
					</p>
					<div className="mt-3 flex flex-wrap gap-4 text-[14px]">
						<span>
							<strong className="font-bold text-[var(--ink)]">
								{count.toLocaleString()}
							</strong>{" "}
							<span className="text-[var(--ink-soft)]">posts and replies</span>
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
							the authenticated Bird helper and stores originals plus replies,
							not reposts.
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
	const [syncMaxPages, setSyncMaxPages] = useState(10);
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
	});
	const selectedAccount = useMemo(
		() =>
			meta?.accounts.find((account) => account.id === selectedAccountId) ??
			meta?.accounts[0],
		[meta?.accounts, selectedAccountId],
	);

	const sortedItems = useMemo(() => {
		const list = [...items];
		if (sortBy === "newest") {
			return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
		}
		if (sortBy === "oldest") {
			return list.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
		}
		if (sortBy === "likes") {
			return list.sort((a, b) => (b.likeCount ?? 0) - (a.likeCount ?? 0));
		}
		if (sortBy === "replies") {
			return list.sort((a, b) => {
				const bReplies = b.replyCount ?? b.localReplyCount ?? 0;
				const aReplies = a.replyCount ?? a.localReplyCount ?? 0;
				return bReplies - aReplies;
			});
		}
		return list;
	}, [items, sortBy]);

	const authoredCount = meta?.stats.authored ?? items.length;
	const subtitles = meta
		? `${authoredCount.toLocaleString()} local posts and replies - ${meta.transport.statusText}`
		: "Loading authored posts...";
	const syncButton = (
		<SyncNowButton
			accounts={meta?.accounts}
			kind="authored"
			label="Fetch posts"
			onSynced={refreshLocalView}
			showAccountPicker
			syncOptions={{ limit: 100, maxPages: syncMaxPages }}
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
								aria-label="Sort posts"
								className={cx(selectFieldClass, "h-9 w-[130px]!")}
								onChange={(e) => setSortBy(e.target.value as any)}
								value={sortBy}
							>
								<option value="newest">Newest First</option>
								<option value="oldest">Oldest First</option>
								<option value="likes">Most Liked</option>
								<option value="replies">Most Replied</option>
							</select>
							<select
								aria-label="Authored fetch depth"
								className={cx(selectFieldClass, "h-9 w-[120px]!")}
								onChange={(event) =>
									setSyncMaxPages(Number(event.target.value))
								}
								title="More pages fetch more of your profile history"
								value={syncMaxPages}
							>
								<option value={5}>5 pages</option>
								<option value={10}>10 pages</option>
							</select>
							{syncButton}
						</div>
					}
					controls={
						<>
							<div className="px-4 pb-3">
								<TimelineSearchField
									onChange={setSearch}
									placeholder="Search your posts"
									value={search}
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
			<MyPostsProfilePanel account={selectedAccount} count={authoredCount} />
			{sortedItems.map((item) => (
				<TimelineCard key={item.id} item={item} onReply={replyToTweet} />
			))}
			<MyPostsFooter count={authoredCount} syncControl={syncButton} />
		</TimelineFeedShell>
	);
}
