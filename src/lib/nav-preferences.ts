export const NAV_PREFERENCES_EVENT = "birdclaw:nav-preferences";
export const NAV_ORDER_KEY = "birdclaw.nav.order";
export const NAV_HIDDEN_KEY = "birdclaw.nav.hidden";
export const SIDEBAR_COLLAPSED_KEY = "birdclaw.sidebar.collapsed";
export const PINNED_PROFILES_KEY = "birdclaw.nav.pinnedProfiles";
export const SIDEBAR_MY_POSTS_AVATAR_KEY = "birdclaw.sidebar.myPostsAvatar";

export interface NavPreferenceItem {
	to: string;
	label: string;
}

export interface PinnedProfileNavItem {
	handle: string;
	displayName?: string;
	avatarUrl?: string;
	avatarHue?: number;
	profileId?: string;
	lastSyncedAt?: string;
	newCount?: number;
}

export function readStringArray(key: string) {
	if (typeof window === "undefined") return [];
	try {
		const parsed = JSON.parse(window.localStorage.getItem(key) ?? "[]");
		return Array.isArray(parsed)
			? parsed.filter((item): item is string => typeof item === "string")
			: [];
	} catch {
		return [];
	}
}

export function writeStringArray(key: string, value: string[]) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, JSON.stringify(value));
	window.dispatchEvent(new Event(NAV_PREFERENCES_EVENT));
}

export function readPinnedProfiles() {
	if (typeof window === "undefined") return [];
	try {
		const parsed = JSON.parse(
			window.localStorage.getItem(PINNED_PROFILES_KEY) ?? "[]",
		);
		if (!Array.isArray(parsed)) return [];
		return parsed.flatMap((item): PinnedProfileNavItem[] => {
			if (!item || typeof item !== "object") return [];
			const record = item as Record<string, unknown>;
			const handle = String(record.handle ?? "")
				.trim()
				.replace(/^@/, "");
			if (!handle) return [];
			return [
				{
					handle,
					...(typeof record.displayName === "string"
						? { displayName: record.displayName }
						: {}),
					...(typeof record.avatarUrl === "string"
						? { avatarUrl: record.avatarUrl }
						: {}),
					...(typeof record.avatarHue === "number"
						? { avatarHue: record.avatarHue }
						: {}),
					...(typeof record.profileId === "string"
						? { profileId: record.profileId }
						: {}),
					...(typeof record.lastSyncedAt === "string"
						? { lastSyncedAt: record.lastSyncedAt }
						: {}),
					...(typeof record.newCount === "number"
						? { newCount: record.newCount }
						: {}),
				},
			];
		});
	} catch {
		return [];
	}
}

export function writePinnedProfiles(value: PinnedProfileNavItem[]) {
	if (typeof window === "undefined") return;
	const unique = new Map<string, PinnedProfileNavItem>();
	for (const item of value) {
		const handle = item.handle.trim().replace(/^@/, "");
		if (!handle) continue;
		unique.set(handle.toLowerCase(), { ...item, handle });
	}
	window.localStorage.setItem(
		PINNED_PROFILES_KEY,
		JSON.stringify([...unique.values()].slice(0, 12)),
	);
	window.dispatchEvent(new Event(NAV_PREFERENCES_EVENT));
}

export function readBoolean(key: string, fallback = false) {
	if (typeof window === "undefined") return fallback;
	return window.localStorage.getItem(key) === "true";
}

export function writeBoolean(key: string, value: boolean) {
	if (typeof window === "undefined") return;
	window.localStorage.setItem(key, String(value));
	window.dispatchEvent(new Event(NAV_PREFERENCES_EVENT));
}

export function orderNavItems<T extends NavPreferenceItem>(
	items: readonly T[],
	order: readonly string[],
) {
	const byPath = new Map(items.map((item) => [item.to, item]));
	const ordered = order.flatMap((path) => {
		const item = byPath.get(path);
		return item ? [item] : [];
	});
	const remaining = items.filter((item) => !order.includes(item.to));
	return [...ordered, ...remaining];
}
