# Birdclaw Helium

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/Node-25.8.1%2B-339933.svg)](https://nodejs.org/)
[![SQLite](https://img.shields.io/badge/Storage-SQLite%20FTS5-003b57.svg)](https://www.sqlite.org/)
[![Version](https://img.shields.io/badge/Version-0.8.5-informational.svg)](package.json)
[![Fork of](https://img.shields.io/badge/Fork%20of-steipete%2Fbirdclaw-gray.svg)](https://github.com/steipete/birdclaw)

Birdclaw Helium is a personal Twitter workspace that runs entirely on your machine. Everything -- your tweets, bookmarks, likes, DMs, follow graph, and profile data -- lives in a single local SQLite database. Nothing is sent to a third-party server. No subscription. No paid API tier.

This is a fork of [`steipete/birdclaw`](https://github.com/steipete/birdclaw) with three additions the original does not have: a **native Windows desktop app**, a **Circle Timeline** (a curated, algorithm-free chronological feed of pinned accounts), and **direct SQLite persistence** for every profile sync so data is never lost between sessions.

### How syncing works -- and what it costs

Birdclaw Helium syncs using the `bird` CLI, which reads your Twitter session cookies directly from any Chromium-based browser installed on your system (Chrome, Edge, Brave, Vivaldi, Arc, Helium, and others). It makes the same requests your browser would make when you visit Twitter -- no API key, no developer account, no invoice.

One caveat: Chromium locks its cookie database while the browser is open. To sync, you close the browser first, trigger the sync, then reopen. It takes five seconds.

The `xurl` transport is also supported for OAuth2-authenticated reads and writes when available, but is not required.

---

## Birdclaw Helium vs. Original Birdclaw

The fork extends the upstream project in deployment targets, timeline UI, sync persistence, and agentic accessibility. The underlying SQLite schema and transport mechanisms are structurally identical to upstream.

| Subsystem | Original Birdclaw | Birdclaw Helium |
| :--- | :--- | :--- |
| **Deployment Target** | Web server only (`pnpm serve`) | Web server + native Windows Electron desktop app |
| **Feed Architecture** | Standard chronological queues | "Circle" Timeline: merged strictly chronological feeds for pinned accounts |
| **Desktop Workspace** | Single-column page routing | Two-column layout -- inline profile inspection without layout shift |
| **Local Filtering** | Standard query parameters | Millisecond SQLite-backed filter badges (Media, Quotes, Originals, Replies) |
| **Rate Limit State** | Backend terminal logging only | Real-time UI overlays for HTTP 429 throttling events |
| **Profile Sync Persistence** | In-memory cache per session | Bird transport writes directly to the canonical SQLite database |
| **AI Agent Integration** | None | `birdclaw-archive` skill for Antigravity, Claude Code, Codex, and compatible agents |

---

## Who This Is For

- **Power users** who want a persistent, algorithm-free view of specific Twitter accounts without paying for API access.
- **Researchers and analysts** who need reliable archive access, full-text search, and structured exports across bookmarks, likes, and profile timelines.
- **AI coding agents** (Antigravity, Claude Code, Codex, and others) that need programmatic, safe access to a user's Twitter archive via a structured local REST API -- see [Agent Integration](#agent-integration) below.

---

## Installation & Setup

### Requirements

- Node.js `>=25.8.1 <27`
- `pnpm 10.x`
- `bird` CLI: cookie-backed transport helper ([steipete/birdclaw-bird](https://github.com/steipete/birdclaw))
- `xurl` (optional): for live reads and write operations via OAuth2

### Windows Desktop Application

This fork ships a native Electron application for Windows. An automated PowerShell installer packages the Electron distribution and creates Start Menu and Desktop shortcuts.

```powershell
# Install or update the native Windows Desktop App
powershell -NoProfile -ExecutionPolicy Bypass -File tools/install-birdclaw-desktop.ps1
```

Pre-built `.exe` installers and `.zip` binaries are available on the [GitHub Releases page](https://github.com/thaakeno/birdclaw-helium/releases).

### Source Installation

```bash
fnm use          # Activates the correct Node version from .nvmrc / .node-version
pnpm install
pnpm build       # Builds client, server, and CLI bundles
```

Start the web server:

```powershell
# Windows (sets environment and starts the server)
powershell -NoProfile -ExecutionPolicy Bypass -File tools/start-birdclaw-server.ps1
```

Or manually:

```bash
export BIRDCLAW_HOME=~/.birdclaw
node bin/birdclaw.mjs serve --host 127.0.0.1 --port 3000
```

### Initializing the Database

```bash
birdclaw init
birdclaw auth status --json
birdclaw db stats --json
```

---

## Data Ingestion

### Archive Import

```bash
birdclaw archive find --json
birdclaw import archive ~/Downloads/twitter-archive-2025.zip --json

# Hydrate imported profiles using live metadata
birdclaw import hydrate-profiles --json
```

Selective imports are supported via `--select` (e.g., `--select tweets`, `--select directMessages`) to avoid overwriting live-synced data.

### Media Fetching

Archive imports extract `video_info.variants[]`. The media fetch pipeline downloads originals from `pbs.twimg.com` and `video.twimg.com` to `~/.birdclaw/media/originals/`. Already-extracted archive bytes are reused first to avoid redundant CDN requests.

```bash
birdclaw media fetch --json
birdclaw media fetch --no-include-video --parallel 3 --pacing-ms 250 --json
birdclaw media fetch --include-video --video-pacing-ms 1500 --max-bytes 209715200 --json
```

---

## Storage Layout

Default root: `~/.birdclaw` (override via `BIRDCLAW_HOME`).

| Path | Purpose |
| :--- | :--- |
| `birdclaw.sqlite` | Canonical SQLite database (tweets, profiles, DMs, follow graph) |
| `media/` | Root media cache |
| `media/originals/archive/` | Files extracted directly from the archive `.zip` |
| `media/thumbs/avatars/` | Local avatar cache |

---

## CLI Operations

### Live Sync

```bash
pnpm cli sync timeline --limit 100 --refresh --json
pnpm cli sync mentions --mode xurl --limit 100 --max-pages 3 --refresh --json
pnpm cli sync likes --mode auto --limit 100 --refresh --json
pnpm cli dms sync --mode auto --limit 50 --refresh --json
```

### Follow Graph

Graph queries run against local SQLite edges.

```bash
pnpm cli sync followers --json
pnpm cli graph top-followers --limit 20 --json
pnpm cli graph non-mutual-following --sort followers --limit 100 --json
```

### Analysis

```bash
# Daily AI digest of timeline events
birdclaw today

# Analyze a profile with conversation backfill
birdclaw profile-analyze openai --max-pages 20 --max-conversations 40

# Keyword search across local archive
birdclaw discuss "local-first" --mode bird
```

### Moderation

```bash
pnpm cli blocks import ~/blocklist.txt --account acct_primary --json
pnpm cli ban @handle --account acct_primary --transport auto --json
pnpm cli mutes list --account acct_primary --json
```

---

## Backup and Export

Deterministic JSONL shards (yearly tweet shards, per-conversation DM shards) enable Git-friendly backups without SQLite WAL conflicts.

```bash
pnpm cli backup sync --repo ~/Projects/backup-birdclaw --remote https://github.com/yourname/backup-birdclaw.git --json
pnpm cli backup import ~/Projects/backup-birdclaw --json
```

---

## Agent Integration

Birdclaw Helium is designed to be queried and operated by AI coding agents without exposing raw cookies, tokens, or sensitive session data.

### birdclaw-archive Skill

A structured agent skill (`birdclaw-archive`) is included in this repository under `.agents/skills/birdclaw-archive/SKILL.md`. It is compatible with [Antigravity](https://antigravity.ai/), Claude Code, Codex, and any agent framework that supports markdown-defined skills.

The skill exposes:
- How to start and verify the local Birdclaw server.
- Safe, bounded query patterns for bookmarks, likes, profile timelines, quotes, and threads.
- Structured export access via the curated JSONL export at `exports/bookmarks-with-quotes.jsonl`.
- Safety rules — the skill explicitly prohibits agents from accessing cookies, raw DMs, the full SQLite database, or bearer tokens.

**Agents can query the running server's REST API directly:**

```powershell
# Check server status
Invoke-RestMethod "http://127.0.0.1:3000/api/settings-ai"

# Fetch latest bookmarks
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=home&bookmarked=true&sort=saved-desc&limit=20"

# Search bookmarks
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=bookmark&q=local+first&limit=10"

# Circle timeline for pinned accounts
Invoke-RestMethod "http://127.0.0.1:3000/api/query?resource=circle&sort=date-desc&limit=20"
```

---

## Architecture

Birdclaw Helium uses [Effect](https://effect.website/) for all I/O-heavy internals: browser API fetches, sync orchestration, job polling, `bird`/`xurl` subprocess adapters, backup export/import, moderation transport, inbox scoring, and the paced media download pipeline.

Public CLI and React call sites expose `Promise` wrappers at the outer boundary only. New core code uses typed Effect programs; Promise wrappers belong only at CLI, route, or component edges.

---

## Development

```bash
pnpm dev         # Vite dev server at http://localhost:3000 (hot reload)
pnpm test        # Unit tests (live writes disabled)
pnpm coverage    # Test coverage
pnpm e2e         # Playwright end-to-end tests
pnpm typecheck   # TypeScript type checking via tsgo
pnpm lint        # oxlint
pnpm format      # oxfmt
pnpm check       # format:check + lint + typecheck

# Browser performance profiling
pnpm perf:browser -- --scenario=links,links-toggle --iterations=5
```

---

## License

MIT. See [LICENSE](LICENSE).

---

## Frequently Asked Questions

**Will my account get banned for using this?**

Unlikely, but not impossible. Birdclaw Helium uses the same session cookies your browser uses when you visit Twitter normally. From X's servers, it looks like a browser making standard page requests. It does not use automation signatures, headless browser fingerprints, or bulk scraping patterns. Thousands of people use cookie-based Twitter clients without issue.

The realistic risk is rate-limiting (HTTP 429), not a ban. If you hammer the sync repeatedly in a short window, X will throttle your session temporarily. Birdclaw surfaces this in the UI and you wait it out.

Banning is reserved for accounts that abuse the API, mass-follow/unfollow, spam, or trigger fraud detection. Reading your own timeline and profile pages at a human pace does not meet that bar.

**Does this only work with the Helium browser?**

No. The `bird` transport reads cookies from any Chromium-based browser installed on your system: Chrome, Edge, Brave, Vivaldi, Arc, Helium, and others. Firefox is not supported because it uses a different cookie storage format.

**Why do I have to close my browser to sync?**

Chromium locks its cookie database file while the browser is running. The `bird` CLI reads that file directly. When another process holds the lock, the read fails. Close the browser, sync, reopen -- it takes five seconds. This is a Chromium limitation, not a Birdclaw limitation.

**Is my data safe? Does anything leave my machine?**

Nothing leaves your machine. All data is stored in a single SQLite file on your local disk. Birdclaw has no backend, no analytics, no telemetry, and no accounts. The only outbound connections are the sync requests to Twitter's servers made by the `bird` or `xurl` transport on your behalf.

**Do I need a Twitter Developer account or paid API access?**

No. The `bird` transport uses your browser session, which is free. The optional `xurl` transport uses OAuth2, which requires a developer account, but it is not required for the core functionality including the Circle Timeline, bookmarks, likes, and profile syncs.

**Can AI agents like Claude Code or Antigravity use this?**

Yes. Birdclaw Helium exposes a local REST API at `http://127.0.0.1:3000` and ships a structured agent skill (`birdclaw-archive`) that tells compatible agents how to query it safely. See the [Agent Integration](#agent-integration) section.

---

*Forked from [steipete/birdclaw](https://github.com/steipete/birdclaw). Desktop application, Circle Timeline, SQLite sync persistence, and agent integration are additions unique to this fork.*
