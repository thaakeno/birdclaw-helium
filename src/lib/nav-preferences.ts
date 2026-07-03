export const NAV_PREFERENCES_EVENT = "birdclaw:nav-preferences";
export const NAV_ORDER_KEY = "birdclaw.nav.order";
export const NAV_HIDDEN_KEY = "birdclaw.nav.hidden";
export const SIDEBAR_COLLAPSED_KEY = "birdclaw.sidebar.collapsed";

export interface NavPreferenceItem {
	to: string;
	label: string;
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
