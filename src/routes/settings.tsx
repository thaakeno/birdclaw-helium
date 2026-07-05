import { createFileRoute } from "@tanstack/react-router";
import {
	CheckCircle2,
	Eye,
	EyeOff,
	GripVertical,
	KeyRound,
	Loader2,
	RotateCcw,
	Save,
	ShieldCheck,
	SlidersHorizontal,
	Sparkles,
	Download,
} from "lucide-react";
import {
	type DragEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useState,
} from "react";
import {
	NAV_HIDDEN_KEY,
	NAV_ORDER_KEY,
	PINNED_PROFILES_KEY,
	orderNavItems,
	readPinnedProfiles,
	readBoolean,
	readStringArray,
	SIDEBAR_MY_POSTS_AVATAR_KEY,
	HIDE_QUOTE_INFO_KEY,
	writeBoolean,
	writePinnedProfiles,
	writeStringArray,
} from "#/lib/nav-preferences";
import {
	cx,
	errorCopyClass,
	pageHeaderClass,
	pageHeaderRowClass,
	pageSubtitleClass,
	pageTitleClass,
	primaryButtonClass,
	secondaryButtonClass,
	selectFieldClass,
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

type NavPath = (typeof navItems)[number]["to"];
type AiProvider = "openai" | "gemini";

interface AiSettings {
	provider: AiProvider;
	model: string;
	hasGeminiApiKey: boolean;
	geminiModels: string[];
}

export const Route = createFileRoute("/settings")({
	component: SettingsRoute,
});

function SettingsRoute() {
	const [hidden, setHidden] = useState<string[]>([]);
	const [order, setOrder] = useState<string[]>([]);
	const [useMyPostsAvatar, setUseMyPostsAvatar] = useState(false);
	const [hideQuoteInfo, setHideQuoteInfo] = useState(false);
	const [pinnedProfiles, setPinnedProfiles] = useState(readPinnedProfiles);
	const [draggingPath, setDraggingPath] = useState<NavPath | null>(null);
	const [ai, setAi] = useState<AiSettings | null>(null);
	const [aiLoading, setAiLoading] = useState(true);
	const [aiSaving, setAiSaving] = useState(false);
	const [aiError, setAiError] = useState<string | null>(null);
	const [aiSaved, setAiSaved] = useState(false);
	const [provider, setProvider] = useState<AiProvider>("openai");
	const [model, setModel] = useState("gpt-5.5");
	const [geminiApiKey, setGeminiApiKey] = useState("");
	const [clearGeminiApiKey, setClearGeminiApiKey] = useState(false);

	useEffect(() => {
		setHidden(readStringArray(NAV_HIDDEN_KEY));
		setOrder(readStringArray(NAV_ORDER_KEY));
		setUseMyPostsAvatar(readBoolean(SIDEBAR_MY_POSTS_AVATAR_KEY));
		setHideQuoteInfo(readBoolean(HIDE_QUOTE_INFO_KEY));
		setPinnedProfiles(readPinnedProfiles());
		void loadAiSettings();
	}, []);

	const orderedItems = useMemo(() => orderNavItems(navItems, order), [order]);
	const visibleCount = orderedItems.length - hidden.length;
	const geminiModelOptions = ai?.geminiModels?.length
		? ai.geminiModels
		: ["gemini-3.5-flash", "gemini-2.5-flash", "gemini-2.5-pro"];

	async function loadAiSettings() {
		setAiLoading(true);
		setAiError(null);
		try {
			const response = await fetch("/api/settings-ai");
			if (!response.ok) throw new Error(await response.text());
			const data = (await response.json()) as AiSettings;
			setAi(data);
			setProvider(data.provider);
			setModel(data.model);
		} catch (error) {
			setAiError(
				error instanceof Error ? error.message : "Could not load AI settings",
			);
		} finally {
			setAiLoading(false);
		}
	}

	function persistHidden(next: string[]) {
		setHidden(next);
		writeStringArray(NAV_HIDDEN_KEY, next);
	}

	function persistOrder(next: string[]) {
		setOrder(next);
		writeStringArray(NAV_ORDER_KEY, next);
	}

	function resetSidebar() {
		persistHidden([]);
		persistOrder([]);
		setUseMyPostsAvatar(false);
		writeBoolean(SIDEBAR_MY_POSTS_AVATAR_KEY, false);
		setPinnedProfiles([]);
		window.localStorage.removeItem(PINNED_PROFILES_KEY);
		window.dispatchEvent(new Event("birdclaw:nav-preferences"));
	}

	function persistPinnedProfiles(next: typeof pinnedProfiles) {
		setPinnedProfiles(next);
		writePinnedProfiles(next);
	}

	function moveDraggedItem(targetPath: NavPath) {
		if (!draggingPath || draggingPath === targetPath) return;
		const current = orderedItems.map((item) => item.to);
		const from = current.indexOf(draggingPath);
		const to = current.indexOf(targetPath);
		if (from < 0 || to < 0) return;
		const next = [...current];
		const [item] = next.splice(from, 1);
		if (!item) return;
		next.splice(to, 0, item);
		persistOrder(next);
	}

	function onDragStart(event: DragEvent<HTMLButtonElement>, path: NavPath) {
		setDraggingPath(path);
		event.dataTransfer.effectAllowed = "move";
		event.dataTransfer.setData("text/plain", path);
	}

	function onDrop(event: DragEvent<HTMLDivElement>, targetPath: NavPath) {
		event.preventDefault();
		moveDraggedItem(targetPath);
		setDraggingPath(null);
	}

	async function saveAiSettings() {
		setAiSaving(true);
		setAiError(null);
		setAiSaved(false);
		try {
			const response = await fetch("/api/settings-ai", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					provider,
					model,
					...(geminiApiKey ? { geminiApiKey } : {}),
					clearGeminiApiKey,
				}),
			});
			if (!response.ok) throw new Error(await response.text());
			const data = (await response.json()) as {
				settings: AiSettings;
			};
			setAi(data.settings);
			setProvider(data.settings.provider);
			setModel(data.settings.model);
			setGeminiApiKey("");
			setClearGeminiApiKey(false);
			setAiSaved(true);
			window.setTimeout(() => setAiSaved(false), 2400);
		} catch (error) {
			setAiError(
				error instanceof Error ? error.message : "Could not save AI settings",
			);
		} finally {
			setAiSaving(false);
		}
	}

	return (
		<>
			<header className={pageHeaderClass}>
				<div className={pageHeaderRowClass}>
					<div>
						<h1 className={pageTitleClass}>Settings</h1>
						<p className={pageSubtitleClass}>
							Local controls for navigation, live sources, and analysis.
						</p>
					</div>
				</div>
			</header>

			<section className="flex flex-col gap-5 border-b border-[var(--line)] px-4 py-5">
				<SettingsSectionHeader
					icon={<SlidersHorizontal className="size-5" strokeWidth={1.8} />}
					title="Sidebar"
					meta={`${String(visibleCount)} visible · ${String(hidden.length)} hidden`}
					action={
						<button
							className={secondaryButtonClass}
							onClick={resetSidebar}
							type="button"
						>
							<RotateCcw className="size-4" strokeWidth={1.8} />
							Reset
						</button>
					}
				/>

				<div className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--panel)]">
					<div className="flex min-w-0 items-center gap-3 border-b border-[var(--line)] px-3 py-3">
						<div className="min-w-0 flex-1">
							<div className="truncate text-[14px] font-bold text-[var(--ink)]">
								Use avatar for My Posts
							</div>
							<div className="truncate text-[12px] text-[var(--ink-soft)]">
								Replace only the My Posts nav icon with your active account
								avatar.
							</div>
						</div>
						<button
							aria-pressed={useMyPostsAvatar}
							className={cx(
								"inline-flex h-9 min-w-[92px] items-center justify-center rounded-full border px-3 text-[13px] font-semibold transition-colors",
								useMyPostsAvatar
									? "border-[color:color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]"
									: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)]",
							)}
							onClick={() => {
								const next = !useMyPostsAvatar;
								setUseMyPostsAvatar(next);
								writeBoolean(SIDEBAR_MY_POSTS_AVATAR_KEY, next);
							}}
							type="button"
						>
							{useMyPostsAvatar ? "On" : "Off"}
						</button>
					</div>
					<div className="flex min-w-0 items-center gap-3 border-b border-[var(--line)] px-3 py-3">
						<div className="min-w-0 flex-1">
							<div className="truncate text-[14px] font-bold text-[var(--ink)]">
								Hide quoted posts metrics
							</div>
							<div className="truncate text-[12px] text-[var(--ink-soft)]">
								Hide the metric counters (likes, retweets, replies) on quoted posts.
							</div>
						</div>
						<button
							aria-pressed={hideQuoteInfo}
							className={cx(
								"inline-flex h-9 min-w-[92px] items-center justify-center rounded-full border px-3 text-[13px] font-semibold transition-colors",
								hideQuoteInfo
									? "border-[color:color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]"
									: "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)]",
							)}
							onClick={() => {
								const next = !hideQuoteInfo;
								setHideQuoteInfo(next);
								writeBoolean(HIDE_QUOTE_INFO_KEY, next);
							}}
							type="button"
						>
							{hideQuoteInfo ? "On" : "Off"}
						</button>
					</div>
					{orderedItems.map((item, index) => {
						const isHidden = hidden.includes(item.to);
						const isDragging = draggingPath === item.to;
						return (
							<div
								className={cx(
									"group flex min-w-0 items-center gap-3 border-t border-[var(--line)] px-3 py-3 first:border-t-0",
									isDragging && "bg-[var(--accent-soft)] opacity-70",
								)}
								key={item.to}
								onDragOver={(event) => event.preventDefault()}
								onDrop={(event) => onDrop(event, item.to)}
							>
								<button
									aria-label={`Drag ${item.label}`}
									className="grid size-9 shrink-0 cursor-grab place-items-center rounded-full text-[var(--ink-soft)] transition-colors hover:bg-[var(--bg-hover)] hover:text-[var(--ink)] active:cursor-grabbing"
									draggable
									onDragEnd={() => setDraggingPath(null)}
									onDragStart={(event) => onDragStart(event, item.to)}
									type="button"
								>
									<GripVertical className="size-5" strokeWidth={1.8} />
								</button>
								<div className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--bg)] text-[12px] font-bold text-[var(--ink-soft)]">
									{String(index + 1)}
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[14px] font-bold text-[var(--ink)]">
										{item.label}
									</div>
									<div className="truncate text-[12px] text-[var(--ink-soft)]">
										{item.to}
									</div>
								</div>
								<button
									aria-pressed={!isHidden}
									className={cx(
										"inline-flex h-9 min-w-[112px] items-center justify-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors",
										isHidden
											? "border-[var(--line)] bg-[var(--bg)] text-[var(--ink-soft)] hover:bg-[var(--bg-hover)]"
											: "border-[color:color-mix(in_srgb,var(--accent)_45%,var(--line))] bg-[var(--accent-soft)] text-[var(--accent)]",
									)}
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
										<EyeOff className="size-4" strokeWidth={1.8} />
									) : (
										<Eye className="size-4" strokeWidth={1.8} />
									)}
									{isHidden ? "Hidden" : "Visible"}
								</button>
							</div>
						);
					})}
				</div>
				<div className="overflow-hidden rounded-[8px] border border-[var(--line)] bg-[var(--panel)]">
					<div className="border-b border-[var(--line)] px-3 py-3">
						<div className="text-[14px] font-bold text-[var(--ink)]">
							Pinned profiles
						</div>
						<div className="text-[12px] text-[var(--ink-soft)]">
							Reorder or remove profiles pinned under the main nav.
						</div>
					</div>
					{pinnedProfiles.length > 0 ? (
						pinnedProfiles.map((profile, index) => (
							<div
								className="flex min-w-0 items-center gap-3 border-t border-[var(--line)] px-3 py-3 first:border-t-0"
								key={profile.handle.toLowerCase()}
							>
								<div className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--bg)] text-[12px] font-bold text-[var(--ink-soft)]">
									{String(index + 1)}
								</div>
								<div className="min-w-0 flex-1">
									<div className="truncate text-[14px] font-bold text-[var(--ink)]">
										{profile.displayName || `@${profile.handle}`}
									</div>
									<div className="truncate text-[12px] text-[var(--ink-soft)]">
										@{profile.handle}
										{profile.lastSyncedAt
											? ` · synced ${new Date(profile.lastSyncedAt).toLocaleString()}`
											: ""}
									</div>
								</div>
								<button
									className="h-8 rounded-full border border-[var(--line)] px-3 text-[12px] font-bold text-[var(--ink-soft)] hover:bg-[var(--bg-hover)]"
									disabled={index === 0}
									onClick={() => {
										const next = [...pinnedProfiles];
										const [item] = next.splice(index, 1);
										if (!item) return;
										next.splice(index - 1, 0, item);
										persistPinnedProfiles(next);
									}}
									type="button"
								>
									Up
								</button>
								<button
									className="h-8 rounded-full border border-[var(--line)] px-3 text-[12px] font-bold text-[var(--ink-soft)] hover:bg-[var(--bg-hover)]"
									disabled={index >= pinnedProfiles.length - 1}
									onClick={() => {
										const next = [...pinnedProfiles];
										const [item] = next.splice(index, 1);
										if (!item) return;
										next.splice(index + 1, 0, item);
										persistPinnedProfiles(next);
									}}
									type="button"
								>
									Down
								</button>
								<button
									className="h-8 rounded-full border border-[var(--line)] px-3 text-[12px] font-bold text-[var(--alert)] hover:bg-[var(--bg-hover)]"
									onClick={() =>
										persistPinnedProfiles(
											pinnedProfiles.filter(
												(item) =>
													item.handle.toLowerCase() !==
													profile.handle.toLowerCase(),
											),
										)
									}
									type="button"
								>
									Remove
								</button>
							</div>
						))
					) : (
						<div className="px-3 py-4 text-[13px] text-[var(--ink-soft)]">
							No pinned profiles yet.
						</div>
					)}
				</div>
			</section>

			<section className="flex flex-col gap-5 px-4 py-5">
				<SettingsSectionHeader
					icon={<Sparkles className="size-5" strokeWidth={1.8} />}
					title="AI"
					meta={
						aiLoading
							? "Loading"
							: provider === "gemini"
								? "Gemini active"
								: "OpenAI active"
					}
				/>

				<div className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-4">
					<div className="grid gap-4 md:grid-cols-[1fr_1fr]">
						<label className="flex flex-col gap-2">
							<span className="text-[13px] font-semibold text-[var(--ink)]">
								Provider
							</span>
							<select
								className={selectFieldClass}
								disabled={aiLoading || aiSaving}
								onChange={(event) => {
									const next = event.target.value as AiProvider;
									setProvider(next);
									setModel(next === "gemini" ? "gemini-3.5-flash" : "gpt-5.5");
								}}
								value={provider}
							>
								<option value="openai">OpenAI</option>
								<option value="gemini">Gemini</option>
							</select>
						</label>

						<label className="flex flex-col gap-2">
							<span className="text-[13px] font-semibold text-[var(--ink)]">
								Model
							</span>
							{provider === "gemini" ? (
								<select
									className={selectFieldClass}
									disabled={aiLoading || aiSaving}
									onChange={(event) => setModel(event.target.value)}
									value={model}
								>
									{geminiModelOptions.map((option) => (
										<option key={option} value={option}>
											{option}
										</option>
									))}
								</select>
							) : (
								<input
									className="h-10 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 text-[14px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
									disabled={aiLoading || aiSaving}
									onChange={(event) => setModel(event.target.value)}
									value={model}
								/>
							)}
						</label>
					</div>

					<div className="mt-4 grid gap-3">
						<label className="flex flex-col gap-2">
							<span className="inline-flex items-center gap-2 text-[13px] font-semibold text-[var(--ink)]">
								<KeyRound className="size-4" strokeWidth={1.8} />
								Gemini API key
							</span>
							<input
								autoComplete="off"
								className="h-10 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-soft)] focus:border-[var(--accent)]"
								disabled={aiLoading || aiSaving || provider !== "gemini"}
								onChange={(event) => {
									setGeminiApiKey(event.target.value);
									setClearGeminiApiKey(false);
								}}
								placeholder={
									ai?.hasGeminiApiKey ? "Saved key present" : "Paste Gemini key"
								}
								type="password"
								value={geminiApiKey}
							/>
						</label>

						<div className="flex flex-wrap items-center justify-between gap-3 rounded-[8px] border border-[var(--line)] bg-[var(--bg)] px-3 py-2">
							<div className="flex min-w-0 items-center gap-2 text-[13px] text-[var(--ink-soft)]">
								<ShieldCheck className="size-4 shrink-0" strokeWidth={1.8} />
								<span className="truncate">
									{ai?.hasGeminiApiKey
										? "Gemini key is saved in local Birdclaw config."
										: "No Gemini key saved."}
								</span>
							</div>
							{ai?.hasGeminiApiKey ? (
								<label className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ink)]">
									<input
										checked={clearGeminiApiKey}
										onChange={(event) =>
											setClearGeminiApiKey(event.currentTarget.checked)
										}
										type="checkbox"
									/>
									Clear saved key
								</label>
							) : null}
						</div>
					</div>

					{aiError ? (
						<div className={cx(errorCopyClass, "mt-4")}>{aiError}</div>
					) : null}
					<div className="mt-4 flex flex-wrap items-center gap-3">
						<button
							className={primaryButtonClass}
							disabled={aiLoading || aiSaving}
							onClick={() => void saveAiSettings()}
							type="button"
						>
							{aiSaving ? (
								<Loader2 className="size-4 animate-spin" strokeWidth={1.8} />
							) : (
								<Save className="size-4" strokeWidth={1.8} />
							)}
							Save AI
						</button>
						{aiSaved ? (
							<span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[var(--accent)]">
								<CheckCircle2 className="size-4" strokeWidth={1.8} />
								Saved
							</span>
						) : null}
					</div>
				</div>
			</section>

			<section className="flex flex-col gap-5 px-4 py-5 border-t border-[var(--line)]">
				<SettingsSectionHeader
					icon={<Download className="size-5" strokeWidth={1.8} />}
					title="Export Data"
					meta="Download your local Twitter archive collections"
				/>

				<div className="rounded-[8px] border border-[var(--line)] bg-[var(--panel)] p-4 flex flex-col gap-4">
					<p className="text-[13px] leading-[1.45] text-[var(--ink-soft)] m-0">
						Download all of your locally archived posts, bookmarks, or likes
						formatted as Markdown citations (with replies) or structured JSON
						and BibTeX files.
					</p>

					<div className="grid gap-4 md:grid-cols-3">
						{/* Bookmarks Column */}
						<div className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
							<span className="text-[14px] font-bold text-[var(--ink)]">
								Bookmarks
							</span>
							<div className="flex flex-col gap-2 mt-1">
								<a
									href="/api/bulk-export?resource=bookmarks&format=markdown"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download Markdown
								</a>
								<a
									href="/api/bulk-export?resource=bookmarks&format=json"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download JSON
								</a>
								<a
									href="/api/bulk-export?resource=bookmarks&format=bibtex"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download BibTeX
								</a>
							</div>
						</div>

						{/* Likes Column */}
						<div className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
							<span className="text-[14px] font-bold text-[var(--ink)]">
								Likes
							</span>
							<div className="flex flex-col gap-2 mt-1">
								<a
									href="/api/bulk-export?resource=likes&format=markdown"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download Markdown
								</a>
								<a
									href="/api/bulk-export?resource=likes&format=json"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download JSON
								</a>
								<a
									href="/api/bulk-export?resource=likes&format=bibtex"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download BibTeX
								</a>
							</div>
						</div>

						{/* My Posts Column */}
						<div className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3">
							<span className="text-[14px] font-bold text-[var(--ink)]">
								My Posts
							</span>
							<div className="flex flex-col gap-2 mt-1">
								<a
									href="/api/bulk-export?resource=authored&format=markdown"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download Markdown
								</a>
								<a
									href="/api/bulk-export?resource=authored&format=json"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download JSON
								</a>
								<a
									href="/api/bulk-export?resource=authored&format=bibtex"
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download BibTeX
								</a>
							</div>
						</div>
					</div>
				</div>
			</section>
		</>
	);
}

function SettingsSectionHeader({
	icon,
	title,
	meta,
	action,
}: {
	icon: ReactNode;
	title: string;
	meta: string;
	action?: ReactNode;
}) {
	return (
		<div className="flex flex-wrap items-center justify-between gap-3">
			<div className="flex min-w-0 items-center gap-3">
				<div className="grid size-10 shrink-0 place-items-center rounded-full border border-[var(--line)] bg-[var(--panel)] text-[var(--accent)]">
					{icon}
				</div>
				<div className="min-w-0">
					<h2 className="text-[16px] font-bold text-[var(--ink)]">{title}</h2>
					<p className="truncate text-[13px] text-[var(--ink-soft)]">{meta}</p>
				</div>
			</div>
			{action}
		</div>
	);
}
