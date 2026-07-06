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
	Zap,
	Gauge,
	Search,
	ChevronDown,
	Check,
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
	{ to: "/my-posts", label: "My Posts" },
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

function getModelRateLimit(modelId: string): string {
	const lowercase = modelId.toLowerCase();
	if (lowercase.includes("2.5-pro")) {
		return "Paid Tier (2 RPM)";
	}
	if (lowercase.includes("pro")) {
		return "Paid / Free (2 RPM / 50 RPD)";
	}
	if (lowercase.includes("lite")) {
		return "Free (30 RPM / 1.5k RPD)";
	}
	if (lowercase.includes("flash") || lowercase.includes("omni") || lowercase.includes("gemma")) {
		return "Free (15 RPM / 1.5k RPD)";
	}
	if (lowercase.includes("nano")) {
		return "Free (30 RPM / 1.5k RPD)";
	}
	if (
		lowercase.includes("deep-research") ||
		lowercase.includes("computer-use") ||
		lowercase.includes("lyria") ||
		lowercase.includes("robotics") ||
		lowercase.includes("antigravity")
	) {
		return "Paid / Experimental Only";
	}
	return "API limits apply";
}

function getModelDisplayName(modelId: string): string {
	return modelId
		.split("-")
		.map((part) => {
			if (!part) return "";
			const lower = part.toLowerCase();
			if (lower === "tts") return "TTS";
			if (lower === "api") return "API";
			if (lower === "it") return "IT";
			if (lower === "gemini") return "Gemini";
			if (part.match(/^\d+(\.\d+)?$/)) return part; // Keep version numbers intact
			return part.charAt(0).toUpperCase() + part.slice(1);
		})
		.filter(Boolean)
		.join(" ");
}

const GEMINI_MODEL_METADATA = [
	{
		id: "gemini-2.5-flash",
		name: "Gemini 2.5 Flash",
		desc: "Standard model for speed and efficiency",
		limit: "Free (15 RPM / 1.5k RPD)",
		icon: Zap,
	},
	{
		id: "gemini-2.5-pro",
		name: "Gemini 2.5 Pro",
		desc: "Advanced reasoning for complex tasks",
		limit: "Paid Tier Only (2 RPM)",
		icon: Sparkles,
	},
	{
		id: "gemini-2.0-flash-lite",
		name: "Gemini 2.0 Flash-Lite",
		desc: "Low-latency lightweight model",
		limit: "Free (30 RPM / 1.5k RPD)",
		icon: Gauge,
	},
] as const;

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

	const [modelDropdownOpen, setModelDropdownOpen] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const [myPostsType, setMyPostsType] = useState<"all" | "originals" | "replies">("all");

	useEffect(() => {
		if (!modelDropdownOpen) {
			setModelSearch("");
		}
	}, [modelDropdownOpen]);
	const [bookmarkAuthors, setBookmarkAuthors] = useState<Array<{ handle: string; displayName: string }>>([]);
	const [selectedExportUsers, setSelectedExportUsers] = useState<string[]>([]);
	const [exportUserSearch, setExportUserSearch] = useState("");
	const [userDropdownOpen, setUserDropdownOpen] = useState(false);

	useEffect(() => {
		setHidden(readStringArray(NAV_HIDDEN_KEY));
		setOrder(readStringArray(NAV_ORDER_KEY));
		setUseMyPostsAvatar(readBoolean(SIDEBAR_MY_POSTS_AVATAR_KEY));
		setHideQuoteInfo(readBoolean(HIDE_QUOTE_INFO_KEY));
		setPinnedProfiles(readPinnedProfiles());
		void loadAiSettings();

		// Fetch bookmark creators for the filter menu
		fetch("/api/saved-authors?collection=bookmarks")
			.then((r) => r.json())
			.then((data) => {
				if (data && data.authors) {
					setBookmarkAuthors(data.authors);
				}
			})
			.catch(console.error);
	}, []);

	const orderedItems = useMemo(() => orderNavItems(navItems, order), [order]);
	const visibleCount = orderedItems.length - hidden.length;


	const geminiModelOptions = useMemo(() => {
		return ai?.geminiModels?.length
			? ai.geminiModels
			: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash-lite"];
	}, [ai?.geminiModels]);

	const filteredAndSortedModels = useMemo(() => {
		let list = geminiModelOptions;
		if (modelSearch.trim()) {
			const query = modelSearch.toLowerCase().trim();
			list = list.filter((m) => m.toLowerCase().includes(query));
		}

		return [...list].sort((a, b) => {
			const getRank = (name: string) => {
				const lowercase = name.toLowerCase();
				if (lowercase.includes("3.5")) return 50;
				if (lowercase.includes("3.1")) return 40;
				if (lowercase.includes("2.5")) return 30;
				if (lowercase.includes("2.0")) return 20;
				return 10;
			};

			const rankA = getRank(a);
			const rankB = getRank(b);

			if (rankA !== rankB) {
				return rankB - rankA;
			}

			const getPriority = (name: string) => {
				const lowercase = name.toLowerCase();
				if (lowercase.includes("pro")) return 3;
				if (lowercase.includes("flash")) return 2;
				if (lowercase.includes("lite")) return 1;
				return 0;
			};

			const prioA = getPriority(a);
			const prioB = getPriority(b);

			if (prioA !== prioB) {
				return prioB - prioA;
			}

			return a.localeCompare(b);
		});
	}, [geminiModelOptions, modelSearch]);

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
									setModel(next === "gemini" ? "gemini-2.5-flash" : "gpt-5.5");
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
								<div className="relative">
									{modelDropdownOpen && (
										<div className="fixed inset-0 z-40" onClick={() => setModelDropdownOpen(false)} />
									)}
									<button
										type="button"
										onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
										disabled={aiLoading || aiSaving}
										className={cx(
											"flex w-full min-h-[46px] items-center justify-between gap-3 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3.5 py-2 text-left transition-colors focus:border-[var(--accent)] outline-none",
											modelDropdownOpen && "relative z-50",
											(aiLoading || aiSaving) && "opacity-60 cursor-not-allowed"
										)}
									>
										{(() => {
											const selectedMeta = GEMINI_MODEL_METADATA.find(m => m.id === model) || {
												id: model,
												name: getModelDisplayName(model),
												desc: "Dynamically resolved API model",
												limit: getModelRateLimit(model),
												icon: Sparkles,
											};
											const IconComponent = selectedMeta.icon;
											return (
												<div className="flex items-center gap-3 min-w-0 flex-1">
													<div className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--accent-soft)] text-[var(--accent)]">
														<IconComponent className="size-4" />
													</div>
													<div className="min-w-0 flex-1">
														<div className="flex items-baseline justify-between gap-2">
															<span className="text-[13px] font-bold text-[var(--ink)] truncate">
																{selectedMeta.name}
															</span>
															<span className="text-[10px] font-semibold text-[var(--ink-soft)] shrink-0">
																{selectedMeta.limit}
															</span>
														</div>
														<div className="text-[11px] text-[var(--ink-soft)] truncate">
															{selectedMeta.desc}
														</div>
													</div>
												</div>
											);
										})()}
										<ChevronDown className="size-4 text-[var(--ink-soft)] shrink-0" />
									</button>
									{modelDropdownOpen && (
										<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[320px] rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] shadow-xl flex flex-col overflow-hidden">
											<div className="flex items-center gap-2 border-b border-[var(--line)] px-2.5 py-2 bg-[var(--bg-elevated)] shrink-0">
												<Search className="size-3.5 text-[var(--ink-soft)] shrink-0" />
												<input
													type="text"
													value={modelSearch}
													onChange={(e) => setModelSearch(e.target.value)}
													placeholder="Search models..."
													className="w-full bg-transparent text-[12px] text-[var(--ink)] placeholder-[var(--ink-soft)] outline-none border-none py-0.5"
													onClick={(e) => e.stopPropagation()}
												/>
											</div>
											<div className="flex-1 overflow-y-auto p-1 custom-scrollbar max-h-[260px] flex flex-col gap-0.5">
												{filteredAndSortedModels.length > 0 ? (
													filteredAndSortedModels.map((m) => {
														const metadata = GEMINI_MODEL_METADATA.find((item) => item.id === m) || {
															id: m,
															name: getModelDisplayName(m),
															desc: "Dynamically resolved API model",
															limit: getModelRateLimit(m),
															icon: Sparkles,
														};
														const IconComponent = metadata.icon;
														const isSelected = m === model;
														return (
															<button
																key={m}
																type="button"
																onClick={() => {
																	setModel(m);
																	setModelDropdownOpen(false);
																}}
																className={cx(
																	"flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-[var(--bg-hover)]",
																	isSelected && "bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]"
																)}
															>
																<div className={cx(
																	"grid size-8 shrink-0 place-items-center rounded-lg text-sm",
																	isSelected ? "bg-[var(--accent)] text-white" : "bg-[var(--bg)] text-[var(--ink-soft)]"
																)}>
																	<IconComponent className="size-4" />
																</div>
																<div className="min-w-0 flex-1">
																	<div className="flex items-baseline justify-between gap-2">
																		<span className={cx(
																			"text-[12px] font-semibold truncate",
																			isSelected ? "text-[var(--accent)]" : "text-[var(--ink)]"
																		)}>
																			{metadata.name}
																		</span>
																		<span className="text-[9px] font-medium text-[var(--ink-soft)] shrink-0">
																			{metadata.limit}
																		</span>
																	</div>
																	<div className="text-[11px] text-[var(--ink-soft)] truncate">
																		{metadata.desc}
																	</div>
																</div>
																{isSelected && (
																	<Check className="size-4 text-[var(--accent)] shrink-0" />
																)}
															</button>
														);
													})
												) : (
													<div className="px-3 py-4 text-center text-[12px] text-[var(--ink-soft)]">
														No matching models found
													</div>
												)}
											</div>
										</div>
									)}
								</div>
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
							<span className="text-[14px] font-bold text-[var(--ink)] flex items-center gap-1.5">
								<span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold">B</span>
								Bookmarks
							</span>
							
							{/* Filter authors dropdown */}
							<div className="relative mt-2">
								{userDropdownOpen && (
									<div className="fixed inset-0 z-40" onClick={() => setUserDropdownOpen(false)} />
								)}
								<button
									type="button"
									onClick={() => setUserDropdownOpen(!userDropdownOpen)}
									className="flex w-full h-9 items-center justify-between gap-2 rounded-full border border-[var(--line)] bg-[var(--bg)] px-3 text-[12px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)]"
								>
									<span className="truncate">
										{selectedExportUsers.length === 0
											? "All Bookmark Authors"
											: `${selectedExportUsers.length} author${selectedExportUsers.length > 1 ? "s" : ""} selected`}
									</span>
									<ChevronDown className="size-3.5 text-[var(--ink-soft)]" />
								</button>
								{userDropdownOpen && (
									<div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-[220px] overflow-y-auto rounded-xl border border-[var(--line)] bg-[var(--bg-elevated)] p-2 shadow-xl custom-scrollbar flex flex-col gap-1.5">
										<div className="relative">
											<Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--ink-soft)]" />
											<input
												type="text"
												value={exportUserSearch}
												onChange={(e) => setExportUserSearch(e.target.value)}
												placeholder="Search authors..."
												className="h-8 w-full rounded-full border border-[var(--line)] bg-[var(--bg)] pl-8 pr-3 text-[12px] text-[var(--ink)] outline-none focus:border-[var(--accent)]"
											/>
										</div>
										<div className="flex items-center justify-between px-1 text-[10px]">
											<button
												type="button"
												onClick={() => setSelectedExportUsers([])}
												className="text-[var(--accent)] font-bold hover:underline"
											>
												Clear all
											</button>
											<span className="text-[var(--ink-soft)]">
												{bookmarkAuthors.length} total
											</span>
										</div>
										<div className="flex-1 overflow-y-auto flex flex-col max-h-[120px] pr-0.5">
											{(() => {
												const filtered = bookmarkAuthors.filter(a =>
													a.handle.toLowerCase().includes(exportUserSearch.toLowerCase()) ||
													a.displayName.toLowerCase().includes(exportUserSearch.toLowerCase())
												);
												if (filtered.length === 0) {
													return <span className="p-2 text-center text-[11px] text-[var(--ink-soft)]">No authors found</span>;
												}
												return filtered.map(a => {
													const isChecked = selectedExportUsers.includes(a.handle);
													return (
														<label key={a.handle} className="flex items-center gap-2 rounded px-1.5 py-1 text-[12px] hover:bg-[var(--bg-hover)] cursor-pointer select-none">
															<input
																type="checkbox"
																checked={isChecked}
																onChange={() => {
																	if (isChecked) {
																		setSelectedExportUsers(selectedExportUsers.filter(u => u !== a.handle));
																	} else {
																		setSelectedExportUsers([...selectedExportUsers, a.handle]);
																	}
																}}
																className="rounded border-[var(--line)] text-[var(--accent)] focus:ring-[var(--accent)]"
															/>
															<div className="min-w-0 flex-1 truncate text-left">
																<span className="font-semibold text-[var(--ink)]">{a.displayName}</span>{" "}
																<span className="text-[var(--ink-soft)]">@{a.handle}</span>
															</div>
														</label>
													);
												});
											})()}
										</div>
									</div>
								)}
							</div>

							<div className="flex flex-col gap-2 mt-2">
								<a
									href={`/api/bulk-export?resource=bookmarks&format=markdown${selectedExportUsers.length > 0 ? `&users=${selectedExportUsers.join(",")}` : ""}`}
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download Markdown
								</a>
								<a
									href={`/api/bulk-export?resource=bookmarks&format=json${selectedExportUsers.length > 0 ? `&users=${selectedExportUsers.join(",")}` : ""}`}
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download JSON
								</a>
								<a
									href={`/api/bulk-export?resource=bookmarks&format=bibtex${selectedExportUsers.length > 0 ? `&users=${selectedExportUsers.join(",")}` : ""}`}
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download BibTeX
								</a>
							</div>
						</div>

						{/* Likes Column */}
						<div className="flex flex-col gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 justify-between">
							<div>
								<span className="text-[14px] font-bold text-[var(--ink)] flex items-center gap-1.5">
									<span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold">L</span>
									Likes
								</span>
								<p className="text-[11px] text-[var(--ink-soft)] mt-1.5 mb-0">
									Download all curated liked posts. Filters do not apply.
								</p>
							</div>
							<div className="flex flex-col gap-2 mt-4">
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
							<span className="text-[14px] font-bold text-[var(--ink)] flex items-center gap-1.5">
								<span className="inline-flex size-5 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent)] text-[10px] font-bold">P</span>
								My Posts
							</span>

							{/* Segmented type controller */}
							<div className="flex rounded-full border border-[var(--line)] bg-[var(--panel)] p-0.5 mt-2">
								{(["all", "originals", "replies"] as const).map((t) => (
									<button
										key={t}
										type="button"
										onClick={() => setMyPostsType(t)}
										className={cx(
											"flex-1 h-7 rounded-full text-[11px] font-semibold transition-all capitalize",
											myPostsType === t
												? "bg-[var(--bg)] text-[var(--accent)] shadow-sm"
												: "text-[var(--ink-soft)] hover:text-[var(--ink)]"
										)}
									>
										{t}
									</button>
								))}
							</div>

							<div className="flex flex-col gap-2 mt-2">
								<a
									href={`/api/bulk-export?resource=authored&format=markdown&type=${myPostsType}`}
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download Markdown
								</a>
								<a
									href={`/api/bulk-export?resource=authored&format=json&type=${myPostsType}`}
									className="inline-flex h-9 items-center justify-center gap-1.5 rounded-full border border-[var(--line)] px-3 text-[13px] font-semibold text-[var(--ink)] hover:bg-[var(--bg-hover)] no-underline"
								>
									Download JSON
								</a>
								<a
									href={`/api/bulk-export?resource=authored&format=bibtex&type=${myPostsType}`}
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
