import { createFileRoute } from "@tanstack/react-router";
import {
	ExternalLink,
	Loader2,
	RefreshCw,
	Search,
	UserRoundSearch,
	UserSearch,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
	DEFAULT_PROFILE_ANALYSIS_LIMITS,
	profileContextUrl,
} from "#/components/ProfileAnalysisClient";
import {
	cleanProfileHandle,
	formatProfileAnalysisCounts,
	ProfileAnalysisOutput,
	ProfileAnalysisStatusLine,
	useProfileAnalysisStream,
} from "#/components/ProfileAnalysisStream";
import type { ProfileAnalysisContext } from "#/lib/profile-analysis";
import {
	cx,
	errorCopyClass,
	pageHeaderActionsClass,
	pageHeaderClass,
	pageHeaderRowClass,
	pageSubtitleClass,
	pageTitleClass,
	primaryButtonClass,
	searchFieldIconClass,
	searchFieldInputClass,
	searchFieldShellClass,
	secondaryButtonClass,
} from "#/lib/ui";

export const Route = createFileRoute("/profile-analyze")({
	component: ProfileAnalyzeRoute,
	validateSearch: (search: Record<string, unknown>) => ({
		handle: typeof search.handle === "string" ? search.handle : "",
	}),
});

function ProfileAnalyzeRoute() {
	const search = Route.useSearch();
	const [handle, setHandle] = useState(cleanProfileHandle(search.handle));
	const [contextLoading, setContextLoading] = useState(false);
	const [contextError, setContextError] = useState<string | null>(null);
	const [profileContext, setProfileContext] =
		useState<ProfileAnalysisContext | null>(null);
	const submittedHandle = useMemo(() => cleanProfileHandle(handle), [handle]);
	const analysis = useProfileAnalysisStream(submittedHandle);
	const autoRunHandleRef = useRef("");
	const runAnalysisRef = useRef(analysis.run);

	useEffect(() => {
		runAnalysisRef.current = analysis.run;
	}, [analysis.run]);

	useEffect(() => {
		const urlHandle = cleanProfileHandle(search.handle);
		setHandle(urlHandle);
		if (urlHandle && autoRunHandleRef.current !== urlHandle) {
			autoRunHandleRef.current = urlHandle;
			runAnalysisRef.current(false, urlHandle);
		}
	}, [search.handle]);

	const submit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		analysis.run(false);
	};

	async function fetchProfilePosts(refresh = false) {
		if (!submittedHandle || contextLoading) return;
		setContextLoading(true);
		setContextError(null);
		try {
			const response = await fetch(
				profileContextUrl(submittedHandle, {
					refresh,
					...DEFAULT_PROFILE_ANALYSIS_LIMITS,
				}),
			);
			if (!response.ok) {
				throw new Error(await response.text());
			}
			const data = (await response.json()) as {
				ok?: boolean;
				context?: ProfileAnalysisContext;
				message?: string;
			};
			if (!data.ok || !data.context) {
				throw new Error(data.message || "Profile fetch failed");
			}
			setProfileContext(data.context);
		} catch (error) {
			setContextError(
				error instanceof Error ? error.message : "Profile fetch failed",
			);
		} finally {
			setContextLoading(false);
		}
	}

	return (
		<section className="flex min-h-screen flex-col gap-6 px-4 py-8">
			<header className={cx(pageHeaderClass, "border-b-0")}>
				<div className={pageHeaderRowClass}>
					<div>
						<h1 className={pageTitleClass}>Profile Analyse</h1>
						<p className={pageSubtitleClass}>
							{formatProfileAnalysisCounts(analysis.context)}
						</p>
					</div>
					<div className={pageHeaderActionsClass}>
						<button
							className={secondaryButtonClass}
							disabled={!submittedHandle || contextLoading}
							onClick={() => void fetchProfilePosts(true)}
							type="button"
						>
							{contextLoading ? (
								<Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
							) : (
								<UserRoundSearch className="size-4" strokeWidth={1.8} />
							)}
							Fetch posts
						</button>
						<button
							className={secondaryButtonClass}
							disabled={!submittedHandle || analysis.loading}
							onClick={() => analysis.run(true)}
							type="button"
						>
							<RefreshCw className="size-4" strokeWidth={1.8} />
							Refresh
						</button>
					</div>
				</div>
				<form
					className="mt-5 flex flex-col gap-3 sm:flex-row"
					onSubmit={submit}
				>
					<label className={cx(searchFieldShellClass, "min-w-0 flex-1")}>
						<Search className={searchFieldIconClass} strokeWidth={1.8} />
						<input
							className={searchFieldInputClass}
							onChange={(event) => setHandle(event.target.value)}
							placeholder="handle"
							value={handle}
						/>
					</label>
					<button
						className={primaryButtonClass}
						disabled={!submittedHandle || analysis.loading}
						type="submit"
					>
						{analysis.loading ? (
							<Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
						) : (
							<UserSearch className="size-4" strokeWidth={1.8} />
						)}
						Analyse
					</button>
				</form>
			</header>

			<ProfileAnalysisStatusLine analysis={analysis} />
			{contextError ? (
				<div className={errorCopyClass}>{contextError}</div>
			) : null}
			<ProfileContextPreview context={profileContext ?? analysis.context} />
			<ProfileAnalysisOutput analysis={analysis} />
		</section>
	);
}

function ProfileContextPreview({
	context,
}: {
	context: ProfileAnalysisContext | null;
}) {
	if (!context) return null;
	const tweets = context.tweets.slice(0, 30);
	return (
		<section className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)]">
			<div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--line)] px-4 py-3">
				<div>
					<h2 className="text-[15px] font-semibold text-[var(--ink)]">
						@{context.handle} posts
					</h2>
					<p className="text-[12px] text-[var(--ink-soft)]">
						{formatProfileAnalysisCounts(context)}
					</p>
				</div>
				<a
					className={cx(secondaryButtonClass, "h-9 px-3 text-[13px]")}
					href={`https://x.com/${context.handle}`}
					rel="noreferrer"
					target="_blank"
				>
					<ExternalLink className="size-4" strokeWidth={1.8} />
					Open X
				</a>
			</div>
			<div className="custom-scrollbar max-h-[560px] divide-y divide-[var(--line)] overflow-y-auto">
				{tweets.map((tweet) => (
					<article key={tweet.id} className="px-4 py-3">
						<div className="mb-1 flex flex-wrap items-center gap-2 text-[12px] text-[var(--ink-soft)]">
							<span>{new Date(tweet.createdAt).toLocaleString()}</span>
							<a
								className="inline-flex items-center gap-1 font-semibold text-[var(--accent)]"
								href={tweet.url}
								rel="noreferrer"
								target="_blank"
							>
								Open post
								<ExternalLink className="size-3" strokeWidth={2} />
							</a>
						</div>
						<p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-[var(--ink)]">
							{tweet.text}
						</p>
					</article>
				))}
				{tweets.length === 0 ? (
					<div className="px-4 py-6 text-[14px] text-[var(--ink-soft)]">
						No local posts found for this profile yet.
					</div>
				) : null}
			</div>
		</section>
	);
}
