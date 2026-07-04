[CmdletBinding()]
param(
	[string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'Programs\Birdclaw'),
	[switch]$NoDesktopShortcut,
	[switch]$NoStartMenuShortcut
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ElectronDist = Join-Path $RepoRoot 'node_modules\electron\dist'
$ElectronExe = Join-Path $ElectronDist 'electron.exe'

if (-not (Test-Path -LiteralPath $ElectronExe)) {
	throw "Electron is not installed at $ElectronExe. Run pnpm install first."
}

$ProgramsRoot = [System.IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'Programs'))
$ResolvedInstallDir = [System.IO.Path]::GetFullPath($InstallDir)
if (-not $ResolvedInstallDir.StartsWith($ProgramsRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
	throw "Refusing to install outside $ProgramsRoot. Requested: $ResolvedInstallDir"
}

$AppResourcesDir = Join-Path $ResolvedInstallDir 'resources\app'
$DesktopMain = Join-Path $RepoRoot 'desktop\main.cjs'
$IconPath = Join-Path $AppResourcesDir 'birdclaw.ico'
$SourceIcon = Join-Path $RepoRoot 'public\favicon.ico'

if (Test-Path -LiteralPath $ResolvedInstallDir) {
	Remove-Item -LiteralPath $ResolvedInstallDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $ResolvedInstallDir | Out-Null
Copy-Item -Path (Join-Path $ElectronDist '*') -Destination $ResolvedInstallDir -Recurse -Force
Move-Item -LiteralPath (Join-Path $ResolvedInstallDir 'electron.exe') -Destination (Join-Path $ResolvedInstallDir 'Birdclaw.exe') -Force

New-Item -ItemType Directory -Force -Path $AppResourcesDir | Out-Null
Copy-Item -LiteralPath $DesktopMain -Destination (Join-Path $AppResourcesDir 'main.cjs') -Force

function Write-BirdclawIcon {
	param([string]$Path)

	Add-Type -AssemblyName System.Drawing
	$Bitmap = New-Object System.Drawing.Bitmap 256, 256
	$Graphics = [System.Drawing.Graphics]::FromImage($Bitmap)
	$Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
	$Graphics.Clear([System.Drawing.Color]::Transparent)

	$Background = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 29, 155, 240))
	$Graphics.FillEllipse($Background, 12, 12, 232, 232)
	$Font = New-Object System.Drawing.Font 'Segoe UI', 142, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
	$TextBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
	$Format = New-Object System.Drawing.StringFormat
	$Format.Alignment = [System.Drawing.StringAlignment]::Center
	$Format.LineAlignment = [System.Drawing.StringAlignment]::Center
	$Graphics.DrawString('b', $Font, $TextBrush, (New-Object System.Drawing.RectangleF 0, 4, 256, 236), $Format)

	$PngStream = New-Object System.IO.MemoryStream
	$Bitmap.Save($PngStream, [System.Drawing.Imaging.ImageFormat]::Png)
	$PngBytes = $PngStream.ToArray()
	$IconStream = New-Object System.IO.MemoryStream
	$Writer = New-Object System.IO.BinaryWriter $IconStream
	$Writer.Write([UInt16]0)
	$Writer.Write([UInt16]1)
	$Writer.Write([UInt16]1)
	$Writer.Write([byte]0)
	$Writer.Write([byte]0)
	$Writer.Write([byte]0)
	$Writer.Write([byte]0)
	$Writer.Write([UInt16]1)
	$Writer.Write([UInt16]32)
	$Writer.Write([UInt32]$PngBytes.Length)
	$Writer.Write([UInt32]22)
	$Writer.Write($PngBytes)
	[System.IO.File]::WriteAllBytes($Path, $IconStream.ToArray())

	$Writer.Dispose()
	$IconStream.Dispose()
	$PngStream.Dispose()
	$Format.Dispose()
	$TextBrush.Dispose()
	$Font.Dispose()
	$Background.Dispose()
	$Graphics.Dispose()
	$Bitmap.Dispose()
}

if (Test-Path -LiteralPath $SourceIcon) {
	Copy-Item -LiteralPath $SourceIcon -Destination $IconPath -Force
} else {
	Write-BirdclawIcon -Path $IconPath
}

$AppPackage = [ordered]@{
	name = 'birdclaw-desktop'
	version = '0.8.5'
	main = 'main.cjs'
}
$Utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText(
	(Join-Path $AppResourcesDir 'package.json'),
	($AppPackage | ConvertTo-Json -Depth 5),
	$Utf8NoBom
)

$Config = [ordered]@{
	appUrl = 'http://127.0.0.1:3000'
	projectDir = $RepoRoot
	birdCommand = 'C:/Users/alier/AppData/Roaming/npm/birdclaw-bird.exe'
	bashCommand = 'D:/Programs/Git/bin/bash.exe'
}
[System.IO.File]::WriteAllText(
	(Join-Path $AppResourcesDir 'config.json'),
	($Config | ConvertTo-Json -Depth 5),
	$Utf8NoBom
)

$UninstallScript = @"
`$ErrorActionPreference = 'Stop'
`$InstallDir = '$($ResolvedInstallDir.Replace("'", "''"))'
`$DesktopShortcut = Join-Path `$env:USERPROFILE 'Desktop\Birdclaw.lnk'
`$StartShortcut = Join-Path `$env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Birdclaw.lnk'
if (Test-Path -LiteralPath `$DesktopShortcut) { Remove-Item -LiteralPath `$DesktopShortcut -Force }
if (Test-Path -LiteralPath `$StartShortcut) { Remove-Item -LiteralPath `$StartShortcut -Force }
Remove-Item -LiteralPath 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Birdclaw' -Recurse -Force -ErrorAction SilentlyContinue
if (Test-Path -LiteralPath `$InstallDir) { Remove-Item -LiteralPath `$InstallDir -Recurse -Force }
"@
$UninstallPath = Join-Path $ResolvedInstallDir 'Uninstall Birdclaw.ps1'
$UninstallScript | Set-Content -LiteralPath $UninstallPath -Encoding UTF8

function New-BirdclawShortcut {
	param(
		[string]$Path
	)

	$Shell = New-Object -ComObject WScript.Shell
	$Shortcut = $Shell.CreateShortcut($Path)
	$Shortcut.TargetPath = (Join-Path $ResolvedInstallDir 'Birdclaw.exe')
	$Shortcut.WorkingDirectory = $ResolvedInstallDir
	$Shortcut.IconLocation = $IconPath
	$Shortcut.Description = 'Birdclaw'
	$Shortcut.Save()
}

if (-not $NoDesktopShortcut) {
	New-BirdclawShortcut -Path (Join-Path $env:USERPROFILE 'Desktop\Birdclaw.lnk')
}

if (-not $NoStartMenuShortcut) {
	$StartMenuDir = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
	New-Item -ItemType Directory -Force -Path $StartMenuDir | Out-Null
	New-BirdclawShortcut -Path (Join-Path $StartMenuDir 'Birdclaw.lnk')
}

$UninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\Birdclaw'
New-Item -Force -Path $UninstallKey | Out-Null
Set-ItemProperty -LiteralPath $UninstallKey -Name DisplayName -Value 'Birdclaw'
Set-ItemProperty -LiteralPath $UninstallKey -Name DisplayVersion -Value '0.8.5'
Set-ItemProperty -LiteralPath $UninstallKey -Name Publisher -Value 'Birdclaw'
Set-ItemProperty -LiteralPath $UninstallKey -Name InstallLocation -Value $ResolvedInstallDir
Set-ItemProperty -LiteralPath $UninstallKey -Name DisplayIcon -Value $IconPath
Set-ItemProperty -LiteralPath $UninstallKey -Name UninstallString -Value "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$UninstallPath`""
Set-ItemProperty -LiteralPath $UninstallKey -Name NoModify -Type DWord -Value 1
Set-ItemProperty -LiteralPath $UninstallKey -Name NoRepair -Type DWord -Value 1

Write-Host "Installed Birdclaw to $ResolvedInstallDir"
