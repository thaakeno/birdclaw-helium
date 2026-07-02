import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";

const dbPath = "D:/Project Archive/birdclaw/local-data/birdclaw.sqlite";
const rawPath = "D:/Project Archive/birdclaw/exports/raw/bird-bookmarks-thaakeno-all.utf8.json";

const raw = JSON.parse(readFileSync(rawPath, "utf8"));
const tweets = Array.isArray(raw.tweets) ? raw.tweets : [];
const db = new DatabaseSync(dbPath);

function isoDate(value) {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toISOString();
}

function profileId(tweet) {
  return String(tweet.authorId ?? tweet.author?.id ?? tweet.user?.id ?? `profile_${tweet.author?.username ?? "unknown"}`);
}

function handle(tweet) {
  return String(tweet.author?.username ?? tweet.username ?? tweet.user?.screen_name ?? "unknown").replace(/^@/, "");
}

function displayName(tweet) {
  return String(tweet.author?.name ?? tweet.name ?? handle(tweet));
}

function avatarHue(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return hash;
}

function mediaItems(tweet) {
  const media = Array.isArray(tweet.media) ? tweet.media : [];
  return media.map((item) => {
    const type = item.type === "photo" ? "image" : item.type === "animated_gif" ? "gif" : item.type === "video" ? "video" : "unknown";
    const out = {
      url: String(item.videoUrl ?? item.url ?? item.previewUrl ?? ""),
      type,
    };
    if (item.previewUrl) out.thumbnailUrl = String(item.previewUrl);
    if (item.width) out.width = Number(item.width);
    if (item.height) out.height = Number(item.height);
    if (item.durationMs) out.durationMs = Number(item.durationMs);
    if (item.videoUrl) out.variants = [{ url: String(item.videoUrl), contentType: "video/mp4" }];
    return out;
  }).filter((item) => item.url);
}

function entities(tweet) {
  const urls = mediaItems(tweet).map((item, index) => ({
    url: item.thumbnailUrl ?? item.url,
    expandedUrl: item.thumbnailUrl ?? item.url,
    displayUrl: item.thumbnailUrl ?? item.url,
    start: index,
    end: index,
  }));
  return urls.length ? { urls } : {};
}

function quotedId(tweet) {
  return String(tweet.quotedStatusId ?? tweet.quotedTweet?.id ?? tweet.quoted_tweet?.id ?? "");
}

const insertProfile = db.prepare(`
  insert into profiles (
    id, handle, display_name, bio, followers_count, following_count, avatar_hue,
    avatar_url, location, url, verified_type, entities_json, created_at
  ) values (?, ?, ?, '', 0, 0, ?, null, null, null, null, '{}', '')
  on conflict(id) do update set
    handle = coalesce(nullif(excluded.handle, 'unknown'), profiles.handle),
    display_name = coalesce(nullif(excluded.display_name, 'unknown'), profiles.display_name)
`);
const findProfileById = db.prepare("select id from profiles where id = ?");
const findProfileByHandle = db.prepare("select id from profiles where lower(handle) = lower(?)");

const insertTweet = db.prepare(`
  insert into tweets (
    id, author_profile_id, text, created_at, is_replied, reply_to_id, like_count,
    media_count, entities_json, media_json, quoted_tweet_id
  ) values (?, ?, ?, ?, 0, null, ?, ?, ?, ?, ?)
  on conflict(id) do update set
    author_profile_id = coalesce(excluded.author_profile_id, tweets.author_profile_id),
    text = coalesce(nullif(excluded.text, ''), tweets.text),
    created_at = coalesce(nullif(excluded.created_at, ''), tweets.created_at),
    like_count = max(coalesce(tweets.like_count, 0), coalesce(excluded.like_count, 0)),
    media_count = max(coalesce(tweets.media_count, 0), coalesce(excluded.media_count, 0)),
    entities_json = case when excluded.entities_json != '{}' then excluded.entities_json else tweets.entities_json end,
    media_json = case when excluded.media_json != '[]' then excluded.media_json else tweets.media_json end,
    quoted_tweet_id = coalesce(nullif(excluded.quoted_tweet_id, ''), tweets.quoted_tweet_id)
`);

const deleteFts = db.prepare("delete from tweets_fts where tweet_id = ?");
const insertFts = db.prepare("insert into tweets_fts (tweet_id, text) values (?, ?)");

let seenQuoted = 0;
let upsertedQuotes = 0;
let linkedParents = 0;

function ensureProfile(tweet) {
  const id = profileId(tweet);
  const accountHandle = handle(tweet);
  const existingById = findProfileById.get(id);
  if (existingById?.id) return String(existingById.id);
  const existingByHandle = findProfileByHandle.get(accountHandle);
  if (existingByHandle?.id) return String(existingByHandle.id);
  insertProfile.run(id, accountHandle, displayName(tweet), avatarHue(id));
  return id;
}

db.exec("begin immediate");
try {
  for (const tweet of tweets) {
    const quote = tweet.quotedTweet ?? tweet.quotedStatus ?? tweet.quote ?? tweet.quoted_tweet;
    if (!quote?.id) continue;
    seenQuoted += 1;

    const parentQuoteId = quotedId(tweet);
    if (parentQuoteId) {
      db.prepare("update tweets set quoted_tweet_id = ? where id = ? and (quoted_tweet_id is null or quoted_tweet_id = '')").run(parentQuoteId, String(tweet.id));
      linkedParents += 1;
    }

    const pid = ensureProfile(quote);
    const qMedia = mediaItems(quote);
    insertTweet.run(
      String(quote.id),
      pid,
      String(quote.text ?? ""),
      isoDate(quote.createdAt ?? quote.created_at),
      Number(quote.likeCount ?? quote.public_metrics?.like_count ?? 0),
      qMedia.length,
      JSON.stringify(entities(quote)),
      JSON.stringify(qMedia),
      quotedId(quote) || null,
    );
    deleteFts.run(String(quote.id));
    insertFts.run(String(quote.id), String(quote.text ?? ""));
    upsertedQuotes += 1;
  }
  db.exec("commit");
} catch (error) {
  db.exec("rollback");
  throw error;
}

const missing = db.prepare(`
  select count(*) as n
  from tweets t
  left join tweets qt on qt.id = t.quoted_tweet_id
  where t.quoted_tweet_id is not null and t.quoted_tweet_id != '' and qt.id is null
`).get().n;

console.log(JSON.stringify({ seenQuoted, upsertedQuotes, linkedParents, missingQuotedRows: missing }, null, 2));
