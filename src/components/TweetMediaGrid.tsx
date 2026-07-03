import { ExternalLink, Maximize2, Play, X } from "lucide-react";
import { useState } from "react";
import type { TweetMediaItem } from "#/lib/types";
import { cx, tweetMediaGridClass, tweetMediaTileClass } from "#/lib/ui";

export function TweetMediaGrid({
	items,
	onHydrateVideo,
	postUrl,
}: {
	items: TweetMediaItem[];
	onHydrateVideo?: () => Promise<void> | void;
	postUrl?: string;
}) {
	const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
	const [failedVideoUrls, setFailedVideoUrls] = useState<Set<string>>(
		() => new Set(),
	);
	const [hydratingVideo, setHydratingVideo] = useState(false);
	if (items.length === 0) {
		return null;
	}

	const visibleItems = items.slice(0, 4);
	const selectedItem =
		selectedIndex === null ? null : (visibleItems[selectedIndex] ?? null);
	const selectedVideoUrl =
		selectedItem?.type === "video" || selectedItem?.type === "gif"
			? playableVideoUrlForItem(selectedItem)
			: null;
	const singleImage =
		visibleItems.length === 1 &&
		visibleItems[0]?.type === "image" &&
		!isVideoLikeMedia(visibleItems[0])
			? visibleItems[0]
			: null;

	async function hydrateVideo() {
		if (!onHydrateVideo || hydratingVideo) return;
		setHydratingVideo(true);
		try {
			await onHydrateVideo();
		} finally {
			setHydratingVideo(false);
		}
	}

	return (
		<>
			{singleImage ? (
				<button
					aria-label="Open tweet media 1"
					className={cx(
						"tweet-media-single mt-2 max-w-full overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--bg-active)] p-0 text-left transition-colors hover:bg-[var(--bg-hover)]",
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
							"tweet-media-image block max-h-[720px] max-w-full",
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
				<div className={tweetMediaGridClass(Math.min(items.length, 4))}>
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
									className={tweetMediaTileClass(
										index,
										Math.min(items.length, 4),
									)}
									style={tileStyle}
								>
									<video
										aria-label={`Tweet media ${String(index + 1)}`}
										className="block size-full bg-black object-contain"
										controls
										loop={item.type === "gif"}
										muted={item.type === "gif"}
										onClick={(event) => event.stopPropagation()}
										playsInline
										poster={item.thumbnailUrl}
										preload="metadata"
										onError={() => {
											setFailedVideoUrls((current) => {
												const next = new Set(current);
												next.add(directVideoUrl);
												return next;
											});
										}}
									>
										<source
											src={videoUrl}
											type={videoContentType(directVideoUrl)}
										/>
									</video>
									<MediaTileActions
										directVideoUrl={directVideoUrl}
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
								className={tweetMediaTileClass(
									index,
									Math.min(items.length, 4),
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
									<img
										alt={item.altText ?? `Tweet media ${String(index + 1)}`}
										className="tweet-media-image block size-full object-contain"
										loading="lazy"
										src={mediaPreviewUrl(item) ?? item.url}
									/>
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
									<span className="absolute inset-0 grid place-items-center bg-black/10">
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
									<span className="absolute inset-x-2 bottom-2 flex justify-center">
										<span className="inline-flex items-center gap-1.5 rounded-full bg-black/70 px-3 py-1.5 text-[13px] font-bold text-white shadow-lg ring-1 ring-white/20">
											{hydratingVideo ? "Fetching video" : "Fetch video"}
										</span>
									</span>
								) : null}
								{itemLooksLikeVideo && postUrl ? (
									<a
										aria-label="Open original post"
										className="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 transition-colors hover:bg-black/80"
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
			{selectedItem ? (
				<div
					aria-modal="true"
					className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-5"
					onClick={(event) => {
						event.stopPropagation();
						setSelectedIndex(null);
					}}
					role="dialog"
				>
					<button
						aria-label="Close media viewer"
						className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white shadow-lg ring-1 ring-white/15 transition-colors hover:bg-white/20"
						onClick={(event) => {
							event.stopPropagation();
							setSelectedIndex(null);
						}}
						type="button"
					>
						<X className="size-5" strokeWidth={1.8} />
					</button>
					{selectedItem.type === "image" ? (
						<div
							className="grid max-h-[92vh] max-w-[94vw] gap-3"
							onClick={(event) => event.stopPropagation()}
						>
							<img
								alt={selectedItem.altText ?? "Tweet media"}
								className="max-h-[88vh] max-w-[94vw] rounded-xl object-contain"
								src={selectedItem.url}
							/>
							{postUrl ? (
								<div className="flex justify-center">
									<a
										className="rounded-full bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
										href={postUrl}
										rel="noreferrer"
										target="_blank"
									>
										Open post
									</a>
								</div>
							) : null}
						</div>
					) : selectedVideoUrl ? (
						<div
							className="grid max-h-[92vh] max-w-[92vw] gap-3"
							onClick={(event) => event.stopPropagation()}
						>
							<video
								autoPlay={selectedItem.type === "gif"}
								className="max-h-[88vh] max-w-[94vw] rounded-xl bg-black"
								controls
								loop={selectedItem.type === "gif"}
								muted={selectedItem.type === "gif"}
								playsInline
								poster={selectedItem.thumbnailUrl}
								preload="metadata"
							>
								<source
									src={browserVideoUrl(selectedVideoUrl)}
									type={videoContentType(selectedVideoUrl)}
								/>
							</video>
							<MediaDialogLinks postUrl={postUrl} videoUrl={selectedVideoUrl} />
						</div>
					) : (
						<div
							className="grid min-h-64 min-w-80 place-items-center gap-3 rounded-2xl border border-white/20 bg-black p-6 text-white"
							onClick={(event) => event.stopPropagation()}
						>
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
					)}
				</div>
			) : null}
		</>
	);
}

function MediaTileActions({
	directVideoUrl,
	index,
	onOpen,
	postUrl,
}: {
	directVideoUrl: string;
	index: number;
	onOpen: () => void;
	postUrl?: string;
}) {
	return (
		<div className="absolute right-2 top-2 flex gap-1.5">
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
			<a
				aria-label="Open video"
				className="grid size-8 place-items-center rounded-full bg-black/65 text-white shadow-lg ring-1 ring-white/20 transition-colors hover:bg-black/80"
				href={directVideoUrl}
				onClick={(event) => event.stopPropagation()}
				rel="noreferrer"
				target="_blank"
			>
				<Play
					aria-hidden="true"
					className="ml-0.5 size-4 fill-current"
					strokeWidth={2}
				/>
			</a>
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
				href={videoUrl}
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
	const maxHeight = 720;
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
