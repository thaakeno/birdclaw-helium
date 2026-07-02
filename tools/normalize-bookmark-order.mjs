import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const db = new DatabaseSync("D:/Project Archive/birdclaw/local-data/birdclaw.sqlite");
const rawPath = "D:/Project Archive/birdclaw/exports/raw/bird-bookmarks-thaakeno-all.utf8.json";
const raw = JSON.parse(readFileSync(rawPath, "utf8"));
const rawTweets = Array.isArray(raw.tweets) ? raw.tweets : [];

const updateCollected = db.prepare(`
  update tweet_collections
  set collected_at = ?, updated_at = max(coalesce(updated_at, ''), ?)
  where kind = 'bookmarks' and tweet_id = ?
`);
const insertCollection = db.prepare(`
  insert into tweet_collections (account_id, tweet_id, kind, collected_at, source, raw_json, updated_at)
  values ('acct_primary', ?, 'bookmarks', ?, ?, ?, ?)
  on conflict(account_id, tweet_id, kind) do update set
    collected_at = excluded.collected_at,
    source = coalesce(tweet_collections.source, excluded.source),
    raw_json = coalesce(tweet_collections.raw_json, excluded.raw_json),
    updated_at = max(coalesce(tweet_collections.updated_at, ''), excluded.updated_at)
`);

const rawBase = new Date("2026-07-02T07:48:37.000Z").getTime();
db.exec("begin immediate");
try {
  rawTweets.forEach((tweet, index) => {
    const at = new Date(rawBase - index * 1000).toISOString();
    insertCollection.run(String(tweet.id), at, "bird-export", JSON.stringify(tweet), at);
    updateCollected.run(at, at, String(tweet.id));
  });
  db.exec("commit");
} catch (error) {
  db.exec("rollback");
  throw error;
}

const liveOut = execFileSync(
  "C:/Users/alier/AppData/Roaming/npm/birdclaw-bird.exe",
  ["bookmarks", "-n", "100", "--json", "--all", "--max-pages", "1"],
  { encoding: "utf8", maxBuffer: 50 * 1024 * 1024, timeout: 60_000 },
);
const live = JSON.parse(liveOut);
const liveTweets = live.tweets ?? live.data ?? [];
writeFileSync("D:/Project Archive/birdclaw/exports/raw/live-bookmarks-page1.json", JSON.stringify(live, null, 2), "utf8");

const liveIds = new Set(liveTweets.map((tweet) => String(tweet.id)));
const liveBase = Date.now();
db.exec("begin immediate");
try {
  liveTweets.forEach((tweet, index) => {
    const at = new Date(liveBase - index * 1000).toISOString();
    updateCollected.run(at, at, String(tweet.id));
  });

  const deleteBookmark = db.prepare("delete from tweet_collections where kind = 'bookmarks' and tweet_id = ?");
  const staleIds = ["2072677837249626367"];
  let pruned = 0;
  for (const id of staleIds) {
    if (!liveIds.has(id)) {
      const result = deleteBookmark.run(id);
      pruned += Number(result.changes ?? 0);
    }
  }
  db.exec("commit");

  console.log(JSON.stringify({
    rawOrdered: rawTweets.length,
    liveOrdered: liveTweets.length,
    prunedKnownStaleRows: pruned,
    liveFirst: liveTweets.slice(0, 5).map((tweet) => ({ id: tweet.id, text: String(tweet.text ?? "").slice(0, 80) })),
    hasLessThanTwoWeeks: liveIds.has("2072677837249626367"),
  }, null, 2));
} catch (error) {
  db.exec("rollback");
  throw error;
}
