const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_APP_URL = "http://127.0.0.1:3000";

function readConfig() {
	const candidates = [
		path.join(__dirname, "config.json"),
		path.join(process.resourcesPath || "", "app", "config.json"),
	].filter(Boolean);

	for (const candidate of candidates) {
		try {
			return JSON.parse(fs.readFileSync(candidate, "utf8").replace(/^\uFEFF/, ""));
		} catch (error) {
			if (error.code !== "ENOENT") {
				console.warn(`Could not read Birdclaw desktop config at ${candidate}: ${error.message}`);
			}
		}
	}

	return {};
}

const desktopConfig = readConfig();
const appIconPath = path.join(__dirname, "birdclaw.ico");

function readAppUrl() {
	const rawUrl = process.env.BIRDCLAW_DESKTOP_DEV_URL || desktopConfig.appUrl || DEFAULT_APP_URL;
	const parsed = new URL(rawUrl);

	if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
		throw new Error("BIRDCLAW_DESKTOP_DEV_URL must be an http(s) URL.");
	}

	return parsed.href;
}

const appUrl = readAppUrl();

if (process.env.BIRDCLAW_DESKTOP_SMOKE === "1") {
	console.log(`Birdclaw desktop shell target: ${appUrl}`);
	process.exit(0);
}

const { app, BrowserWindow, Menu, shell } = require("electron");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
Menu.setApplicationMenu(null);

function getProjectDir() {
	const rawDir = process.env.BIRDCLAW_DESKTOP_PROJECT_DIR || desktopConfig.projectDir;
	return rawDir ? path.resolve(rawDir) : null;
}

function ensureLogDir(projectDir) {
	const logDir = path.join(projectDir, "logs");
	fs.mkdirSync(logDir, { recursive: true });
	return logDir;
}

function startArchiveServer(url) {
	const projectDir = getProjectDir();
	if (!projectDir) {
		return null;
	}

	const parsedUrl = new URL(url);
	const logDir = ensureLogDir(projectDir);
	const env = {
		...process.env,
		BIRDCLAW_BASH_COMMAND: process.env.BIRDCLAW_BASH_COMMAND || desktopConfig.bashCommand || "D:/Programs/Git/bin/bash.exe",
		BIRDCLAW_BIRD_COMMAND:
			process.env.BIRDCLAW_BIRD_COMMAND ||
			desktopConfig.birdCommand ||
			"C:/Users/alier/AppData/Roaming/npm/birdclaw-bird.exe",
		BIRDCLAW_HOME: process.env.BIRDCLAW_HOME || path.join(projectDir, "local-data"),
		BIRDCLAW_PORT: process.env.BIRDCLAW_PORT || String(parsedUrl.port || 3000),
	};

	const out = fs.openSync(path.join(logDir, "birdclaw-desktop-serve.out.log"), "a");
	const err = fs.openSync(path.join(logDir, "birdclaw-desktop-serve.err.log"), "a");
	const child = spawn(process.env.BIRDCLAW_NODE_COMMAND || desktopConfig.nodeCommand || "node", [
		"bin/birdclaw.mjs",
		"serve",
		"--host",
		parsedUrl.hostname,
		"--port",
		String(parsedUrl.port || 3000),
	], {
		cwd: projectDir,
		detached: true,
		env,
		stdio: ["ignore", out, err],
		windowsHide: true,
	});

	child.unref();
	return child;
}

async function waitForApp(url, timeoutMs = 45_000) {
	const startedAt = Date.now();
	let lastError;

	while (Date.now() - startedAt < timeoutMs) {
		try {
			const response = await fetch(url, { method: "GET" });
			if (response.ok) {
				return true;
			}
			lastError = new Error(`HTTP ${response.status}`);
		} catch (error) {
			lastError = error;
		}

		await new Promise((resolve) => setTimeout(resolve, 500));
	}

	throw lastError || new Error("Timed out waiting for Birdclaw.");
}

async function isAppAvailable(url) {
	try {
		const response = await fetch(url, { method: "GET" });
		return response.ok;
	} catch {
		return false;
	}
}

async function ensureArchiveServer(url) {
	if (await isAppAvailable(url)) {
		return null;
	}

	return startArchiveServer(url);
}

function isSameOrigin(url, expectedOrigin) {
	try {
		return new URL(url).origin === expectedOrigin;
	} catch {
		return false;
	}
}

function failureHtml(targetUrl, error) {
	const escapedUrl = targetUrl.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
	const escapedError = String(error?.message || error)
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");

	return `<!doctype html>
<html lang="en">
<head>
	<meta charset="utf-8" />
	<title>Birdclaw Desktop</title>
	<style>
		body {
			align-items: center;
			background: #f6f4ef;
			color: #1e1f24;
			display: flex;
			font: 15px/1.5 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
			justify-content: center;
			margin: 0;
			min-height: 100vh;
		}

		main {
			max-width: 560px;
			padding: 32px;
		}

		code {
			background: #e8e2d7;
			border-radius: 4px;
			padding: 2px 5px;
		}
	</style>
</head>
<body>
	<main>
		<h1>Birdclaw is not responding</h1>
		<p>The desktop shell tried to load <code>${escapedUrl}</code>.</p>
		<p>${escapedError}</p>
	</main>
</body>
</html>`;
}

async function createWindow() {
	const parsedAppUrl = new URL(appUrl);
	const mainWindow = new BrowserWindow({
		autoHideMenuBar: true,
		backgroundColor: "#000000",
		height: 900,
		...(fs.existsSync(appIconPath) ? { icon: appIconPath } : {}),
		minHeight: 640,
		minWidth: 960,
		show: false,
		title: "Birdclaw",
		width: 1280,
		webPreferences: {
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	mainWindow.once("ready-to-show", () => {
		mainWindow.show();
	});

	mainWindow.webContents.setWindowOpenHandler(({ url }) => {
		shell.openExternal(url);
		return { action: "deny" };
	});

	mainWindow.webContents.on("will-navigate", (event, url) => {
		if (!isSameOrigin(url, parsedAppUrl.origin)) {
			event.preventDefault();
			shell.openExternal(url);
		}
	});

	try {
		await ensureArchiveServer(appUrl);
		await waitForApp(appUrl);
		await mainWindow.loadURL(appUrl);
	} catch (error) {
		await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(failureHtml(appUrl, error))}`);
	}

	if (process.env.BIRDCLAW_DESKTOP_OPEN_DEVTOOLS === "1") {
		mainWindow.webContents.openDevTools({ mode: "detach" });
	}
}

app.whenReady().then(createWindow);

app.on("activate", () => {
	if (BrowserWindow.getAllWindows().length === 0) {
		createWindow();
	}
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") {
		app.quit();
	}
});
