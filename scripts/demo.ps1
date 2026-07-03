# XDC Intent Framework — One-Command Demo
# Starts middleware + solver, submits a test intent, and confirms fulfillment.

param(
  [string]$Network = "apothem"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

function Stop-NodeProcesses {
  Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
  Start-Sleep -Seconds 3
  $ports = @(3001, 3002)
  foreach ($port in $ports) {
    Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue | ForEach-Object {
      Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
    }
  }
  # Wait until ports are fully released.
  foreach ($port in $ports) {
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt 30) {
      if (-not (Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue)) { break }
      Start-Sleep -Milliseconds 200
    }
  }
  Start-Sleep -Seconds 1
}

function Wait-ForService($url, $timeoutSeconds = 30) {
  $start = Get-Date
  while (((Get-Date) - $start).TotalSeconds -lt $timeoutSeconds) {
    try {
      $res = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 2 -ErrorAction Stop
      if ($res.status -eq "ok" -or $res) { return }
    } catch {}
    Start-Sleep -Milliseconds 500
  }
  throw "Service at $url did not become ready"
}

Write-Host "=== XDC Intent Framework Demo ===" -ForegroundColor Cyan

Stop-NodeProcesses

Write-Host "Building middleware..." -ForegroundColor Yellow
npm run build -w @xdc-intent/middleware | Out-Null

Write-Host "Building solver..." -ForegroundColor Yellow
npm run build -w @xdc-intent/solver | Out-Null

Write-Host "Starting middleware on port 3002..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "$root\packages\middleware" -WindowStyle Hidden
Wait-ForService "http://localhost:3002/health"
Write-Host "Middleware ready" -ForegroundColor Green

Write-Host "Starting solver on port 3001..." -ForegroundColor Yellow
Start-Process -FilePath "node" -ArgumentList "dist/index.js" -WorkingDirectory "$root\packages\solver" -WindowStyle Hidden
Wait-ForService "http://localhost:3001/health"
Write-Host "Solver ready" -ForegroundColor Green

Write-Host "Running auto end-to-end test..." -ForegroundColor Yellow
Set-Location "$root\packages\contracts"
$testOutput = npx hardhat run scripts/e2e-apothem-auto.ts --network $Network 2>&1
Set-Location $root

$intentId = $null
$fulfillmentTx = $null
foreach ($line in $testOutput) {
  Write-Host $line
  if ($line -match "Submitting intent:\s+(0x[a-fA-F0-9]+)") { $intentId = $Matches[1] }
  if ($line -match "Fulfillment submitted:\s+(0x[a-fA-F0-9]+)") { $fulfillmentTx = $Matches[1] }
}

Write-Host ""
Write-Host "=== Demo Results ===" -ForegroundColor Cyan
if ($intentId) {
  Write-Host "Intent ID:      $intentId"
  Write-Host "Intent URL:     https://testnet.xdcscan.com/tx/$intentId"
}
if ($fulfillmentTx) {
  Write-Host "Fulfillment Tx: $fulfillmentTx"
  Write-Host "Fulfillment URL: https://testnet.xdcscan.com/tx/$fulfillmentTx"
}

Write-Host ""
Write-Host "Stopping services..." -ForegroundColor Yellow
Stop-NodeProcesses
Write-Host "Demo complete" -ForegroundColor Green
