# Desktop Development

Birdclaw desktop development should use the real local web server and a thin Electron shell. Do not rebuild an installer during normal UI work.

Run the combined dev launcher:

```powershell
pnpm run desktop:dev
```

The launcher:

- starts or reuses the archive server at `http://127.0.0.1:3000`
- opens the same URL in the normal browser
- opens Electron pointed at the same URL
- avoids `BIRDCLAW_LOCAL_WEB`, so demo seed data is not used

For shell-only work, start the server separately and run:

```powershell
$env:BIRDCLAW_DESKTOP_DEV_URL = 'http://127.0.0.1:3000'
pnpm run desktop:shell
```

Use installer builds only for release packaging after the browser and Electron dev shell both show the same archive-backed app.
