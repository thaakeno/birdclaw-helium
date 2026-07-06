## Birdclaw Helium v0.8.5

This is the first public release of Birdclaw Helium, a Windows-native fork of [steipete/birdclaw](https://github.com/steipete/birdclaw).

---

### What is Birdclaw Helium?

Birdclaw Helium is a local-first Twitter archive, client, and workspace running entirely on your machine. It stores all data in SQLite, requires no paid Twitter Developer API, and syncs using your existing browser session cookies -- completely free, no subscriptions.

---

### What this release includes (beyond upstream birdclaw)

**Circle Timeline**
Pin any number of Twitter/X profiles into a personal "Circle." Their posts are merged into a single, strictly chronological feed -- no algorithm, no promoted content, no missing posts. Filter instantly by Media, Quotes, Originals, or Replies using local SQLite queries.

**Native Windows Desktop Application**
This release ships a standalone Electron app for Windows. Extract the zip, run Birdclaw.exe. No Node.js, no terminal, no setup required. The desktop app auto-starts the local server and opens the full web UI inside a native window.

**Zero-Cost Live Sync via Browser Cookies**
The bird CLI transport reads your logged-in Twitter session from any Chromium-based browser (Chrome, Edge, Brave, Vivaldi, Arc, Helium, etc.) to sync profile timelines, bookmarks, likes, and mentions -- no API key, no rate-limit invoice.

**1:1 SQLite Persistence for Profile Syncs**
In the original birdclaw, profile page fetches were written to an in-memory cache only. In this fork, every profile sync writes directly to the canonical SQLite database. Your Circle feed and search index stay in sync automatically after every profile refresh.

**Two-Column Desktop Workspace**
The profile analyzer panel floats in the right-hand column of the layout, making use of the empty desktop space. Clicking a profile no longer collapses the navigation sidebar or shifts the timeline card.

**Real-Time Rate-Limit Overlays**
When the bird transport hits an X rate limit (HTTP 429), the UI surfaces a clear warning overlay instead of silently failing or logging to the terminal.

**Automated Release Tooling**
Future releases are published from a single PowerShell command (`tools/release.ps1`) that builds, packages, and uploads to GitHub Releases automatically via the gh CLI.

---

### Installation

1. Download `Birdclaw-Helium-Windows-v0.8.5.zip` below.
2. Extract the zip to any folder.
3. Run `Birdclaw.exe`.
4. The app will start the local server and open in a native window at `http://127.0.0.1:3000`.

**Requirements:** Windows 10/11 x64. No Node.js installation needed for the desktop app.

---

### Browser Compatibility for Live Sync

The bird transport works with any Chromium-based browser installed on your system: Chrome, Edge, Brave, Vivaldi, Arc, Helium, or any Chromium derivative. Firefox is not supported by the bird cookie transport.

---

### Source & Credits

- Fork of [steipete/birdclaw](https://github.com/steipete/birdclaw) -- original architecture, SQLite schema, and Effect sync engine.
- Desktop application, Circle Timeline, SQLite sync persistence, and automated release tooling are additions unique to this fork.
