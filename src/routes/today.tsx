import { createFileRoute } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import {
	CheckCircle2,
	ExternalLink,
	FileDown,
	Loader2,
	RefreshCw,
	Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarChip } from "#/components/AvatarChip";
import { MarkdownViewer } from "#/components/MarkdownViewer";
import { SmartTimestamp } from "#/components/SmartTimestamp";
import { TweetMediaGrid } from "#/components/TweetMediaGrid";
import { TweetRichText } from "#/components/TweetRichText";
import { useNdjsonRun } from "#/components/useNdjsonRun";
import {
	isTerminalStreamEvent,
	periodDigestStreamEventSchema,
} from "#/lib/client-stream-contracts";
import { formatCompactNumber } from "#/lib/present";
import type {
	PeriodDigestContext,
	PeriodDigestRunResult,
	PeriodDigestStreamEvent,
} from "#/lib/period-digest";
import type { ProfileRecord } from "#/lib/types";
import {
	hydrateProfileHandles,
	normalizeProfileHydrationHandle as normalizeHandle,
} from "#/lib/profile-hydration-client";
import {
	type PeriodRouteSearch,
	type RouteSearchChange,
	type TodayRouteSearch,
	validateTodaySearch,
} from "#/lib/route-search";
import {
	cx,
	errorCopyClass,
	feedRowBodyClass,
	feedRowClass,
	feedRowDotClass,
	feedRowHandleClass,
	feedRowHeaderClass,
	feedRowNameClass,
	feedRowTextClass,
	feedRowTimestampClass,
	pageHeaderActionsClass,
	pageHeaderClass,
	pageHeaderRowClass,
	pageSubtitleClass,
	pageTitleClass,
	secondaryButtonClass,
	segmentAccentActiveClass,
	segmentClass,
	segmentedClass,
} from "#/lib/ui";

export const Route = createFileRoute("/today")({
	component: TodayRoute,
	validateSearch: validateTodaySearch,
});

type PeriodOption = PeriodRouteSearch;
const PROFILE_HYDRATION_LIMIT = 12;
const PROFILE_HYDRATION_DELAY_MS = 300;
const DIGEST_UI_MAX_TWEETS = 650;
const DIGEST_UI_MAX_LINKS = 12;
const DIGEST_STATUS_MESSAGES = {
	524: "Digest startup timed out at Cloudflare (524). Retry to open a new stream.",
} as const;

const periods: Array<{ value: PeriodOption; label: string }> = [
	{ value: "today", label: "Today" },
	{ value: "24h", label: "24h" },
	{ value: "yesterday", label: "Yesterday" },
	{ value: "week", label: "Week" },
];

function periodLabel(period: PeriodOption) {
	return periods.find((item) => item.value === period)?.label ?? "Digest";
}

function exportCurrentDigestPdf(title: string) {
	const previousTitle = document.title;
	let cleanedUp = false;
	const cleanup = () => {
		if (cleanedUp) return;
		cleanedUp = true;
		document.title = previousTitle;
		window.removeEventListener("afterprint", cleanup);
	};

	document.title = title;
	window.addEventListener("afterprint", cleanup, { once: true });
	window.setTimeout(cleanup, 3000);
	window.print();
}

function digestUrl(
	period: PeriodOption,
	includeDms: boolean,
	refresh: boolean,
) {
	const url = new URL("/api/period-digest", window.location.origin);
	url.searchParams.set("period", period);
	url.searchParams.set("includeDms", String(includeDms));
	url.searchParams.set("maxTweets", String(DIGEST_UI_MAX_TWEETS));
	url.searchParams.set("maxLinks", String(DIGEST_UI_MAX_LINKS));
	// Cloudflare caps proxied requests; live timeline sync remains a separate job/UI action.
	url.searchParams.set("liveSync", "false");
	if (refresh) {
		url.searchParams.set("refresh", "true");
	}
	return url;
}

function digestStreamError(cause: unknown, phase: string) {
	const message = cause instanceof Error ? cause.message : String(cause);
	if (
		cause instanceof TypeError &&
		/network error|failed to fetch|load failed/i.test(message)
	) {
		return `Digest connection was interrupted while ${phase.toLowerCase()}. Retry to continue.`;
	}
	if (cause instanceof SyntaxError) {
		return `Digest stream returned invalid data while ${phase.toLowerCase()}. Retry to continue.`;
	}
	return message || "Digest failed";
}

function formatCounts(context: PeriodDigestContext | null) {
	if (!context) return "Local Twitter memory, summarized as it streams.";
	const counts = context.counts;
	return [
		`${String(counts.home)} home`,
		`${String(counts.mentions)} mentions`,
		`${String(counts.links)} links`,
		context.includeDms ? `${String(counts.dms)} DMs` : null,
	]
		.filter(Boolean)
		.join(" · ");
}

function collectProfilesForHydration(result: PeriodDigestRunResult) {
	const handles = new Set<string>();
	const tweetIds = new Set<string>();
	for (const id of result.digest.sourceTweetIds) tweetIds.add(id);
	for (const topic of result.digest.keyTopics) {
		for (const id of topic.tweetIds) tweetIds.add(id);
	}
	for (const link of result.digest.notableLinks) {
		for (const id of link.sourceTweetIds) tweetIds.add(id);
	}
	for (const item of result.digest.actionItems) {
		if (item.tweetId) tweetIds.add(item.tweetId);
	}

	const tweetsById = new Map(
		result.context.tweets.flatMap((tweet) => [
			[tweet.id, tweet],
			[`tweet_${tweet.id}`, tweet],
		]),
	);
	for (const id of tweetIds) {
		const tweet = tweetsById.get(id);
		if (!tweet) continue;
		const handle = normalizeHandle(tweet.author);
		if (handle) handles.add(handle);
	}

	for (const tweet of result.context.tweets) {
		const handle = normalizeHandle(tweet.author);
		if (handle) handles.add(handle);
	}
	return [...handles];
}

function applyHydratedProfilesToContext(
	context: PeriodDigestContext,
	profilesByHandle: Map<string, ProfileRecord>,
) {
	let changed = false;
	const tweets = context.tweets.map((tweet) => {
		const profile = profilesByHandle.get(normalizeHandle(tweet.author));
		if (!profile || profile === tweet.authorProfile) return tweet;
		changed = true;
		return {
			...tweet,
			author: profile.handle,
			name: profile.displayName,
			authorProfile: profile,
		};
	});
	return changed ? { ...context, tweets } : context;
}

function applyHydratedProfilesToResult(
	result: PeriodDigestRunResult,
	profiles: ProfileRecord[],
) {
	const profilesByHandle = new Map(
		profiles.map((profile) => [normalizeHandle(profile.handle), profile]),
	);
	if (profilesByHandle.size === 0) return result;
	const context = applyHydratedProfilesToContext(
		result.context,
		profilesByHandle,
	);
	return context === result.context ? result : { ...result, context };
}

type DigestTweet = PeriodDigestContext["tweets"][number];

function normalizeTweetId(value: string) {
	return value.trim().replace(/^tweet_/, "");
}

function citedTweetIds(result: PeriodDigestRunResult) {
	const ids = new Set<string>();
	for (const id of result.digest.sourceTweetIds) ids.add(normalizeTweetId(id));
	for (const topic of result.digest.keyTopics) {
		for (const id of topic.tweetIds) ids.add(normalizeTweetId(id));
	}
	for (const link of result.digest.notableLinks) {
		for (const id of link.sourceTweetIds) ids.add(normalizeTweetId(id));
	}
	for (const item of result.digest.actionItems) {
		if (item.tweetId) ids.add(normalizeTweetId(item.tweetId));
	}
	return ids;
}

function sourceTweetsForResult(result: PeriodDigestRunResult) {
	const ids = citedTweetIds(result);
	const seen = new Set<string>();
	const selected: DigestTweet[] = [];
	for (const tweet of result.context.tweets) {
		if (!ids.has(normalizeTweetId(tweet.id)) || seen.has(tweet.id)) continue;
		seen.add(tweet.id);
		selected.push(tweet);
	}
	if (selected.length > 0) return selected.slice(0, 12);
	return result.context.tweets.slice(0, 8);
}

function tweetsForIds(result: PeriodDigestRunResult, ids: string[]) {
	const wanted = new Set(ids.map(normalizeTweetId));
	return result.context.tweets
		.filter((tweet) => wanted.has(normalizeTweetId(tweet.id)))
		.slice(0, 3);
}

function safeHttpUrl(value: string) {
	try {
		const url = new URL(value);
		return url.protocol === "http:" || url.protocol === "https:"
			? url.toString()
			: null;
	} catch {
		return null;
	}
}

function DigestSourceCard({ tweet }: { tweet: DigestTweet }) {
	return (
		<article
			className={cx(feedRowClass, "px-0 py-3 first:pt-0 last:border-b-0")}
		>
			<AvatarChip
				avatarUrl={tweet.authorProfile.avatarUrl}
				hue={tweet.authorProfile.avatarHue}
				name={tweet.name || tweet.author}
				profileId={tweet.authorProfile.id}
			/>
			<div className={feedRowBodyClass}>
				<header className={feedRowHeaderClass}>
					<a
						className={feedRowNameClass}
						href={`/profiles/${encodeURIComponent(tweet.author)}`}
					>
						{tweet.name || tweet.author}
					</a>
					<span className={feedRowHandleClass}>@{tweet.author}</span>
					<span className={feedRowDotClass}>·</span>
					<SmartTimestamp
						className={feedRowTimestampClass}
						value={tweet.createdAt}
					/>
					<a
						aria-label="Open post on X"
						className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-[12px] font-semibold text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-active)] hover:text-[var(--ink)]"
						href={tweet.url}
						rel="noreferrer"
						target="_blank"
					>
						<ExternalLink className="size-3.5" strokeWidth={1.8} />
						Open
					</a>
				</header>
				<TweetRichText
					className={feedRowTextClass}
					entities={tweet.entities ?? {}}
					text={tweet.text}
				/>
				<TweetMediaGrid items={tweet.media ?? []} postUrl={tweet.url} />
				<div className="mt-1 flex flex-wrap gap-2 text-[12px] font-medium text-[var(--ink-soft)]">
					<span>{tweet.source}</span>
					<span>·</span>
					<span>{formatCompactNumber(tweet.likeCount)} likes</span>
					{tweet.bookmarked ? (
						<>
							<span>·</span>
							<span>bookmarked</span>
						</>
					) : null}
				</div>
			</div>
		</article>
	);
}

function DigestReport({
	markdown,
	result,
}: {
	markdown: string;
	result: PeriodDigestRunResult;
}) {
	const sourceTweets = sourceTweetsForResult(result);
	return (
		<div className="flex flex-col">
			<section className="border-b border-[var(--line)] px-4 py-4">
				<div className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-4">
					<div className="mb-2 text-[12px] font-bold uppercase text-[var(--ink-soft)]">
						Report
					</div>
					<h2 className="m-0 text-[20px] font-bold leading-tight text-[var(--ink)]">
						{result.digest.title}
					</h2>
					<p className="mt-2 text-[15px] leading-[1.5] text-[var(--ink)]">
						{result.digest.summary}
					</p>
				</div>
			</section>

			{result.digest.keyTopics.length > 0 ? (
				<section className="border-b border-[var(--line)] px-4 py-4">
					<h2 className="m-0 mb-3 text-[16px] font-bold text-[var(--ink)]">
						Key topics
					</h2>
					<div className="grid gap-3">
						{result.digest.keyTopics.map((topic) => {
							const tweets = tweetsForIds(result, topic.tweetIds);
							return (
								<div
									className="rounded-[8px] border border-[var(--line)] bg-[var(--bg)] p-3"
									key={topic.title}
								>
									<div className="flex flex-wrap items-start justify-between gap-2">
										<h3 className="m-0 text-[15px] font-bold text-[var(--ink)]">
											{topic.title}
										</h3>
										{topic.handles.length > 0 ? (
											<div className="flex flex-wrap gap-1">
												{topic.handles.slice(0, 4).map((handle) => (
													<span
														className="rounded-full bg-[var(--bg-active)] px-2 py-0.5 text-[12px] font-semibold text-[var(--ink-soft)]"
														key={handle}
													>
														{handle}
													</span>
												))}
											</div>
										) : null}
									</div>
									<p className="mb-0 mt-1.5 text-[14px] leading-[1.45] text-[var(--ink)]">
										{topic.summary}
									</p>
									{tweets.length > 0 ? (
										<div className="mt-3 divide-y divide-[var(--line)]">
											{tweets.map((tweet) => (
												<DigestSourceCard key={tweet.id} tweet={tweet} />
											))}
										</div>
									) : null}
								</div>
							);
						})}
					</div>
				</section>
			) : null}

			{result.digest.notableLinks.length > 0 ||
			result.digest.actionItems.length > 0 ? (
				<section className="grid gap-4 border-b border-[var(--line)] px-4 py-4 min-[720px]:grid-cols-2">
					{result.digest.notableLinks.length > 0 ? (
						<div>
							<h2 className="m-0 mb-3 text-[16px] font-bold text-[var(--ink)]">
								Links
							</h2>
							<div className="grid gap-2">
								{result.digest.notableLinks.slice(0, 6).map((link) => {
									const href = safeHttpUrl(link.url);
									const content = (
										<>
											<span className="block font-bold">{link.title}</span>
											<span className="mt-1 block text-[13px] leading-[1.35] text-[var(--ink-soft)]">
												{link.why}
											</span>
										</>
									);
									const className =
										"rounded-[8px] border border-[var(--line)] bg-[var(--bg)] p-3 text-[14px] text-[var(--ink)] transition-colors hover:bg-[var(--bg-hover)]";
									return href ? (
										<a
											className={className}
											href={href}
											key={`${link.title}:${link.url}`}
											rel="noreferrer"
											target="_blank"
										>
											{content}
										</a>
									) : (
										<div
											className={className}
											key={`${link.title}:${link.url}`}
										>
											{content}
										</div>
									);
								})}
							</div>
						</div>
					) : null}
					{result.digest.actionItems.length > 0 ? (
						<div>
							<h2 className="m-0 mb-3 text-[16px] font-bold text-[var(--ink)]">
								Actions
							</h2>
							<ul className="m-0 grid list-none gap-2 p-0">
								{result.digest.actionItems.map((item) => (
									<li
										className="rounded-[8px] border border-[var(--line)] bg-[var(--bg)] p-3 text-[14px] text-[var(--ink)]"
										key={`${item.kind}:${item.label}`}
									>
										<span className="mr-2 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[12px] font-bold text-[var(--accent)]">
											{item.kind.replace("_", " ")}
										</span>
										{item.label}
									</li>
								))}
							</ul>
						</div>
					) : null}
				</section>
			) : null}

			<section className="border-b border-[var(--line)] px-4 py-4">
				<h2 className="m-0 mb-3 text-[16px] font-bold text-[var(--ink)]">
					Source posts
				</h2>
				<div className="divide-y divide-[var(--line)]">
					{sourceTweets.map((tweet) => (
						<DigestSourceCard key={tweet.id} tweet={tweet} />
					))}
				</div>
			</section>

			<section className="px-0 py-1">
				<h2 className="px-4 pt-3 text-[16px] font-bold text-[var(--ink)]">
					Narrative
				</h2>
				<MarkdownViewer context={result.context} markdown={markdown} />
			</section>
		</div>
	);
}

function useDigestStream(period: PeriodOption, includeDms: boolean) {
	const queryClient = useQueryClient();
	const [markdown, setMarkdown] = useState("");
	const [context, setContext] = useState<PeriodDigestContext | null>(null);
	const [result, setResult] = useState<PeriodDigestRunResult | null>(null);
	const [status, setStatus] = useState("Starting digest");
	const latestStatusRef = useRef("Starting digest");

	const onStart = useCallback(() => {
		setMarkdown("");
		setContext(null);
		setResult(null);
		setStatus("Starting digest");
		latestStatusRef.current = "Starting digest";
	}, []);
	const request = useCallback(
		(signal: AbortSignal, refresh: boolean) =>
			fetch(digestUrl(period, includeDms, refresh), {
				cache: "no-store",
				signal,
			}),
		[includeDms, period],
	);
	const onEvent = useCallback((event: PeriodDigestStreamEvent) => {
		if (event.type === "status") {
			latestStatusRef.current = event.detail
				? `${event.label} · ${event.detail}`
				: event.label;
			setStatus(latestStatusRef.current);
		} else if (event.type === "start") setContext(event.context);
		else if (event.type === "delta") {
			latestStatusRef.current = "Streaming AI summary";
			setStatus(latestStatusRef.current);
			setMarkdown((current) => current + event.delta);
		} else if (event.type === "done") {
			setResult(event.result);
			setContext(event.result.context);
			setMarkdown(event.result.markdown);
			setStatus(event.result.cached ? "Loaded cached report" : "Ready");
		} else if (event.type === "error") {
			throw new Error(event.error);
		}
	}, []);
	const onError = useCallback(() => setStatus("Digest failed"), []);
	const prematureEofError = useCallback(
		() =>
			new Error(
				`Digest connection closed while ${latestStatusRef.current.toLowerCase()}. Retry to continue.`,
			),
		[],
	);
	const formatError = useCallback(
		(cause: unknown) => digestStreamError(cause, latestStatusRef.current),
		[],
	);
	const { error, loading, run } = useNdjsonRun({
		schema: periodDigestStreamEventSchema,
		request,
		onStart,
		onEvent,
		onError,
		isTerminal: isTerminalStreamEvent,
		errorLabel: "Digest request failed",
		emptyBodyMessage: "Digest request failed: empty response body",
		prematureEofError,
		formatError,
		statusMessages: DIGEST_STATUS_MESSAGES,
	});

	useEffect(() => {
		run(false);
	}, [run]);

	useEffect(() => {
		if (!result) return;
		const handles = collectProfilesForHydration(result);
		if (handles.length === 0) return;

		let active = true;
		let idleId: number | null = null;
		const runHydration = () => {
			hydrateProfileHandles(queryClient, handles, {
				limit: PROFILE_HYDRATION_LIMIT,
			})
				.then((response) => {
					if (!active) return;
					const { profiles } = response;
					if (profiles.length === 0) return;
					setResult((current) =>
						current
							? applyHydratedProfilesToResult(current, profiles)
							: current,
					);
					const profilesByHandle = new Map(
						profiles.map((profile) => [
							normalizeHandle(profile.handle),
							profile,
						]),
					);
					setContext((current) =>
						current
							? applyHydratedProfilesToContext(current, profilesByHandle)
							: current,
					);
				})
				.catch((error: unknown) => {
					if (!active) return;
					console.warn("Profile hydration failed", error);
				});
		};
		const timer = window.setTimeout(() => {
			if ("requestIdleCallback" in window) {
				idleId = window.requestIdleCallback(runHydration, { timeout: 2500 });
			} else {
				runHydration();
			}
		}, PROFILE_HYDRATION_DELAY_MS);

		return () => {
			active = false;
			window.clearTimeout(timer);
			if (idleId !== null && "cancelIdleCallback" in window) {
				window.cancelIdleCallback(idleId);
			}
		};
	}, [queryClient, result]);

	return { context, error, loading, markdown, result, run, status };
}

function TodayRoute() {
	const search = Route.useSearch();
	const navigate = Route.useNavigate();
	return (
		<TodayRouteView
			searchState={search}
			onSearchChange={(next, options) =>
				void navigate({ search: next, replace: options?.replace })
			}
		/>
	);
}

export function TodayRouteView({
	searchState: controlledSearch,
	onSearchChange,
}: {
	searchState?: TodayRouteSearch;
	onSearchChange?: RouteSearchChange<TodayRouteSearch>;
} = {}) {
	const [localSearch, setLocalSearch] = useState(() => validateTodaySearch({}));
	const searchState = controlledSearch ?? localSearch;
	const updateSearch: RouteSearchChange<TodayRouteSearch> = (next, options) =>
		onSearchChange ? onSearchChange(next, options) : setLocalSearch(next);
	const { period, includeDms } = searchState;
	const { context, error, loading, markdown, result, run, status } =
		useDigestStream(period, includeDms);
	useEffect(() => {
		const root = document.documentElement;
		root.classList.add("today-pdf-route");
		return () => root.classList.remove("today-pdf-route");
	}, []);
	const sourceLabel = useMemo(
		() => formatCounts(result?.context ?? context),
		[context, result],
	);
	const digestLabel =
		result?.context.window.label ??
		context?.window.label ??
		periodLabel(period);
	const canExportPdf = Boolean(result?.markdown.trim()) && !loading;
	const exportTitle = `BirdClaw ${digestLabel} digest`;
	const exportUpdatedAt = result
		? new Date(result.updatedAt).toLocaleString(undefined, {
				dateStyle: "medium",
				timeStyle: "short",
			})
		: null;
	const handleExportPdf = useCallback(() => {
		if (!canExportPdf) return;
		exportCurrentDigestPdf(exportTitle);
	}, [canExportPdf, exportTitle]);

	return (
		<div className="today-pdf-root flex min-h-screen flex-col">
			<header className={cx("today-pdf-header", pageHeaderClass)}>
				<div className={pageHeaderRowClass}>
					<div className="min-w-0">
						<h1 className={pageTitleClass}>What happened</h1>
						<p className={pageSubtitleClass}>{sourceLabel}</p>
					</div>
					<div className={cx("today-screen-only", pageHeaderActionsClass)}>
						{canExportPdf ? (
							<button
								type="button"
								className={secondaryButtonClass}
								onClick={handleExportPdf}
							>
								<FileDown className="size-4" aria-hidden="true" />
								Export PDF
							</button>
						) : null}
						<button
							type="button"
							className={secondaryButtonClass}
							onClick={() => run(true)}
							disabled={loading}
						>
							<RefreshCw
								className={cx("size-4", loading && "animate-spin")}
								aria-hidden="true"
							/>
							Refresh
						</button>
					</div>
				</div>
				<div className="today-pdf-meta" aria-hidden="true">
					<span>{digestLabel}</span>
					<span>·</span>
					<span>Sources: {sourceLabel}</span>
					{exportUpdatedAt ? (
						<>
							<span>·</span>
							<span>Generated {exportUpdatedAt}</span>
						</>
					) : null}
				</div>
				<div className="today-screen-only flex flex-wrap items-center gap-2 px-4 pb-3">
					<div className={segmentedClass} aria-label="Digest period">
						{periods.map((item) => (
							<button
								key={item.value}
								type="button"
								aria-pressed={period === item.value}
								className={cx(
									segmentClass,
									period === item.value && segmentAccentActiveClass,
								)}
								onClick={() =>
									updateSearch({ ...searchState, period: item.value })
								}
							>
								{item.label}
							</button>
						))}
					</div>
					<label className="inline-flex items-center gap-2 rounded-full border border-[var(--line)] px-3 py-1 text-[13px] font-medium text-[var(--ink-soft)]">
						<input
							type="checkbox"
							checked={includeDms}
							onChange={(event) =>
								updateSearch({
									...searchState,
									includeDms: event.currentTarget.checked,
								})
							}
						/>
						DMs
					</label>
				</div>
			</header>

			{error ? (
				<div
					className={cx(
						errorCopyClass,
						"flex items-center justify-between gap-3",
					)}
					role="alert"
				>
					<span>{error}</span>
					<button
						className="shrink-0 font-semibold underline underline-offset-2"
						onClick={() => run(true)}
						type="button"
					>
						Retry
					</button>
				</div>
			) : null}

			<div className="today-screen-only border-b border-[var(--line)] px-4 py-2 text-[13px] text-[var(--ink-soft)]">
				<span className="inline-flex items-center gap-1">
					{loading ? (
						<Loader2 className="size-4 animate-spin" aria-hidden="true" />
					) : markdown ? (
						<CheckCircle2 className="size-4" aria-hidden="true" />
					) : (
						<Sparkles className="size-4" aria-hidden="true" />
					)}
					{loading
						? status
						: result
							? `${result.cached ? "Cached" : "Ready"} · ${result.context.window.label}`
							: error
								? "Digest failed"
								: "Ready"}
				</span>
			</div>

			{markdown ? (
				result ? (
					<DigestReport markdown={markdown} result={result} />
				) : (
					<MarkdownViewer context={context} markdown={markdown} />
				)
			) : (
				<div className="px-4 py-5 text-[14px] text-[var(--ink-soft)]">
					{loading
						? status
						: error
							? "No digest was generated. Retry to start a new run."
							: "Waiting for the first tokens..."}
				</div>
			)}
		</div>
	);
}
