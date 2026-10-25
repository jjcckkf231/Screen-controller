param([switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
$fleetRoot = $PSScriptRoot
$fleetNode = (Get-Command node -ErrorAction Stop).Source
$fleetPort = 4178
$fleetData = Join-Path $fleetRoot '.data'
if (Test-Path -LiteralPath (Join-Path $fleetRoot '.env')) {
  foreach ($fleetLine in Get-Content -LiteralPath (Join-Path $fleetRoot '.env')) {
    if ($fleetLine -match '^PORT=(\d+)$') { $fleetPort = [int]$Matches[1] }
    if ($fleetLine -match '^FLEET_DATA_DIR=(.+)$') { $fleetValue = $Matches[1].Trim('"'); $fleetData = if ([IO.Path]::IsPathRooted($fleetValue)) { [IO.Path]::GetFullPath($fleetValue) } else { [IO.Path]::GetFullPath((Join-Path $fleetRoot $fleetValue)) } }
  }
}
$fleetUrl = "http://127.0.0.1:$fleetPort"
Push-Location -LiteralPath $fleetRoot
try {
  if (-not (Test-Path -LiteralPath (Join-Path $fleetRoot 'node_modules'))) { & npm.cmd ci --no-fund; if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' } }
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) { throw 'Build failed. No application was started.' }
  $fleetRuntime = Join-Path $fleetData 'runtime'
  New-Item -ItemType Directory -Path $fleetRuntime -Force | Out-Null
  $fleetHealth = $null
  try { $fleetHealth = Invoke-RestMethod -Uri "$fleetUrl/api/health" -TimeoutSec 2 } catch {}
  if ($fleetHealth -and $fleetHealth.service -ne 'fleet-control') { throw 'This port is used by another application.' }
  if (-not $fleetHealth) {
    $fleetServer = Start-Process -FilePath $fleetNode -ArgumentList @('--import','tsx',('"' + (Join-Path $fleetRoot 'server/main.ts') + '"')) -WorkingDirectory $fleetRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fleetRuntime 'server.log') -RedirectStandardError (Join-Path $fleetRuntime 'server-error.log')
    @{ pid = $fleetServer.Id; root = $fleetRoot; port = $fleetPort } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $fleetRuntime 'server.json')
    for ($fleetAttempt = 0; $fleetAttempt -lt 30; $fleetAttempt++) {
      try { $fleetHealth = Invoke-RestMethod -Uri "$fleetUrl/api/health" -TimeoutSec 2; break } catch { Start-Sleep -Milliseconds 500 }
    }
    if (-not $fleetHealth) { throw "Server did not become ready. Inspect $fleetRuntime/server-error.log" }
  }
  $fleetWorkerRecord = Join-Path $fleetRuntime 'worker.json'
  $fleetWorkerRunning = $false
  if (Test-Path -LiteralPath $fleetWorkerRecord) {
    $fleetSaved = Get-Content -LiteralPath $fleetWorkerRecord -Raw | ConvertFrom-Json
    $fleetProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($fleetSaved.pid)" -ErrorAction SilentlyContinue
    $fleetWorkerRunning = $fleetProcess -and $fleetProcess.CommandLine.Contains((Join-Path $fleetRoot 'worker/main.ts'))
  }
  if (-not $fleetWorkerRunning) {
    $env:FLEET_API_URL = $fleetUrl
    $fleetWorker = Start-Process -FilePath $fleetNode -ArgumentList @('--import','tsx',('"' + (Join-Path $fleetRoot 'worker/main.ts') + '"')) -WorkingDirectory $fleetRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $fleetRuntime 'worker.log') -RedirectStandardError (Join-Path $fleetRuntime 'worker-error.log')
    @{ pid = $fleetWorker.Id; root = $fleetRoot; port = $fleetPort } | ConvertTo-Json | Set-Content -LiteralPath $fleetWorkerRecord
  }
  Write-Output "Fleet Studio is ready at $fleetUrl"
  Write-Output 'Create your owner account on first use. No real fleet is connected automatically.'
  if (-not $NoBrowser) { Start-Process $fleetUrl }
} finally { Pop-Location }
