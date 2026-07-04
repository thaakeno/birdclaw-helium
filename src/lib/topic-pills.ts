export interface TopicPill {
	id: string;
	label: string;
	emoji: string;
	keywords: string[];
	match?: (text: string) => boolean;
}

export const TOPIC_PILLS: TopicPill[] = [
	{
		id: "seedance",
		label: "Seedance 2.0",
		emoji: "⚡",
		keywords: ["seedance"],
	},
	{
		id: "vidu",
		label: "Vidu",
		emoji: "🎬",
		keywords: ["vidu"],
	},
	{
		id: "wan",
		label: "WAN 2.2",
		emoji: "🌊",
		keywords: ["wan 2.2", "wan22"],
	},
	{
		id: "veosora",
		label: "Veo / Sora",
		emoji: "🎥",
		keywords: ["veo", "sora"],
	},
	{
		id: "gemini",
		label: "Gemini",
		emoji: "🤖",
		keywords: ["gemini"],
	},
	{
		id: "essays",
		label: "Essays / Commentary",
		emoji: "🧠",
		match: (text: string) => {
			const wordCount = text.trim().split(/\s+/).length;
			return wordCount > 60 || text.toLowerCase().includes("art isn't just about") || text.toLowerCase().includes("photography");
		},
		keywords: [],
	},
];
