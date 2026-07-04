import { type ReactNode, useMemo, useState } from "react";
import {
	Download,
	Image,
	MessageSquareQuote,
	Rows3,
	UserRound,
} from "lucide-react";
import { SyncNowButton } from "#/components/SyncNowButton";
import { TimelineCard } from "#/components/TimelineCard";
import {
	TimelineFeedHeader,
	TimelineFeedShell,
	TimelineHeaderSubtitle,
	TimelineSearchField,
} from "#/components/TimelineFeedShell";
import { useTimelineRouteData } from "#/components/useTimelineRouteData";
import { setStoredAccountId } from "./account-selection";
import type { TimelineQuery } from "#/lib/types";
import { cx, secondaryButtonClass, selectFieldClass } from "#/lib/ui";



interface SavedTimelineViewProps {
	filter: "liked" | "bookmarked";
	eyebrow: string;
	title: string;
	loadingLabel: string;
	searchPlaceholder: string;
}

const TITLES: Record<SavedTimelineViewProps["filter"], string> = {
	liked: "Likes",
	bookmarked: "Bookmarks",
};

const TOTAL_LABELS: Record<SavedTimelineViewProps["filter"], string> = {
	liked: "unique likes",
	bookmarked: "unique bookmarks",
};

const SORT_OPTIONS: Array<{
	value: NonNullable<TimelineQuery["sort"]>;
	label: string;
}> = [
	{ value: "saved-desc", label: "Newest saved" },
	{ value: "saved-asc", label: "Oldest saved" },
	{ value: "created-desc", label: "Newest post" },
	{ value: "created-asc", label: "Oldest post" },
	{ value: "likes-desc", label: "Most liked" },
	{ value: "replies-desc", label: "Most replied" },
];

function SavedFilterButton({
	active,
	children,
	onClick,
	title,
}: {
	active: boolean;
	children: ReactNode;
	onClick: () => void;
	title: string;
}) {
	return (
		<button
			aria-pressed={active}
			className={cx(
				"inline-flex h-9 items-center gap-1.5 rounded-full border px-3 text-[13px] font-semibold transition-colors",
				active
					? "border-[color:color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]"
					: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]",
			)}
			onClick={onClick}
			title={title}
			type="button"
		>
			{children}
		</button>
	);
}

export function SavedTimelineView({
	filter,
	title,
	loadingLabel,
	searchPlaceholder,
}: SavedTimelineViewProps) {
	const [search, setSearch] = useState("");
	const [sort, setSort] =
		useState<NonNullable<TimelineQuery["sort"]>>("saved-desc");
	const [mediaOnly, setMediaOnly] = useState(false);
	const [quotedOnly, setQuotedOnly] = useState(false);
	const [originalsOnly, setOriginalsOnly] = useState(false);
	const [author, setAuthor] = useState("");
	const [syncMaxPages, setSyncMaxPages] = useState(5);
	const {
		meta,
		items,
		loading,
		error,
		retry,
		refreshLocalView,
		replyToTweet,
		selectedAccountId,
		hasMore,
		loadingMore,
		loadMore,
	} = useTimelineRouteData({
		resource: "home",
		search,
		errorFallback: `${TITLES[filter]} unavailable`,
		likedOnly: filter === "liked",
		bookmarkedOnly: filter === "bookmarked",
		sort,
		mediaOnly,
		quotedOnly,
		originalsOnly,
		author,
	});



	const subtitle = useMemo(() => {
		if (!meta) {
			return items.length > 0
				? `${String(items.length)} visible`
				: loadingLabel;
		}
		const total = filter === "liked" ? meta.stats.likes : meta.stats.bookmarks;
		const totalLabel = TOTAL_LABELS[filter];
		return `${items.length.toLocaleString()} visible · ${total.toLocaleString()} ${totalLabel} · ${meta.transport.statusText}`;
	}, [filter, items.length, loadingLabel, meta]);
	const syncKind = filter === "liked" ? "likes" : "bookmarks";
	const accounts = meta?.accounts ?? [];
	const authorOptions = useMemo(() => {
		const seen = new Set<string>();
		return items
			.map((item) => ({
				handle: item.author.handle,
				label: `${item.author.displayName} (@${item.author.handle})`,
			}))
			.filter((item) => {
				const key = item.handle.toLowerCase();
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.slice(0, 80);
	}, [items]);
	const authorListId = `${filter}-author-options`;

	return (
		<TimelineFeedShell
			header={
				<TimelineFeedHeader
					title={TITLES[filter]}
					subtitles={
						<>
							<TimelineHeaderSubtitle>{title}</TimelineHeaderSubtitle>
							<TimelineHeaderSubtitle>{subtitle}</TimelineHeaderSubtitle>
						</>
					}
					action={
						<div className="flex flex-wrap items-center justify-end gap-2">
							{filter === "bookmarked" ? (
								<div className="inline-flex overflow-hidden rounded-full border border-[var(--line)]">
									<a
										className="inline-flex h-9 items-center gap-1.5 border-r border-[var(--line)] px-3 text-[13px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]"
										href="/api/bookmarks-export"
										title="Download the complete bookmark export with quotes, media, entities, metrics, and profile metadata"
									>
										<Download className="size-4" strokeWidth={2.1} />
										Full JSON
									</a>
									<a
										className="inline-flex h-9 items-center px-3 text-[13px] font-bold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]"
										href="/api/bookmarks-export?mode=light"
										title="Download a small AI-friendly export with text, username, X URL, and date only"
									>
										Light
									</a>
								</div>
							) : null}
							<select
								aria-label="Sync page depth"
								className={cx(selectFieldClass, "h-9 w-[120px]!")}
								onChange={(event) =>
									setSyncMaxPages(Number(event.target.value))
								}
								title="More pages fetch more history but hits X harder"
								value={syncMaxPages}
							>
								<option value={5}>5 pages</option>
								<option value={25}>25 pages</option>
								<option value={100}>100 pages</option>
								<option value={250}>250 pages</option>
							</select>
							<SyncNowButton
								accounts={meta?.accounts}
								kind={syncKind}
								label={filter === "liked" ? "Sync likes" : "Sync bookmarks"}
								syncOptions={{
									allPages: true,
									limit: 100,
									maxPages: syncMaxPages,
								}}
								onSynced={refreshLocalView}
							/>
						</div>
					}
					controls={
						<div className="flex flex-col gap-2 px-4 pb-3">
							<div className="flex items-center gap-2">
								<TimelineSearchField
									onChange={setSearch}
									placeholder={searchPlaceholder}
									value={search}
								/>
								<div className="relative shrink-0">
									<select
										aria-label="Sort saved posts"
										className={cx(
											selectFieldClass,
											"h-10 w-[154px] rounded-full py-0",
										)}
										onChange={(event) =>
											setSort(
												event.target.value as NonNullable<
													TimelineQuery["sort"]
												>,
											)
										}
										value={sort}
									>
										{SORT_OPTIONS.map((option) => (
											<option key={option.value} value={option.value}>
												{option.label}
											</option>
										))}
									</select>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								{accounts.length > 1 ? (
									<select
										aria-label="Saved account"
										className={cx(
											selectFieldClass,
											"h-9 w-[160px] rounded-full py-0",
										)}
										onChange={(event) => setStoredAccountId(event.target.value)}
										value={selectedAccountId ?? accounts[0]?.id ?? ""}
									>
										{accounts.map((account) => (
											<option key={account.id} value={account.id}>
												{account.handle || account.name || account.id}
											</option>
										))}
									</select>
								) : null}
								<label className="inline-flex h-9 min-w-[190px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 text-[13px] text-[var(--ink)] focus-within:border-[color:color-mix(in_srgb,var(--accent)_55%,var(--line))] focus-within:shadow-[0_0_0_1px_var(--accent-soft)]">
									<UserRound
										className="size-4 shrink-0 text-[var(--ink-soft)]"
										strokeWidth={2.1}
									/>
									<input
										aria-label="Filter saved posts by user"
										className="min-w-0 flex-1 border-0 bg-transparent outline-none placeholder:text-[var(--ink-soft)]"
										list={authorListId}
										onChange={(event) => setAuthor(event.target.value)}
										placeholder="@user"
										value={author}
									/>
								</label>
								<datalist id={authorListId}>
									{authorOptions.map((option) => (
										<option key={option.handle} value={`@${option.handle}`}>
											{option.label}
										</option>
									))}
								</datalist>
								<SavedFilterButton
									active={mediaOnly}
									onClick={() => setMediaOnly((value) => !value)}
									title="Only posts with media"
								>
									<Image className="size-4" strokeWidth={2.1} />
									Media
								</SavedFilterButton>
								<SavedFilterButton
									active={quotedOnly}
									onClick={() => setQuotedOnly((value) => !value)}
									title="Only quote posts"
								>
									<MessageSquareQuote className="size-4" strokeWidth={2.1} />
									Quotes
								</SavedFilterButton>
								<SavedFilterButton
									active={originalsOnly}
									onClick={() => setOriginalsOnly((value) => !value)}
									title="Hide replies"
								>
									<Rows3 className="size-4" strokeWidth={2.1} />
									Originals
								</SavedFilterButton>
								{mediaOnly ||
								quotedOnly ||
								originalsOnly ||
								search ||
								author ? (
									<button
										className={cx(secondaryButtonClass, "h-9 px-3 text-[13px]")}
										onClick={() => {
											setSearch("");
											setAuthor("");
											setMediaOnly(false);
											setQuotedOnly(false);
											setOriginalsOnly(false);
										}}
										type="button"
									>
										Reset
									</button>
								) : null}
							</div>
						</div>
					}
				/>
			}
			loading={loading}
			loadingLabel={loadingLabel}
			loadingDetail={`Reading local ${TITLES[filter].toLowerCase()}`}
			error={error}
			errorTitle={`Could not load ${TITLES[filter].toLowerCase()}`}
			onRetry={retry}
			empty={items.length === 0}
			emptyLabel="Nothing saved here yet"
			emptyDetail="Sync this collection or broaden the search."
			hasMore={hasMore}
			loadingMore={loadingMore}
			onLoadMore={loadMore}
		>

			{items.map((item) => (
				<TimelineCard
					key={item.id}
					item={item}
					onReply={replyToTweet}
					showReplyControls={false}
				/>
			))}
		</TimelineFeedShell>
	);
}
