import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { TweetMediaGrid } from "./TweetMediaGrid";

describe("TweetMediaGrid", () => {
	afterEach(() => {
		cleanup();
	});

	it("renders nothing without media", () => {
		const { container } = render(<TweetMediaGrid items={[]} />);

		expect(container).toBeEmptyDOMElement();
	});

	it("renders image and video previews, fallback media labels, and caps the grid at four items", () => {
		const { container } = render(
			<TweetMediaGrid
				items={[
					{
						url: "https://example.com/one.jpg",
						type: "image",
						thumbnailUrl: "https://example.com/one-thumb.jpg",
					},
					{
						url: "https://example.com/two.mp4",
						type: "video",
						thumbnailUrl: "https://example.com/two-thumb.jpg",
					},
					{
						url: "https://example.com/three.gif",
						type: "gif",
						thumbnailUrl: "https://example.com/three-thumb.jpg",
					},
					{
						url: "https://example.com/four.bin",
						type: "unknown",
					},
					{
						url: "https://example.com/five.jpg",
						type: "image",
					},
				]}
			/>,
		);

		expect(container.firstChild).toHaveClass("tweet-media-grid-4");
		expect(screen.getByAltText("Tweet media 1")).toHaveAttribute(
			"src",
			"https://example.com/one-thumb.jpg",
		);
		expect(screen.getByLabelText("Tweet media 2")).toHaveAttribute(
			"poster",
			"https://example.com/two-thumb.jpg",
		);
		expect(container.querySelector("video source")).toHaveAttribute(
			"src",
			"https://example.com/two.mp4",
		);
		expect(screen.getByAltText("Tweet media 3")).toHaveAttribute(
			"src",
			"https://example.com/three-thumb.jpg",
		);
		expect(screen.getByText("Media")).toBeInTheDocument();
		expect(
			screen.getAllByRole("button", { name: /Open tweet media/ }),
		).toHaveLength(4);
		expect(screen.getByRole("link", { name: "Open video" })).toHaveAttribute(
			"href",
			"https://example.com/two.mp4",
		);
	});

	it("opens images in a document-level modal viewer", () => {
		const { container } = render(
			<div data-testid="clipping-parent">
				<TweetMediaGrid
					items={[
						{
							url: "https://example.com/one.jpg",
							type: "image",
							width: 1200,
							height: 800,
						},
					]}
				/>
			</div>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));

		const dialog = screen.getByRole("dialog");
		expect(dialog).toBeInTheDocument();
		expect(container).not.toContainElement(dialog);
		expect(dialog.parentElement).toBe(document.body);
		expect(screen.getByRole("img", { name: "Tweet media" })).toHaveAttribute(
			"src",
			"https://example.com/one.jpg",
		);
	});

	it("uses a natural single-image frame instead of the full grid shell", () => {
		const { container } = render(
			<TweetMediaGrid
				items={[
					{
						url: "https://example.com/tall.jpg",
						type: "image",
						altText: "Tall screenshot",
						width: 768,
						height: 1600,
					},
				]}
			/>,
		);

		expect(container.firstChild).toHaveClass("tweet-media-single");
		expect(container.firstChild).not.toHaveClass("tweet-media-grid");
		expect(screen.getByAltText("Tall screenshot")).toHaveAttribute(
			"width",
			"768",
		);
	});

	it("opens video media inline", () => {
		render(
			<TweetMediaGrid
				postUrl="https://x.com/alice/status/1"
				items={[
					{
						url: "https://pbs.twimg.com/video-thumb.jpg",
						type: "video",
						thumbnailUrl: "https://pbs.twimg.com/video-thumb.jpg",
						variants: [
							{
								url: "https://video.twimg.com/clip.mp4",
								contentType: "video/mp4",
							},
						],
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));

		const video = document.querySelector("video");
		expect(video).toHaveAttribute(
			"poster",
			"https://pbs.twimg.com/video-thumb.jpg",
		);
		expect(document.querySelector("video source")).toHaveAttribute(
			"src",
			"/api/video?url=https%3A%2F%2Fvideo.twimg.com%2Fclip.mp4",
		);
		expect(
			screen.getAllByRole("link", { name: "Open video" })[0],
		).toHaveAttribute("href", "https://video.twimg.com/clip.mp4");
		expect(
			screen.getByRole("link", { name: "Open original post" }),
		).toHaveAttribute("href", "https://x.com/alice/status/1");
		expect(screen.getByRole("link", { name: "Open post" })).toHaveAttribute(
			"href",
			"https://x.com/alice/status/1",
		);
	});

	it("opens direct video CDN URLs inline without a variant", () => {
		render(
			<TweetMediaGrid
				items={[
					{
						url: "https://video.twimg.com/ext_tw_video/clip.mp4",
						type: "video",
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));

		expect(document.querySelector("video source")).toHaveAttribute(
			"src",
			"/api/video?url=https%3A%2F%2Fvideo.twimg.com%2Fext_tw_video%2Fclip.mp4",
		);
	});

	it("opens gif mp4 fallbacks inline as looping muted video", () => {
		render(
			<TweetMediaGrid
				items={[
					{
						url: "/media/demo.mp4",
						type: "gif",
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));

		const video = document.querySelector("video");
		expect(document.querySelector("video source")).toHaveAttribute(
			"src",
			"/media/demo.mp4",
		);
		expect(video).toHaveAttribute("loop");
		expect(video?.muted).toBe(true);
	});

	it("does not treat variant-less video thumbnails as playable video", () => {
		const { container } = render(
			<TweetMediaGrid
				items={[
					{
						url: "https://pbs.twimg.com/ext_tw_video_thumb/video.jpg",
						type: "video",
						thumbnailUrl: "https://pbs.twimg.com/ext_tw_video_thumb/video.jpg",
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));

		expect(container.querySelector("video")).toBeNull();
		expect(screen.getByRole("link", { name: "Open media" })).toHaveAttribute(
			"href",
			"https://pbs.twimg.com/ext_tw_video_thumb/video.jpg",
		);
		expect(screen.getByRole("link", { name: "Open media" })).toHaveAttribute(
			"target",
			"_blank",
		);
	});

	it("closes the inline viewer from the close button", () => {
		render(
			<TweetMediaGrid
				items={[
					{
						url: "https://example.com/one.jpg",
						type: "image",
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));
		fireEvent.click(screen.getByRole("button", { name: "Close media viewer" }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("keeps a fallback open path for unknown media", () => {
		render(
			<TweetMediaGrid
				items={[
					{
						url: "https://example.com/archive-media.bin",
						type: "unknown",
					},
				]}
			/>,
		);

		fireEvent.click(screen.getByRole("button", { name: "Open tweet media 1" }));

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(screen.getByRole("link", { name: "Open media" })).toHaveAttribute(
			"href",
			"https://example.com/archive-media.bin",
		);
		expect(screen.getByRole("link", { name: "Open media" })).toHaveAttribute(
			"rel",
			"noreferrer",
		);
	});
});
