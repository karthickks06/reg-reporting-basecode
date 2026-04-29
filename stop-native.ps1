param([switch]$Quiet)

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    if (-not $Quiet) {
        Write-Host "[stop-native] $Message"
    }
}

$repoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$pidsDir = Join-Path $repoRoot ".local-pids"

if (-not (Test-Path -LiteralPath $pidsDir)) {
    Write-Step "No native PID directory found."
    return
}

foreach ($pidFile in Get-ChildItem -LiteralPath $pidsDir -Filter "*.pid" -ErrorAction SilentlyContinue) {
    $rawPid = (Get-Content -LiteralPath $pidFile.FullName -ErrorAction SilentlyContinue | Select-Object -First 1)
    if (-not $rawPid) {
        Remove-Item -LiteralPath $pidFile.FullName -Force
        continue
    }

    $processId = [int]$rawPid
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    if ($process) {
        Write-Step "Stopping $($pidFile.BaseName) PID $processId."
        Stop-Process -Id $processId -Force
    }
    Remove-Item -LiteralPath $pidFile.FullName -Force
}
