import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
	Download,
	Image,
	MessageSquareQuote,
	Rows3,
	Search,
	X,
	UserRound,
} from "lucide-react";
import { AvatarChip } from "./AvatarChip";
import { SyncNowButton } from "#/components/SyncNowButton";
import { TimelineCard } from "#/components/TimelineCard";
import {
	TimelineFeedHeader,
	TimelineFeedShell,
	TimelineHeaderSubtitle,
	TimelineSearchAndSortField,
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

type AuthorFilterOption = {
	handle: string;
	displayName: string;
	avatarUrl: string | undefined;
	avatarHue: number;
	profileId: string;
	postCount?: number;
};

type SavedAuthorsResponse = {
	ok?: boolean;
	authors?: Array<{
		handle?: string;
		displayName?: string;
		avatarUrl?: string;
		avatarHue?: number;
		profileId?: string;
		postCount?: number;
	}>;
};

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

function AuthorFilterPicker({
	loading,
	onChange,
	options,
	value,
}: {
	loading: boolean;
	onChange: (value: string) => void;
	options: AuthorFilterOption[];
	value: string;
}) {
	const [open, setOpen] = useState(false);
	const [query, setQuery] = useState("");
	const containerRef = useRef<HTMLDivElement | null>(null);
	const normalizedQuery = query.trim().replace(/^@/, "").toLowerCase();
	const selectedHandle = value.trim().replace(/^@/, "");
	const matchedOptions = useMemo(() => {
		if (!normalizedQuery) return options;
		return options.filter(
			(option) =>
				option.handle.toLowerCase().includes(normalizedQuery) ||
				option.displayName.toLowerCase().includes(normalizedQuery),
		);
	}, [normalizedQuery, options]);
	const filteredOptions = useMemo(() => {
		return matchedOptions.slice(0, 280);
	}, [matchedOptions]);

	function applyAuthor(handle: string) {
		onChange(`@${handle}`);
		setOpen(false);
		setQuery("");
	}

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(event.target as Node)
			) {
				setOpen(false);
			}
		};
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("pointerdown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [open]);

	return (
		<div className="relative inline-flex max-w-full items-center gap-2" ref={containerRef}>
			<input
				aria-label="Filter saved posts by user"
				className="sr-only"
				onChange={(event) => onChange(event.target.value)}
				tabIndex={-1}
				value={value}
			/>
			<button
				className={cx(
					"inline-flex h-9 min-w-[150px] max-w-[220px] items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 text-[13px] font-semibold text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]",
					value && "border-[var(--line-strong)]",
				)}
				onClick={() => setOpen(true)}
				type="button"
			>
				<UserRound className="size-4 shrink-0 text-[var(--ink-soft)]" strokeWidth={2.1} />
				<span className="min-w-0 truncate">
					{selectedHandle ? `@${selectedHandle}` : "Filter user"}
				</span>
			</button>
			{value ? (
				<button
					aria-label="Clear user filter"
					className="grid size-9 place-items-center rounded-full border border-[var(--line)] text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
					onClick={() => onChange("")}
					type="button"
				>
					<X className="size-4" strokeWidth={2.2} />
				</button>
			) : null}
			{open ? (
				<div
					className="absolute left-0 top-[calc(100%+8px)] z-50 flex max-h-[360px] w-[min(360px,calc(100vw-32px))] flex-col overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-[0_18px_50px_var(--shadow-strong)]"
					role="menu"
				>
					<div className="border-b border-[var(--line)] p-2.5">
						<label className="flex h-10 items-center gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3">
							<Search
								className="size-4 shrink-0 text-[var(--ink-soft)]"
								strokeWidth={2}
							/>
							<input
								autoFocus
								className="min-w-0 flex-1 border-0 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)]"
								onChange={(event) => setQuery(event.target.value)}
								placeholder="Search users"
								value={query}
							/>
						</label>
					</div>
					<div className="custom-scrollbar min-h-0 overflow-y-auto overscroll-contain py-1">
						{filteredOptions.map((option) => (
							<button
								className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-[var(--bg-hover)] focus-visible:bg-[var(--bg-hover)]"
								key={option.handle}
								onClick={() => applyAuthor(option.handle)}
								role="menuitem"
								type="button"
							>
								<AvatarChip
									avatarUrl={option.avatarUrl}
									hue={option.avatarHue}
									name={option.displayName}
									profileId={option.profileId}
								/>
								<span className="min-w-0 flex-1">
									<span className="block truncate text-[14px] font-bold text-[var(--ink)]">
										{option.displayName}
									</span>
									<span className="block truncate text-[13px] text-[var(--ink-soft)]">
										@{option.handle}
									</span>
								</span>
								{typeof option.postCount === "number" ? (
									<span className="shrink-0 rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[12px] font-bold text-[var(--ink-soft)]">
										{option.postCount.toLocaleString()}
									</span>
								) : null}
							</button>
						))}
						{filteredOptions.length === 0 ? (
							<div className="px-4 py-8 text-center text-[13px] text-[var(--ink-soft)]">
								{loading
									? "Loading saved authors..."
									: "No saved authors match that search."}
							</div>
						) : null}
					</div>
					<div className="border-t border-[var(--line)] px-3 py-2 text-[12px] text-[var(--ink-soft)]">
						{loading && options.length === 0
							? "Loading saved authors..."
							: `${matchedOptions.length.toLocaleString()} matches${
									matchedOptions.length !== options.length
										? ` from ${options.length.toLocaleString()} authors`
										: ""
								}`}
					</div>
				</div>
			) : null}
		</div>
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
	const [remoteAuthorOptions, setRemoteAuthorOptions] = useState<
		AuthorFilterOption[]
	>([]);
	const [authorOptionsLoading, setAuthorOptionsLoading] = useState(false);
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
	const visibleAuthorOptions = useMemo(() => {
		const seen = new Set<string>();
		return items
			.map((item) => ({
				handle: item.author.handle,
				displayName: item.author.displayName,
				avatarUrl: item.author.avatarUrl,
				avatarHue: item.author.avatarHue,
				profileId: item.author.id,
			}))
			.filter((item) => {
				const key = item.handle.toLowerCase();
				if (seen.has(key)) return false;
				seen.add(key);
				return true;
			})
			.slice(0, 80);
	}, [items]);
	const authorOptions =
		remoteAuthorOptions.length > 0 ? remoteAuthorOptions : visibleAuthorOptions;

	useEffect(() => {
		if (loading || error) {
			setAuthorOptionsLoading(false);
			return;
		}
		const controller = new AbortController();
		let active = true;
		setAuthorOptionsLoading(true);
		const params = new URLSearchParams({
			collection: filter === "liked" ? "likes" : "bookmarks",
			limit: "10000",
		});
		if (selectedAccountId) params.set("account", selectedAccountId);
		fetch(`/api/saved-authors?${params.toString()}`, {
			signal: controller.signal,
		})
			.then((response) =>
				response.ok ? (response.json() as Promise<SavedAuthorsResponse>) : null,
			)
			.then((payload) => {
				if (!active) return;
				if (!payload?.ok || !payload.authors) return;
				setRemoteAuthorOptions(
					payload.authors
						.filter(
							(author): author is Required<SavedAuthorsResponse>["authors"][number] =>
								Boolean(author.handle && author.displayName && author.profileId),
						)
						.map((author) => ({
							handle: String(author.handle),
							displayName: String(author.displayName),
							avatarUrl:
								typeof author.avatarUrl === "string"
									? author.avatarUrl
									: undefined,
							avatarHue: Number(author.avatarHue ?? 0),
							profileId: String(author.profileId),
							postCount:
								typeof author.postCount === "number"
									? author.postCount
									: undefined,
						})),
				);
			})
			.catch((error: unknown) => {
				if (!active) return;
				if ((error as { name?: string }).name !== "AbortError") {
					setRemoteAuthorOptions([]);
				}
			})
			.finally(() => {
				if (active) setAuthorOptionsLoading(false);
			});
		return () => {
			active = false;
			controller.abort();
		};
	}, [error, filter, loading, selectedAccountId]);

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
							<TimelineSearchAndSortField
								value={search}
								onChange={setSearch}
								placeholder={searchPlaceholder}
								sortValue={sort}
								onSortChange={setSort}
								sortOptions={SORT_OPTIONS}
							/>
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
								<AuthorFilterPicker
									loading={authorOptionsLoading}
									onChange={setAuthor}
									options={authorOptions}
									value={author}
								/>
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
