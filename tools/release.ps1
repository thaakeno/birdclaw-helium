<#
.SYNOPSIS
    Builds Birdclaw Helium and publishes a versioned GitHub release.

.DESCRIPTION
    This script:
      1. Reads the version from package.json
      2. Runs pnpm build
      3. Builds the Windows Desktop app via install-birdclaw-desktop.ps1 into a temp directory
      4. Zips the result into Birdclaw-Helium-Windows-vX.Y.Z.zip
      5. Creates a GitHub release (tag vX.Y.Z) with the zip as a downloadable asset

    Prerequisites:
      - gh CLI installed and authenticated (gh auth login)
      - pnpm installed
      - Node.js >= 25.8.1

.PARAMETER Tag
    Release tag override. Defaults to "v<version from package.json>".

.PARAMETER Notes
    Release notes. Defaults to a generated summary.

.PARAMETER Draft
    If set, creates the release as a draft (not publicly visible).

.PARAMETER Prerelease
    If set, marks the release as a pre-release.

.EXAMPLE
    # Standard release
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/release.ps1

    # Draft pre-release with custom notes
    powershell -NoProfile -ExecutionPolicy Bypass -File tools/release.ps1 -Draft -Notes "Nightly build"
#>

[CmdletBinding()]
param(
    [string]$Tag         = "",
    [string]$Notes       = "",
    [switch]$Draft,
    [switch]$Prerelease
)

$ErrorActionPreference = 'Stop'
$RepoRoot = Split-Path -Parent $PSScriptRoot

# ── 1. Read version from package.json ─────────────────────────────────────────
$PackageJsonPath = Join-Path $RepoRoot 'package.json'
$PackageJson     = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json
$Version         = $PackageJson.version

if (-not $Tag) { $Tag = "v$Version" }

Write-Host "==> Birdclaw Helium Release: $Tag" -ForegroundColor Cyan

# ── 2. Build the web/server/CLI bundles ───────────────────────────────────────
Write-Host "`n==> Building application..." -ForegroundColor Cyan
Push-Location $RepoRoot
try {
    pnpm run build
    if ($LASTEXITCODE -ne 0) { throw "pnpm build failed" }
} finally {
    Pop-Location
}

# ── 3. Build Windows Desktop app into a temp staging directory ────────────────
# Must be inside %LOCALAPPDATA%\Programs to pass the installer's path safety check
$TempInstallDir = Join-Path $env:LOCALAPPDATA "Programs\birdclaw-helium-release-$Tag"
if (Test-Path $TempInstallDir) { Remove-Item $TempInstallDir -Recurse -Force }

Write-Host "`n==> Packaging Windows Desktop app into $TempInstallDir ..." -ForegroundColor Cyan
$InstallerScript = Join-Path $RepoRoot 'tools\install-birdclaw-desktop.ps1'
& powershell -NoProfile -ExecutionPolicy Bypass -File $InstallerScript `
    -InstallDir $TempInstallDir `
    -NoDesktopShortcut `
    -NoStartMenuShortcut

if ($LASTEXITCODE -ne 0) { throw "Desktop packaging failed" }

# ── 4. Create the zip archive ─────────────────────────────────────────────────
$ZipName = "Birdclaw-Helium-Windows-$Tag.zip"
$ZipPath = Join-Path $RepoRoot $ZipName

Write-Host "`n==> Zipping to $ZipPath ..." -ForegroundColor Cyan
if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
Compress-Archive -Path "$TempInstallDir\*" -DestinationPath $ZipPath -CompressionLevel Optimal

$ZipSizeMB = [math]::Round((Get-Item $ZipPath).Length / 1MB, 1)
Write-Host "    Archive: $ZipName ($ZipSizeMB MB)" -ForegroundColor Green

# ── 5. Publish GitHub release via gh CLI ──────────────────────────────────────
# Write release notes to a UTF-8 file to avoid PowerShell heredoc encoding issues
$NotesFile = Join-Path $env:TEMP "birdclaw-helium-release-notes.md"

# Use the bundled release-notes.md template if no custom notes provided
$BundledNotes = Join-Path $PSScriptRoot 'release-notes.md'
if (-not $Notes -and (Test-Path $BundledNotes)) {
    $Notes = (Get-Content $BundledNotes -Raw -Encoding UTF8) -replace '\$Tag', $Tag -replace '\$ZipName', $ZipName
} elseif (-not $Notes) {
    $Notes = "## Birdclaw Helium $Tag`n`nSee commit history for changes.`n"
}

[System.IO.File]::WriteAllText($NotesFile, $Notes, [System.Text.Encoding]::UTF8)

$GhArgs = @(
    'release', 'create', $Tag,
    $ZipPath,
    '--repo', 'thaakeno/birdclaw-helium',
    '--title', "Birdclaw Helium $Tag",
    '--notes-file', $NotesFile
)
if ($Draft)      { $GhArgs += '--draft' }
if ($Prerelease) { $GhArgs += '--prerelease' }

Write-Host "`n==> Creating GitHub Release $Tag ..." -ForegroundColor Cyan
gh @GhArgs

if ($LASTEXITCODE -ne 0) { throw "gh release create failed" }

# ── 6. Cleanup ────────────────────────────────────────────────────────────────
Remove-Item $TempInstallDir -Recurse -Force
Remove-Item $ZipPath -Force
if (Test-Path $NotesFile) { Remove-Item $NotesFile -Force }

Write-Host "`n✅  Release $Tag published successfully." -ForegroundColor Green
Write-Host "    https://github.com/thaakeno/birdclaw-helium/releases/tag/$Tag"
