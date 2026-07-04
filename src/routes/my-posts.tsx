import { createFileRoute } from "@tanstack/react-router";
import { TimelineRouteFrame } from "#/components/TimelineRouteFrame";
import type { QueryEnvelope } from "#/lib/api-contracts";

export const Route = createFileRoute("/my-posts")({
	component: MyPostsRoute,
});

function myPostsSubtitle(meta: QueryEnvelope | null) {
	if (!meta) return "Loading authored posts...";
	return `Local authored timeline · ${meta.transport.statusText}`;
}

function MyPostsRoute() {
	return (
		<TimelineRouteFrame
			emptyDetail="Import your X archive or fetch your profile to add more authored posts."
			emptyLabel="No authored posts in this local archive yet"
			errorFallback="Authored posts unavailable"
			errorTitle="Could not load authored posts"
			initialReplyFilter="all"
			loadingDetail="Reading locally archived posts and replies"
			loadingLabel="Loading authored posts"
			resource="authored"
			searchPlaceholder="Search your posts"
			syncLabel="Sync posts"
			title="My Posts"
			subtitle={myPostsSubtitle}
		/>
	);
}
