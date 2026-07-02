export function parseJsonField<T>(value: unknown, fallback: T): T {
	if (typeof value !== "string" || value.length === 0) {
		return fallback;
	}

	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

export function toFtsSearchQuery(value: string) {
	return toSearchTerms(value)
		.map((term) => `"${term.replaceAll('"', '""')}"`)
		.join(" ");
}

export function toSearchTerms(value: string) {
	const seen = new Set<string>();
	const terms = value.match(/[\p{L}\p{N}_]+/gu) ?? [];
	return terms
		.map((term) => term.trim().toLowerCase())
		.filter((term) => term.length > 0)
		.filter((term) => {
			if (seen.has(term)) return false;
			seen.add(term);
			return true;
		});
}
