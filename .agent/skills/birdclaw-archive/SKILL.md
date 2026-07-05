---
name: birdclaw-archive
description: Work with the user's local Birdclaw archive of X/Twitter bookmarks, likes, home/FY posts, profile posts, quotes, threads, media metadata, and exports. Use when an agent needs to find saved X posts, analyze themes, sync/export Birdclaw data, inspect the SQLite archive, troubleshoot Bird/Helium cookie sync, or prepare AI-safe bookmark context without exposing cookies, browser profiles, DMs, tokens, or raw sensitive X data.
---

# Birdclaw Archive

## What Birdclaw Is

Birdclaw is the user's local-first X/Twitter archive and search app. In this setup it lives at `D:\Project Archive\birdclaw` and stores the local archive in SQLite under `D:\Project Archive\birdclaw\local-data`.

Birdclaw can show and query:

- X/Twitter bookmarks, likes, home/FY timeline rows, mentions, authored posts, profile timeline pages, quotes, links, threads/replies fetched on demand, and media metadata.
- Local report/digest views such as Today.
- Curated exports for agent analysis.

Important: this setup uses the Bird helper with the user's logged-in Helium browser cookies/private X web endpoints. It does not require the paid X API for the main bookmark/profile/home workflows. `xurl` is optional and usually not installed here.

## Local Paths

- Repo/app: `D:\Project Archive\birdclaw`
- SQLite DB: `D:\Project Archive\birdclaw\local-data\birdclaw.sqlite`
- Exports: `D:\Project Archive\birdclaw\exports`
- Curated AI bookmark export: `D:\Project Archive\birdclaw\exports\bookmarks-with-quotes.jsonl`
- Server launcher: `D:\Project Archive\birdclaw\tools\start-birdclaw-server.ps1`
- Bird helper: `C:\Users\alier\AppData\Roaming\npm\birdclaw-bird.exe`
- Config: `C:\Users\alier\.birdclaw\config.json`

Use `D:\Project Archive\birdclaw` as the working directory for commands.

## Safety Rules

Default to local reads. Only live-sync when the user asks for fresh data.

Never expose or send to another agent:

- Helium browser profile files.
- Cookies, auth headers, bearer tokens, CSRF tokens, or raw request logs.
- `C:\Users\alier\.birdclaw\config.json` if it contains API keys.
- Raw DMs unless the user explicitly asks for DM analysis.
- The entire SQLite DB unless the user explicitly approves.

Use bounded syncs. Prefer one or a few pages, targeted profile fetches, and targeted thread fetches. Do not mass-download videos/images. Media rows usually store remote CDN URLs; the UI streams them on demand.

For AI sharing, prefer small JSON snippets, source tweet ids, post URLs, summaries, and the curated JSONL export. Strip DMs and raw JSON unless specifically needed.

## Start And Check

Start the local app:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Project Archive\birdclaw\tools\start-birdclaw-server.ps1"
```

Check the app:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/settings-ai"
```

Check Bird auth:

```powershell
& "C:\Users\alier\AppData\Roaming\npm\birdclaw-bird.exe" whoami
```

If sync fails with cookie/database locking, ask the user to close Helium completely, then retry. Do not copy cookie files manually.

## App API Commands

Query newest saved bookmarks:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=home&bookmarked=true&sort=saved-desc&limit=20"
```

Search bookmarks:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=home&bookmarked=true&search=gpt%205.5&sort=saved-desc&limit=50"
```

Search home/FY archive:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=home&search=robot%20parkour%20sim&sort=created-desc&limit=50"
```

Find bookmarks in a date window:

```powershell
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=home&bookmarked=true&sort=saved-desc&since=2026-07-02T00:00:00.000Z&until=2026-07-03T00:00:00.000Z&limit=100"
```

Fetch and archive one post's visible thread/replies:

```powershell
$body = @{ tweetId = "2072102077510369639"; maxPages = 3; timeoutMs = 20000 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/thread-sync" -ContentType "application/json" -Body $body
Invoke-RestMethod "http://127.0.0.1:3000/api/conversation?tweetId=2072102077510369639"
```

Sync a small fresh bookmark page:

```powershell
$body = @{ kind = "bookmarks"; allPages = $true; limit = 100; maxPages = 1 } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:3000/api/sync" -ContentType "application/json" -Body $body
```

Useful `/api/query` parameters:

- `search=<terms>`: full-text search.
- `sort=saved-desc|saved-asc|created-desc|created-asc`.
- `bookmarked=true`: only saved bookmarks.
- `liked=true`: only liked posts.
- `mediaOnly=true`: only posts with media metadata.
- `quotedOnly=true`: only quote posts.
- `originalsOnly=true`: hide replies.
- `account=<local account id>`: restrict to one local account.
- `author=<handle>`: restrict to an author, without `@`.
- `since=<ISO>` and `until=<ISO>`: time window.

## Bird Helper Commands

Fetch recent public profile posts through the authenticated Helium/Bird session:

```powershell
& "C:\Users\alier\AppData\Roaming\npm\birdclaw-bird.exe" user-tweets ChenTessler -n 50 --max-pages 3 --json
```

Fetch one thread directly:

```powershell
& "C:\Users\alier\AppData\Roaming\npm\birdclaw-bird.exe" thread 2072102077510369639 --max-pages 3 --json-full
```

DM sync is currently unavailable with this installed Bird helper if `birdclaw-bird dms` says `unknown command 'dms'`. Use only already-local/imported DMs unless the helper is upgraded.

## CLI Commands

Search local tweets/bookmarks:

```powershell
pnpm cli search tweets "gpt 5.5" --bookmarked --json
```

Run a local research pass after finding good seed terms or tweet ids:

```powershell
pnpm cli --json research "why people are mad about Sony PlayStation discs" --limit 25 --thread-depth 10
```

Check media download scope first:

```powershell
pnpm cli media fetch --dry-run --limit 20 --json
```

Cache images only:

```powershell
pnpm cli media fetch --no-include-video --limit 50 --json
```

Do not run bulk video caching unless the user explicitly asks.

## Accurate Search Workflow

Fast path for broad archive questions:

1. Do not live-sync.
2. Do not start with `bookmarks-with-quotes.jsonl`.
3. Run one SQLite query across tweet text, quoted tweet text, author handle, quoted author handle, and `tweet_collections.kind`.
4. Use only columns known to exist in this archive: `tweets.id`, `text`, `created_at`, `like_count`, `media_count`, `quoted_tweet_id`, `author_profile_id`, `profiles.handle`, `display_name`, and `tweet_collections.kind`, `collected_at`, `source`.
5. Add `PRAGMA busy_timeout=5000` before reads.

For "find my bookmark about X":

1. Query `/api/query` with `bookmarked=true`, `search`, and `sort=saved-desc`.
2. If the hit may involve a quote, original post, or specific author, inspect SQLite joins. The curated JSONL export can be stale or incomplete for quote relationships.
3. Return tweet id, URL, author handle, created time, saved/collection time, text summary, source collection kind, media info, and quoted tweet context.
4. If replies matter, run `/api/thread-sync` for the candidate tweet id, then read `/api/conversation`.
5. Use web search only for outside facts/news/papers, not for the user's private/local archive.

For broad analysis such as "why do people hate Sony/PlayStation?":

1. Search SQLite across direct tweet text, quoted tweet text, author handle, and quoted author handle.
2. Count rows by `tweet_collections.kind`.
3. Count top quoted tweet ids to detect pile-ons around one source.
4. Pull representative posts with URLs and quote context.
5. Then synthesize themes. Do not answer from a broad JSONL grep alone.

## SQLite Recipes

Use Node's built-in `node:sqlite`; do not require `sqlite3` on PATH.

Broad query across text, quotes, authors, and collection metadata:

```powershell
@'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('D:/Project Archive/birdclaw/local-data/birdclaw.sqlite', { readOnly: true });
db.exec('PRAGMA busy_timeout=5000');
const term = '%playstation%';
const rows = db.prepare(`
  select t.id, t.text, t.created_at, t.like_count, t.media_count, t.quoted_tweet_id,
         p.handle, p.display_name,
         q.text as quoted_text, qp.handle as quoted_handle,
         group_concat(distinct c.kind) as kinds,
         max(c.collected_at) as last_collected
  from tweets t
  join profiles p on p.id = t.author_profile_id
  left join tweets q on q.id = t.quoted_tweet_id
  left join profiles qp on qp.id = q.author_profile_id
  left join tweet_collections c on c.tweet_id = t.id
  where lower(coalesce(t.text,'') || ' ' || coalesce(q.text,'') || ' ' || coalesce(p.handle,'') || ' ' || coalesce(qp.handle,'')) like lower(?)
  group by t.id
  order by coalesce(max(c.collected_at), t.created_at) desc
  limit 80
`).all(term);
console.log(JSON.stringify(rows.map(r => ({
  ...r,
  url: `https://x.com/${r.handle}/status/${r.id}`
})), null, 2));
db.close();
'@ | node --input-type=module
```

Find direct posts by a handle and saved quote reactions to that handle:

```powershell
@'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('D:/Project Archive/birdclaw/local-data/birdclaw.sqlite', { readOnly: true });
db.exec('PRAGMA busy_timeout=5000');
const handle = 'playstation';
const rows = db.prepare(`
  select t.id, t.text, t.created_at, p.handle,
         q.id as quoted_id, q.text as quoted_text, qp.handle as quoted_handle,
         group_concat(distinct c.kind) as kinds,
         max(c.collected_at) as last_collected
  from tweets t
  join profiles p on p.id = t.author_profile_id
  left join tweets q on q.id = t.quoted_tweet_id
  left join profiles qp on qp.id = q.author_profile_id
  left join tweet_collections c on c.tweet_id = t.id
  where lower(p.handle) = lower(?) or lower(coalesce(qp.handle,'')) = lower(?)
  group by t.id
  order by coalesce(max(c.collected_at), t.created_at) desc
  limit 80
`).all(handle, handle);
console.log(JSON.stringify(rows, null, 2));
db.close();
'@ | node --input-type=module
```

Top quoted source posts for a topic:

```powershell
@'
import { DatabaseSync } from 'node:sqlite';
const db = new DatabaseSync('D:/Project Archive/birdclaw/local-data/birdclaw.sqlite', { readOnly: true });
db.exec('PRAGMA busy_timeout=5000');
const term = '%sony%';
const rows = db.prepare(`
  select t.quoted_tweet_id as source_id, qp.handle, substr(q.text, 1, 260) as source_text, count(*) as reactions
  from tweets t
  join profiles p on p.id = t.author_profile_id
  left join tweets q on q.id = t.quoted_tweet_id
  left join profiles qp on qp.id = q.author_profile_id
  where t.quoted_tweet_id is not null
    and lower(coalesce(t.text,'') || ' ' || coalesce(q.text,'') || ' ' || coalesce(p.handle,'') || ' ' || coalesce(qp.handle,'')) like lower(?)
  group by t.quoted_tweet_id
  order by reactions desc
  limit 20
`).all(term);
console.log(JSON.stringify(rows, null, 2));
db.close();
'@ | node --input-type=module
```

## Media Guidance

Birdclaw usually stores media metadata and remote CDN URLs, not full local media files. Images may appear offline if they are browser-cached, avatar-cached, imported from an official archive, or already loaded by the app. Videos/GIFs should stream from stored `video.twimg.com` variants when the archive has them.

If a home/FY post only has a `pbs.twimg.com/*video_thumb*` thumbnail and no playable variant, fetch that specific thread/post again. Do not pretend a thumbnail is a video.

## Caveats

- X private web endpoints can change. Birdclaw can break until the helper/app is updated.
- Profile timeline fetches are page-limited recent fetches unless explicitly paginated; they are not guaranteed full historical archives.
- Likes/bookmarks completeness depends on how many pages were synced and whether X returned older pages.
- `xurl not installed` is expected here. It only affects optional official API-style paths and rate-limit diagnostics.
- Reddit/TikTok are not covered by Birdclaw. They need separate tools/export paths.
