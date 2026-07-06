import {
	ChevronLeft,
	ChevronRight,
	ExternalLink,
	Maximize2,
	Pause,
	Play,
	Volume2,
	VolumeX,
	X,
} from "lucide-react";
import {
	useEffect,
	useRef,
	useState,
	type CSSProperties,
	type MutableRefObject,
	type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { TweetMediaItem } from "#/lib/types";
import { cx, tweetMediaGridClass, tweetMediaTileClass } from "#/lib/ui";

export function TweetMediaGrid({
	items,
	onHydrateVideo,
	postUrl,
	viewerAside,
}: {
	items: TweetMediaItem[];
	onHydrateVideo?: () => Promise<void> | void;
	postUrl?: string;
	viewerAside?: ReactNode;
}) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [failedVideoUrls, setFailedVideoUrls] = useState<Set<string>>(
		() => new Set(),
	);
	const [hydratingVideo, setHydratingVideo] = useState(false);
	const touchStartXRef = useRef<number | null>(null);
	const visibleItems = items.slice(0, 4);
	const selectedItem =
		selectedIndex === null ? null : (visibleItems[selectedIndex] ?? null);
	const selectedVideoUrl =
		selectedItem?.type === "video" || selectedItem?.type === "gif"
			? playableVideoUrlForItem(selectedItem)
			: null;
	const hasCarousel = visibleItems.length > 1;
	const showPrevious = () =>
		setSelectedIndex((current) =>
			current === null
				? null
				: (current - 1 + visibleItems.length) % visibleItems.length,
		);
	const showNext = () =>
		setSelectedIndex((current) =>
			current === null ? null : (current + 1) % visibleItems.length,
		);
	const singleImage =
		visibleItems.length === 1 &&
		visibleItems[0]?.type === "image" &&
		!isVideoLikeMedia(visibleItems[0])
			? visibleItems[0]
			: null;
	const singleMediaStyle =
		visibleItems.length === 1 ? singleMediaContainerStyle(visibleItems[0]) : undefined;

	async function hydrateVideo() {
		if (!onHydrateVideo || hydratingVideo) return;
		setHydratingVideo(true);
		try {
			await onHydrateVideo();
		} finally {
			setHydratingVideo(false);
		}
	}

	useEffect(() => {
		if (selectedIndex === null) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setSelectedIndex(null);
			} else if (event.key === "ArrowLeft" && hasCarousel) {
				showPrevious();
			} else if (event.key === "ArrowRight" && hasCarousel) {
				showNext();
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [hasCarousel, selectedIndex, visibleItems.length]);

	if (items.length === 0) {
		return null;
	}

	const modal =
		selectedItem && typeof document !== "undefined"
			? createPortal(
					<MediaViewerModal
						hasCarousel={hasCarousel}
						items={visibleItems}
						onClose={() => setSelectedIndex(null)}
						onNext={showNext}
						onPrevious={showPrevious}
						onSelect={setSelectedIndex}
						postUrl={postUrl}
						selectedIndex={selectedIndex}
						selectedItem={selectedItem}
						selectedVideoUrl={selectedVideoUrl ?? null}
						touchStartXRef={touchStartXRef}
						viewerAside={viewerAside}
					/>,
					document.body,
				)
			: null;

	return (
		<>
			{singleImage ? (
				<button
					aria-label="Open tweet media 1"
					className={cx(
						"tweet-media-single mt-2 max-h-[460px] max-w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-active)] p-0 text-left transition-colors hover:bg-[var(--bg-hover)]",
						singleImage.width && singleImage.height
							? "block"
							: "inline-block align-top",
					)}
					onClick={(event) => {
						event.stopPropagation();
						setSelectedIndex(0);
					}}
					style={singleImageStyle(singleImage)}
					type="button"
				>
					<img
						alt={singleImage.altText ?? "Tweet media 1"}
						className={cx(
							"tweet-media-image block max-h-[460px] max-w-full",
							singleImage.width && singleImage.height
								? "size-full object-contain"
								: "h-auto w-auto object-contain",
						)}
						height={singleImage.height}
						loading="lazy"
						src={singleImage.thumbnailUrl ?? singleImage.url}
						width={singleImage.width}
					/>
				</button>
			) : (
				<div
					className={tweetMediaGridClass(Math.min(items.length, 4))}
					style={singleMediaStyle}
				>
					{visibleItems.map((item, index) => {
						const itemLooksLikeVideo = isVideoLikeMedia(item);
						const tileStyle =
							visibleItems.length === 1 && item.width && item.height
								? {
										aspectRatio: `${String(item.width)} / ${String(item.height)}`,
									}
								: undefined;
						const directVideoUrl = itemLooksLikeVideo
							? playableVideoUrlForItem(item)
							: null;
						const videoUrl = directVideoUrl
							? browserVideoUrl(directVideoUrl)
							: null;
						const videoFailed =
							directVideoUrl !== null &&
							directVideoUrl !== undefined &&
							failedVideoUrls.has(directVideoUrl);
						if (videoUrl && directVideoUrl && !videoFailed) {
							return (
								<div
									key={item.url + String(index)}
									className={cx(
										tweetMediaTileClass(index, Math.min(items.length, 4)),
										"bg-black shadow-[0_0_34px_color-mix(in_srgb,var(--accent)_14%,transparent)]",
									)}
									style={tileStyle}
								>
									<BirdclawVideoPlayer
										label={`Tweet media ${String(index + 1)}`}
										loop={item.type === "gif"}
										muted={item.type === "gif"}
										onError={() => {
											setFailedVideoUrls((current) => {
												const next = new Set(current);
												next.add(directVideoUrl);
												return next;
											});
										}}
										poster={item.thumbnailUrl}
										rawUrl={directVideoUrl}
										src={videoUrl}
										videoHeight={item.height}
										videoWidth={item.width}
									/>
									<MediaTileActions
										index={index}
										onOpen={() => setSelectedIndex(index)}
										postUrl={postUrl}
									/>
								</div>
							);
						}

						return (
							<button
								key={item.url + String(index)}
								aria-label={
									itemLooksLikeVideo && !directVideoUrl && onHydrateVideo
										? `Fetch tweet video ${String(index + 1)}`
										: `Open tweet media ${String(index + 1)}`
								}
								className={cx(
									tweetMediaTileClass(index, Math.min(items.length, 4)),
									itemLooksLikeVideo && "bg-black",
								)}
								onClick={(event) => {
									event.stopPropagation();
									if (itemLooksLikeVideo && !directVideoUrl && onHydrateVideo) {
										void hydrateVideo();
										return;
									}
									setSelectedIndex(index);
								}}
								style={tileStyle}
								type="button"
							>
								{item.type === "image" || mediaPreviewUrl(item) ? (
									<>
										{itemLooksLikeVideo && mediaPreviewUrl(item) ? (
											<img
												alt=""
												aria-hidden="true"
												className="pointer-events-none absolute inset-0 size-full scale-110 object-cover opacity-55 blur-2xl saturate-125"
												src={mediaPreviewUrl(item)}
											/>
										) : null}
										<img
											alt={item.altText ?? `Tweet media ${String(index + 1)}`}
											className={cx(
												"tweet-media-image block size-full object-contain",
												itemLooksLikeVideo && "relative z-10",
											)}
											loading="lazy"
											src={mediaPreviewUrl(item) ?? item.url}
										/>
									</>
								) : (
									<span className="tweet-media-fallback grid min-h-40 place-items-center font-semibold text-[var(--ink-soft)]">
										{item.type === "video"
											? "Video"
											: item.type === "gif"
												? "GIF"
												: "Media"}
									</span>
								)}
								{itemLooksLikeVideo ? (
									<span className="absolute inset-0 z-20 grid place-items-center bg-black/10">
										<span className="grid size-12 place-items-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/25">
											<Play
												aria-hidden="true"
												className="ml-0.5 size-5 fill-current"
												strokeWidth={2.2}
											/>
										</span>
										<span className="sr-only">
											{item.type === "gif" ? "GIF" : "Video"}
										</span>
									</span>
								) : null}
								{itemLooksLikeVideo && !directVideoUrl && onHydrateVideo ? (
									<span className="absolute inset-x-2 bottom-2 z-30 flex justify-center">
										<span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-bold text-white shadow-lg ring-1 ring-white/20">
											{hydratingVideo ? "Fetching video" : "Fetch video"}
										</span>
									</span>
								) : null}
								{itemLooksLikeVideo && postUrl ? (
									<a
										aria-label="Open original post"
										className="absolute right-2 top-2 z-30 grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 transition-colors hover:bg-black/80"
										href={postUrl}
										onClick={(event) => event.stopPropagation()}
										rel="noreferrer"
										target="_blank"
									>
										<ExternalLink
											aria-hidden="true"
											className="size-4"
											strokeWidth={2}
										/>
									</a>
								) : null}
							</button>
						);
					})}
				</div>
			)}
			{modal}
		</>
	);
}

function MediaViewerModal({
	hasCarousel,
	items,
	onClose,
	onNext,
	onPrevious,
	onSelect,
	postUrl,
	selectedIndex,
	selectedItem,
	selectedVideoUrl,
	touchStartXRef,
	viewerAside,
}: {
	hasCarousel: boolean;
	items: TweetMediaItem[];
	onClose: () => void;
	onNext: () => void;
	onPrevious: () => void;
	onSelect: (index: number) => void;
	postUrl?: string;
	selectedIndex: number | null;
	selectedItem: TweetMediaItem;
	selectedVideoUrl: string | null;
	touchStartXRef: MutableRefObject<number | null>;
	viewerAside?: ReactNode;
}) {
	const bodyClass = viewerAside
		? "grid h-full w-full grid-cols-1 overflow-hidden bg-black min-[980px]:grid-cols-[minmax(0,1fr)_420px]"
		: "flex h-full w-full items-center justify-center";

	useEffect(() => {
		const originalStyle = document.body.style.overflow;
		document.body.style.overflow = "hidden";
		return () => {
			document.body.style.overflow = originalStyle;
		};
	}, []);

	return (
		<div
			aria-modal="true"
			className="fixed inset-0 z-[9999] bg-black/90 backdrop-blur-2xl backdrop-saturate-150"
			onClick={(event) => {
				event.stopPropagation();
				onClose();
			}}
			onTouchEnd={(event) => {
				if (!hasCarousel || touchStartXRef.current === null) return;
				const delta =
					event.changedTouches[0]?.clientX ?? touchStartXRef.current;
				const distance = delta - touchStartXRef.current;
				touchStartXRef.current = null;
				if (Math.abs(distance) < 42) return;
				if (distance > 0) onPrevious();
				else onNext();
			}}
			onTouchStart={(event) => {
				touchStartXRef.current = event.touches[0]?.clientX ?? null;
			}}
			role="dialog"
		>
			<button
				aria-label="Close media viewer"
				className="absolute left-4 top-4 z-20 grid size-11 place-items-center rounded-full bg-black/55 text-white shadow-lg ring-1 ring-white/15 transition-colors hover:bg-white/20"
				onClick={(event) => {
					event.stopPropagation();
					onClose();
				}}
				type="button"
			>
				<X className="size-5" strokeWidth={1.8} />
			</button>
			<div className={bodyClass} onClick={(event) => event.stopPropagation()}>
				<div className="relative grid min-h-0 min-w-0 place-items-center px-4 py-16">
					{hasCarousel ? (
						<>
							<button
								aria-label="Previous media"
								className="absolute left-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-lg ring-1 ring-white/15 transition-colors hover:bg-white/20"
								onClick={(event) => {
									event.stopPropagation();
									onPrevious();
								}}
								type="button"
							>
								<ChevronLeft className="size-6" strokeWidth={2} />
							</button>
							<button
								aria-label="Next media"
								className="absolute right-3 top-1/2 z-10 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white shadow-lg ring-1 ring-white/15 transition-colors hover:bg-white/20"
								onClick={(event) => {
									event.stopPropagation();
									onNext();
								}}
								type="button"
							>
								<ChevronRight className="size-6" strokeWidth={2} />
							</button>
						</>
					) : null}
					{selectedItem.type === "image" ? (
						<img
							alt={selectedItem.altText ?? "Tweet media"}
							className="max-h-[calc(100vh-8rem)] max-w-full object-contain"
							src={selectedItem.url}
						/>
					) : selectedVideoUrl ? (
						<BirdclawVideoPlayer
							autoPlay={selectedItem.type === "gif"}
							label="Tweet video"
							loop={selectedItem.type === "gif"}
							modal
							muted={selectedItem.type === "gif"}
							poster={selectedItem.thumbnailUrl}
							rawUrl={selectedVideoUrl}
							src={browserVideoUrl(selectedVideoUrl)}
							videoHeight={selectedItem.height}
							videoWidth={selectedItem.width}
						/>
					) : (
						<div className="grid min-h-64 min-w-80 place-items-center gap-3 rounded-2xl border border-white/20 bg-black p-6 text-white">
							<span>
								{selectedItem.type === "video"
									? "Video"
									: selectedItem.type === "gif"
										? "GIF"
										: "Media"}
							</span>
							<a
								className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
								href={selectedItem.url}
								rel="noreferrer"
								target="_blank"
							>
								Open media
							</a>
						</div>
					)}
					{selectedVideoUrl ? (
						<div
							className={cx(
								"absolute left-1/2 -translate-x-1/2",
								hasCarousel ? "bottom-20" : "bottom-4",
							)}
						>
							<MediaDialogLinks postUrl={postUrl} videoUrl={selectedVideoUrl} />
						</div>
					) : null}
					{hasCarousel ? (
						<div
							className="absolute bottom-4 left-1/2 flex max-w-[min(520px,70vw)] -translate-x-1/2 gap-2 overflow-x-auto rounded-full bg-black/45 p-2 shadow-lg ring-1 ring-white/10 backdrop-blur-md [scrollbar-width:none]"
							onClick={(event) => event.stopPropagation()}
						>
							{items.map((item, index) => (
								<button
									aria-label={`Show media ${String(index + 1)}`}
									aria-pressed={selectedIndex === index}
									className={cx(
										"relative size-12 shrink-0 overflow-hidden rounded-md ring-2 transition-transform hover:scale-105",
										selectedIndex === index
											? "ring-white"
											: "ring-white/20 opacity-75",
									)}
									key={`${item.url}:${String(index)}`}
									onClick={() => onSelect(index)}
									type="button"
								>
									{mediaPreviewUrl(item) ? (
										<img
											alt=""
											className="size-full object-cover"
											src={mediaPreviewUrl(item)}
										/>
									) : (
										<span className="grid size-full place-items-center bg-white/10 text-[10px] font-bold text-white">
											{item.type}
										</span>
									)}
								</button>
							))}
						</div>
					) : null}
				</div>
				{viewerAside ? (
					<aside className="min-h-0 flex flex-col border-l border-white/10 bg-[var(--bg)] text-[var(--ink)] overflow-hidden">
						{viewerAside}
					</aside>
				) : null}
			</div>
		</div>
	);
}

function BirdclawVideoPlayer({
	autoPlay = false,
	label,
	loop = false,
	modal = false,
	muted = false,
	onError,
	poster,
	rawUrl,
	src,
	videoHeight,
	videoWidth,
}: {
	autoPlay?: boolean;
	label: string;
	loop?: boolean;
	modal?: boolean;
	muted?: boolean;
	onError?: () => void;
	poster?: string;
	rawUrl: string;
	src: string;
	videoHeight?: number;
	videoWidth?: number;
}) {
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const ambienceVideoRef = useRef<HTMLVideoElement | null>(null);
	const [duration, setDuration] = useState(0);
	const [currentTime, setCurrentTime] = useState(0);
	const [isMuted, setIsMuted] = useState(muted);
	const [isPlaying, setIsPlaying] = useState(false);
	const [hasError, setHasError] = useState(false);
	const foregroundVideoStyle = mediaAspectRatioStyle(videoWidth, videoHeight);

	useEffect(() => {
		const ambienceVideo = ambienceVideoRef.current;
		if (!ambienceVideo || poster) return;
		const foregroundVideo = videoRef.current;
		try {
			if (foregroundVideo) {
				ambienceVideo.currentTime = foregroundVideo.currentTime;
			}
			if (isPlaying) {
				void ambienceVideo.play();
			} else {
				ambienceVideo.pause();
			}
		} catch {
			// Ambient video is decorative; playback failures should never affect the real player.
		}
	}, [isPlaying, poster]);

	async function togglePlayback() {
		const video = videoRef.current;
		if (!video) return;
		try {
			if (video.paused) {
				await video.play();
			} else {
				video.pause();
			}
		} catch {
			setHasError(true);
		}
	}

	function seek(value: string) {
		const video = videoRef.current;
		if (!video) return;
		const nextTime = Number(value);
		if (!Number.isFinite(nextTime)) return;
		video.currentTime = nextTime;
		setCurrentTime(nextTime);
	}

	function toggleMute() {
		const video = videoRef.current;
		if (!video) return;
		video.muted = !video.muted;
		setIsMuted(video.muted);
	}

	return (
		<div
			className={cx(
				"group/video relative grid size-full place-items-center overflow-hidden bg-black",
				modal && "max-h-[84vh] max-w-[96vw] rounded-xl shadow-2xl",
			)}
		>
			<div className="pointer-events-none absolute inset-0 z-0 overflow-hidden bg-black">
				{poster ? (
					<img
						alt=""
						aria-hidden="true"
						className="size-full scale-125 object-cover opacity-70 blur-2xl saturate-150"
						src={poster}
					/>
				) : (
					<video
						aria-hidden="true"
						className="size-full scale-125 object-cover opacity-45 blur-2xl saturate-150"
						loop={loop}
						muted
						playsInline
						preload="metadata"
						ref={ambienceVideoRef}
						src={src}
						tabIndex={-1}
					/>
				)}
				<div className="absolute inset-0 bg-black/20" />
			</div>
			<video
				aria-label={label}
				autoPlay={autoPlay}
				className={cx(
					"relative z-10 mx-auto block h-full max-h-full max-w-full object-contain",
					foregroundVideoStyle ? "w-auto" : "w-full",
					modal && "max-h-[84vh] max-w-[96vw]",
				)}
				loop={loop}
				muted={isMuted}
				onClick={(event) => {
					event.stopPropagation();
					void togglePlayback();
				}}
				onDurationChange={(event) => {
					setDuration(event.currentTarget.duration || 0);
				}}
				onError={() => {
					setHasError(true);
					onError?.();
				}}
				onLoadedMetadata={(event) => {
					setDuration(event.currentTarget.duration || 0);
				}}
				onPause={() => setIsPlaying(false)}
				onPlay={() => setIsPlaying(true)}
				onTimeUpdate={(event) => {
					setCurrentTime(event.currentTarget.currentTime);
				}}
				playsInline
				poster={poster}
				preload="metadata"
				ref={videoRef}
				style={foregroundVideoStyle}
			>
				<source src={src} type={videoContentType(rawUrl)} />
			</video>
			{!isPlaying ? (
				<button
					aria-label="Play video"
					className="absolute inset-0 z-20 grid place-items-center bg-black/10 text-white"
					onClick={(event) => {
						event.stopPropagation();
						void togglePlayback();
					}}
					type="button"
				>
					<span className="grid size-14 place-items-center rounded-full bg-black/70 shadow-lg ring-1 ring-white/25 transition-transform group-hover/video:scale-105">
						<Play className="ml-1 size-6 fill-current" strokeWidth={2.1} />
					</span>
				</button>
			) : null}
			<div className="absolute inset-x-0 bottom-0 z-30 flex items-center gap-2 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-3 pb-2 pt-8 text-white opacity-100 transition-opacity sm:opacity-0 sm:group-hover/video:opacity-100 sm:group-focus-within/video:opacity-100">
				<button
					aria-label={isPlaying ? "Pause video" : "Play video"}
					className="grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/15"
					onClick={(event) => {
						event.stopPropagation();
						void togglePlayback();
					}}
					type="button"
				>
					{isPlaying ? (
						<Pause className="size-4 fill-current" strokeWidth={2.2} />
					) : (
						<Play className="ml-0.5 size-4 fill-current" strokeWidth={2.2} />
					)}
				</button>
				<input
					aria-label="Video position"
					className="h-1 min-w-0 flex-1 accent-white"
					max={duration || 0}
					min={0}
					onChange={(event) => seek(event.target.value)}
					onClick={(event) => event.stopPropagation()}
					step="0.1"
					type="range"
					value={duration ? Math.min(currentTime, duration) : 0}
				/>
				<span className="w-[72px] shrink-0 text-right text-[12px] font-semibold tabular-nums text-white/90">
					{formatVideoTime(currentTime)}
					{duration ? ` / ${formatVideoTime(duration)}` : ""}
				</span>
				<button
					aria-label={isMuted ? "Unmute video" : "Mute video"}
					className="grid size-8 shrink-0 place-items-center rounded-full transition-colors hover:bg-white/15"
					onClick={(event) => {
						event.stopPropagation();
						toggleMute();
					}}
					type="button"
				>
					{isMuted ? (
						<VolumeX className="size-4" strokeWidth={2.1} />
					) : (
						<Volume2 className="size-4" strokeWidth={2.1} />
					)}
				</button>
			</div>
			{hasError ? (
				<div className="absolute inset-x-3 bottom-12 z-40 rounded-full bg-black/75 px-3 py-1.5 text-center text-[12px] font-semibold text-white shadow-lg ring-1 ring-white/20">
					Video did not load
				</div>
			) : null}
		</div>
	);
}

function formatVideoTime(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0:00";
	const totalSeconds = Math.floor(value);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;
	return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}

function MediaTileActions({
	index,
	onOpen,
	postUrl,
}: {
	index: number;
	onOpen: () => void;
	postUrl?: string;
}) {
	return (
		<div className="absolute right-2 top-2 z-30 flex gap-1.5">
			<button
				aria-label={`Open tweet media ${String(index + 1)}`}
				className="grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 transition-colors hover:bg-black/80"
				onClick={(event) => {
					event.stopPropagation();
					onOpen();
				}}
				type="button"
			>
				<Maximize2 aria-hidden="true" className="size-4" strokeWidth={2} />
			</button>
			{postUrl ? (
				<a
					aria-label="Open original post"
					className="grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 transition-colors hover:bg-black/80"
					href={postUrl}
					onClick={(event) => event.stopPropagation()}
					rel="noreferrer"
					target="_blank"
				>
					<ExternalLink aria-hidden="true" className="size-4" strokeWidth={2} />
				</a>
			) : null}
		</div>
	);
}

function MediaDialogLinks({
	postUrl,
	videoUrl,
}: {
	postUrl?: string;
	videoUrl: string;
}) {
	return (
		<div className="flex flex-wrap justify-center gap-2">
			<a
				className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
				href={browserVideoUrl(videoUrl)}
				rel="noreferrer"
				target="_blank"
			>
				Open video
			</a>
			{postUrl ? (
				<a
					className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
					href={postUrl}
					rel="noreferrer"
					target="_blank"
				>
					Open post
				</a>
			) : null}
		</div>
	);
}

function mediaPreviewUrl(item: TweetMediaItem) {
	return item.thumbnailUrl ?? (item.type === "image" ? item.url : undefined);
}

function mediaAspectRatioStyle(
	width: number | undefined,
	height: number | undefined,
): CSSProperties | undefined {
	if (!width || !height || width <= 0 || height <= 0) return undefined;
	return { aspectRatio: `${String(width)} / ${String(height)}` };
}

function singleMediaContainerStyle(
	item: TweetMediaItem | undefined,
): CSSProperties | undefined {
	if (!item?.width || !item.height || item.width <= 0 || item.height <= 0) {
		return undefined;
	}
	const maxHeight = 460;
	const maxAspectWidth = Math.round((maxHeight * item.width) / item.height);
	const naturalWidth = Math.min(item.width, maxAspectWidth);
	return {
		aspectRatio: `${String(item.width)} / ${String(item.height)}`,
		width: `min(100%, ${String(naturalWidth)}px)`,
	};
}

function playableVideoUrlForItem(item: TweetMediaItem) {
	const mp4Variant = item.variants?.find((variant) =>
		playableVideoUrl(variant.url),
	);
	return mp4Variant?.url ?? playableVideoUrl(item.url);
}

function isVideoLikeMedia(item: TweetMediaItem) {
	if (item.type === "video" || item.type === "gif") return true;
	return (
		looksLikeVideoThumbnail(item.url) ||
		looksLikeVideoThumbnail(item.thumbnailUrl)
	);
}

function looksLikeVideoThumbnail(url: string | undefined) {
	if (!url) return false;
	try {
		const parsed = new URL(url);
		return (
			parsed.hostname === "pbs.twimg.com" &&
			/(?:^|\/)(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//.test(
				parsed.pathname,
			)
		);
	} catch {
		return /(?:amplify_video_thumb|ext_tw_video_thumb|tweet_video_thumb)\//.test(
			url,
		);
	}
}

function browserVideoUrl(url: string) {
	try {
		const parsed = new URL(url);
		if (parsed.hostname !== "video.twimg.com") return url;
		return `/api/video?url=${encodeURIComponent(url)}`;
	} catch {
		return url;
	}
}

function videoContentType(url: string) {
	return /\.mp4(?:$|[?#])/i.test(url) ? "video/mp4" : undefined;
}

function singleImageStyle(item: TweetMediaItem) {
	if (!item.width || !item.height) return undefined;
	const maxHeight = 460;
	const width = Math.min(
		item.width,
		Math.round((item.width / item.height) * maxHeight),
	);
	return {
		aspectRatio: `${String(item.width)} / ${String(item.height)}`,
		width: `${String(width)}px`,
	};
}

function playableVideoUrl(url: string) {
	try {
		const parsed = new URL(url);
		if (parsed.hostname === "video.twimg.com") return url;
		return /\.(?:mp4|m3u8)(?:$|[?#])/i.test(parsed.pathname) ? url : undefined;
	} catch {
		return /\.(?:mp4|m3u8)(?:$|[?#])/i.test(url) ? url : undefined;
	}
}
