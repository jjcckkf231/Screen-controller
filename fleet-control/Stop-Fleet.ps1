$ErrorActionPreference = 'Stop'
$fleetRoot = $PSScriptRoot
$fleetData = Join-Path $fleetRoot '.data'
if (Test-Path -LiteralPath (Join-Path $fleetRoot '.env')) {
  foreach ($fleetLine in Get-Content -LiteralPath (Join-Path $fleetRoot '.env')) {
    if ($fleetLine -match '^FLEET_DATA_DIR=(.+)$') { $fleetValue = $Matches[1].Trim('"'); $fleetData = if ([IO.Path]::IsPathRooted($fleetValue)) { [IO.Path]::GetFullPath($fleetValue) } else { [IO.Path]::GetFullPath((Join-Path $fleetRoot $fleetValue)) } }
  }
}
$fleetRuntime = Join-Path $fleetData 'runtime'
foreach ($fleetKind in @('worker','server')) {
  $fleetRecord = Join-Path $fleetRuntime "$fleetKind.json"
  if (-not (Test-Path -LiteralPath $fleetRecord)) { continue }
  $fleetSaved = Get-Content -LiteralPath $fleetRecord -Raw | ConvertFrom-Json
  if ($fleetSaved.root -ne $fleetRoot) { throw 'Process record belongs to another workspace.' }
  $fleetProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($fleetSaved.pid)" -ErrorAction SilentlyContinue
  $fleetScript = Join-Path $fleetRoot "$fleetKind/main.ts"
  if ($fleetProcess -and $fleetProcess.CommandLine.Contains($fleetScript)) {
    if ($fleetKind -eq 'server') {
      $fleetToken = $env:FLEET_WORKER_TOKEN
      if (-not $fleetToken) { $fleetToken = (Get-Content -LiteralPath (Join-Path $fleetData 'secrets/worker-token') -Raw).Trim() }
      try { Invoke-RestMethod -Method Post -Uri "http://127.0.0.1:$($fleetSaved.port)/api/internal/shutdown" -Headers @{ Authorization = "Bearer $fleetToken" } -ContentType 'application/json' -Body '{}' -TimeoutSec 5 | Out-Null } catch { throw 'Graceful shutdown request failed. Check the server log before making a backup.' }
      for ($fleetAttempt = 0; $fleetAttempt -lt 20; $fleetAttempt++) { if (-not (Get-Process -Id $fleetSaved.pid -ErrorAction SilentlyContinue)) { break }; Start-Sleep -Milliseconds 250 }
      if (Get-Process -Id $fleetSaved.pid -ErrorAction SilentlyContinue) { throw 'Server is still shutting down. Do not back up until it has stopped.' }
    } else { Stop-Process -Id $fleetSaved.pid }
  }
}
Write-Output 'Fleet Studio stop requested. Saved data and uploads were preserved.'
