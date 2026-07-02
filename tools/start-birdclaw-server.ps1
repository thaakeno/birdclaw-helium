$ErrorActionPreference = 'Stop'
Set-Location 'D:\Project Archive\birdclaw'
$env:Path = [System.Environment]::GetEnvironmentVariable('Path','Machine') + ';' + [System.Environment]::GetEnvironmentVariable('Path','User')
$env:BIRDCLAW_HOME = 'D:\Project Archive\birdclaw\local-data'
$env:BIRDCLAW_PORT = '3000'
$env:BIRDCLAW_BIRD_COMMAND = 'C:/Users/alier/AppData/Roaming/npm/birdclaw-bird.exe'
$env:BIRDCLAW_BASH_COMMAND = 'D:/Programs/Git/bin/bash.exe'
node 'D:\Project Archive\birdclaw\bin\birdclaw.mjs' serve 1> 'D:\Project Archive\birdclaw\logs\birdclaw-serve.out.log' 2> 'D:\Project Archive\birdclaw\logs\birdclaw-serve.err.log'
