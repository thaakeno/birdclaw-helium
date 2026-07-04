[CmdletBinding()]
param(
	[string]$Url = 'http://127.0.0.1:3000',
	[int]$TimeoutSeconds = 45,
	[switch]$NoBrowser
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $RepoRoot

$machinePath = [System.Environment]::GetEnvironmentVariable('Path', 'Machine')
$userPath = [System.Environment]::GetEnvironmentVariable('Path', 'User')
$env:Path = @($machinePath, $userPath, $env:Path) -ne '' -join ';'

$ParsedUrl = [Uri]$Url
$ServerHost = $ParsedUrl.Host
$ServerPort = if ($ParsedUrl.Port -gt 0) { $ParsedUrl.Port } elseif ($ParsedUrl.Scheme -eq 'https') { 443 } else { 80 }

$env:BIRDCLAW_HOME = Join-Path $RepoRoot 'local-data'
$env:BIRDCLAW_PORT = [string]$ServerPort
$env:BIRDCLAW_BIRD_COMMAND = 'C:/Users/alier/AppData/Roaming/npm/birdclaw-bird.exe'
$env:BIRDCLAW_BASH_COMMAND = 'D:/Programs/Git/bin/bash.exe'

function Test-BirdclawServer {
	param([string]$BaseUrl)

	try {
		Invoke-RestMethod -Uri "$BaseUrl/api/settings-ai" -TimeoutSec 2 | Out-Null
		return $true
	}
	catch {
		return $false
	}
}

if (-not (Test-BirdclawServer -BaseUrl $Url)) {
	Write-Host "Starting Birdclaw archive server at $Url"
	$serverProcess = Start-Process `
		-FilePath 'node' `
		-ArgumentList @(
			'bin\birdclaw.mjs',
			'serve',
			'--host',
			$ServerHost,
			'--port',
			[string]$ServerPort
		) `
		-WorkingDirectory $RepoRoot `
		-RedirectStandardOutput (Join-Path $RepoRoot 'logs\birdclaw-serve.out.log') `
		-RedirectStandardError (Join-Path $RepoRoot 'logs\birdclaw-serve.err.log') `
		-WindowStyle Hidden `
		-PassThru

	$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
	while ((Get-Date) -lt $deadline) {
		if (Test-BirdclawServer -BaseUrl $Url) {
			break
		}

		if ($serverProcess.HasExited) {
			throw "Birdclaw archive server exited before it became ready. Check logs/birdclaw-serve.err.log."
		}

		Start-Sleep -Milliseconds 500
	}
}

if (-not (Test-BirdclawServer -BaseUrl $Url)) {
	throw "Birdclaw archive server did not become ready at $Url. Check logs/birdclaw-serve.err.log."
}

if (-not $NoBrowser) {
	Start-Process $Url
}

$env:BIRDCLAW_DESKTOP_DEV_URL = $Url
pnpm exec electron desktop/main.cjs
exit $LASTEXITCODE
