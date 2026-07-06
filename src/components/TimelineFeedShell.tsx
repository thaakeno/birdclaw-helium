import { Search, X } from "lucide-react";
import type { ReactNode } from "react";
import {
	FeedEmpty,
	FeedError,
	FeedLoading,
	TweetSkeletonRows,
} from "./FeedState";
import { ConversationSurfaceScope } from "#/lib/conversation-surface";
import {
	feedClass,
	pageHeaderClass,
	pageHeaderRowClass,
	pageSubtitleClass,
	pageTitleClass,
	searchFieldIconClass,
	searchFieldInputClass,
	searchFieldShellClass,
	cx,
	selectFieldClass,
} from "#/lib/ui";

export function TimelineFeedHeader({
	title,
	subtitles,
	action,
	controls,
}: {
	title: string;
	subtitles: ReactNode;
	action?: ReactNode;
	controls?: ReactNode;
}) {
	return (
		<header className={pageHeaderClass}>
			<div className={`${pageHeaderRowClass} flex-wrap`}>
				<div className="flex min-w-0 flex-col">
					<h1 className={pageTitleClass}>{title}</h1>
					{subtitles}
				</div>
				{action}
			</div>
			{controls}
		</header>
	);
}

export function TimelineHeaderSubtitle({ children }: { children: ReactNode }) {
	return <p className={pageSubtitleClass}>{children}</p>;
}

export function TimelineSearchField({
	value,
	onChange,
	placeholder,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
}) {
	return (
		<div className="min-w-0 flex-1">
			<label className={searchFieldShellClass}>
				<Search className={searchFieldIconClass} strokeWidth={2} />
				<input
					className={searchFieldInputClass}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					value={value}
				/>
				{value ? (
					<button
						aria-label="Clear search"
						className="grid size-7 shrink-0 place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--ink)]"
						onClick={() => onChange("")}
						type="button"
					>
						<X className="size-4" strokeWidth={2.2} />
					</button>
				) : null}
			</label>
		</div>
	);
}

export function TimelineSearchAndSortField({
	value,
	onChange,
	placeholder,
	sortValue,
	onSortChange,
	sortOptions,
}: {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	sortValue: string;
	onSortChange: (value: any) => void;
	sortOptions: Array<{ value: string; label: string }>;
}) {
	return (
		<div className="flex w-full max-w-[460px] items-center rounded-full border border-[var(--line-strong)] bg-[var(--bg)] focus-within:border-[var(--accent)] focus-within:shadow-[0_0_0_1px_var(--accent)] overflow-hidden transition-all duration-150">
			<div className="relative flex-1 min-w-0 flex items-center">
				<Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--ink-soft)]" />
				<input
					type="search"
					placeholder={placeholder}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					className="h-10 w-full bg-transparent pl-10 pr-8 text-[14px] text-[var(--ink)] outline-none border-0 focus:outline-none focus:ring-0 placeholder:text-[var(--ink-soft)]"
				/>
				{value ? (
					<button
						aria-label="Clear search"
						className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--ink-soft)] hover:text-[var(--ink)]"
						onClick={() => onChange("")}
						type="button"
					>
						<X className="size-4" />
					</button>
				) : null}
			</div>

			{/* Vertical Divider line */}
			<div className="h-5 w-px bg-[var(--line-strong)] shrink-0" />

			<select
				value={sortValue}
				onChange={(event) => onSortChange(event.target.value)}
				style={{ colorScheme: "dark" }}
				className={cx(
					selectFieldClass,
					"h-10 px-4 pr-8 border-0 bg-transparent cursor-pointer outline-none focus:outline-none w-[150px]! shrink-0 text-[13px] font-semibold text-[var(--ink)]"
				)}
			>
				{sortOptions.map((opt) => (
					<option key={opt.value} value={opt.value} className="bg-[var(--bg-elevated)] text-[var(--ink)] font-semibold">
						{opt.label}
					</option>
				))}
			</select>
		</div>
	);
}

export function TimelineFeedShell({
	header,
	notice,
	loading,
	loadingLabel,
	loadingDetail,
	error,
	errorTitle,
	onRetry,
	empty,
	emptyLabel,
	emptyDetail,
	children,
	hasMore,
	loadingMore,
	onLoadMore,
}: {
	header: ReactNode;
	notice?: ReactNode;
	loading: boolean;
	loadingLabel: string;
	loadingDetail: string;
	error: string | null;
	errorTitle: string;
	onRetry: () => void;
	empty: boolean;
	emptyLabel: string;
	emptyDetail: string;
	children: ReactNode;
	hasMore: boolean;
	loadingMore: boolean;
	onLoadMore: () => void;
}) {
	return (
		<>
			{header}
			{notice}
			<ConversationSurfaceScope>
				<section className={feedClass}>
					{loading ? (
						<FeedLoading detail={loadingDetail} label={loadingLabel}>
							<TweetSkeletonRows />
						</FeedLoading>
					) : error ? (
						<FeedError
							action={
								<button
									className="rounded-full bg-[var(--accent)] px-4 py-1.5 text-[14px] font-bold text-white"
									onClick={onRetry}
									type="button"
								>
									Retry
								</button>
							}
							message={error}
							title={errorTitle}
						/>
					) : empty ? (
						<FeedEmpty detail={emptyDetail} label={emptyLabel} />
					) : null}
					{children}
					{!loading && !error && hasMore ? (
						<div className="flex justify-center py-4">
							<button
								className="rounded-full bg-[var(--accent)] px-5 py-1.5 text-[14px] font-bold text-white disabled:opacity-60"
								disabled={loadingMore}
								onClick={onLoadMore}
								type="button"
							>
								{loadingMore ? "Loading…" : "Load more"}
							</button>
						</div>
					) : null}
				</section>
			</ConversationSurfaceScope>
		</>
	);
}
