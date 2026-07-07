#Requires -Version 5.1
# XDC Intent Framework — Full E2E Demo Automation (Apothem)
# Starts middleware + solver-a + solver-b + bridge keeper, runs same-chain and
# cross-chain E2E scripts, and prints a pass/fail summary.

param(
    [string]$Network = "apothem",
    [int]$DestChainId = 0,
    [int]$HealthTimeoutSeconds = 60,
    [int]$BridgeKeeperLogTimeoutSeconds = 60,
    [int]$PortReleaseTimeoutSeconds = 30
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$logDir = Join-Path $root "logs"

if ($DestChainId -eq 0) {
    $DestChainId = if ($env:DEST_CHAIN_ID) { [int]$env:DEST_CHAIN_ID } else { 99999 }
}

$services = @(
    @{ Name = "middleware"; Port = 3002; HealthUrl = "http://localhost:3002/health"; HealthyStatus = "ok" },
    @{ Name = "solver-a";   Port = 3001; HealthUrl = "http://localhost:3001/health"; HealthyStatus = "healthy" },
    @{ Name = "solver-b";   Port = 3003; HealthUrl = "http://localhost:3003/health"; HealthyStatus = "healthy" }
)

$processes = @()
$summary = @{
    SameChain = @{ Status = "SKIPPED"; IntentId = $null; SubmittedTx = $null; Winner = $null; PaymentTx = $null }
    CrossChain = @{ Status = "SKIPPED"; IntentId = $null; SubmittedTx = $null; Winner = $null; PaymentTx = $null; DestChainId = $DestChainId }
    Error = $null
}

function Ensure-LogDir {
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
}

function Stop-PortProcesses {
    foreach ($svc in $services) {
        Get-NetTCPConnection -LocalPort $svc.Port -ErrorAction SilentlyContinue | ForEach-Object {
            Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue
        }
    }
}

function Stop-StartedProcesses {
    Write-Host "`nStopping background services..." -ForegroundColor Yellow
    foreach ($proc in $processes) {
        if ($proc -and -not $proc.HasExited) {
function Has-SuccessIndicator($output) {
    foreach ($line in $output) {
        if ($line -match "Fulfilled by:" -or $line -match "Cross-chain fulfilled by:") { return $true }
    }
    return $false
}

try {
                taskkill /T /F /PID $proc.Id 2>&1 | Out-Null
            } catch {
                Write-Warning "Failed to stop process PID $($proc.Id): $_"
            }
        }
    }
    $script:processes = @()

    foreach ($svc in $services) {
        $start = Get-Date
        while (((Get-Date) - $start).TotalSeconds -lt $PortReleaseTimeoutSeconds) {
            if (-not (Get-NetTCPConnection -LocalPort $svc.Port -ErrorAction SilentlyContinue)) { break }
            Start-Sleep -Milliseconds 200
        }
    }
}

function Wait-ForHealth($url, $expectedStatus, $timeoutSeconds) {
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $timeoutSeconds) {
        try {
            $res = Invoke-RestMethod -Uri $url -Method GET -TimeoutSec 2 -ErrorAction Stop
            if ($res.status -eq $expectedStatus) { return $res }
        } catch {}
        Start-Sleep -Milliseconds 500
    }
    throw "Service at $url did not become '$expectedStatus' within ${timeoutSeconds}s"
}

function Wait-ForLogMessage($logPath, $pattern, $timeoutSeconds) {
    $start = Get-Date
    while (((Get-Date) - $start).TotalSeconds -lt $timeoutSeconds) {
        if (Test-Path $logPath) {
            $content = Get-Content $logPath -Raw -ErrorAction SilentlyContinue
            if ($content -match $pattern) { return }
        }
        Start-Sleep -Milliseconds 500
    }
    throw "Did not see expected log message in $logPath within ${timeoutSeconds}s"
}

function Run-E2E($name, $scriptPath, $extraEnv) {
    Write-Host "`nRunning $name..." -ForegroundColor Yellow
    Push-Location (Join-Path $root "packages\contracts")
    try {
        foreach ($kv in $extraEnv.GetEnumerator()) {
            Set-Item -Path "env:$($kv.Key)" -Value $kv.Value
        }
        $logOut = Join-Path $logDir "$name.log"
        $logErr = Join-Path $logDir "$name.err"
        $proc = Start-Process -FilePath "cmd.exe" `
            -ArgumentList "/c", "npx hardhat run `"$scriptPath`" --network $Network" `
            -WorkingDirectory (Join-Path $root "packages\contracts") `
            -RedirectStandardOutput $logOut `
            -RedirectStandardError $logErr `
            -PassThru -WindowStyle Hidden -Wait
        $output = @()
        if (Test-Path $logOut) { $output += Get-Content $logOut }
        if (Test-Path $logErr) { $output += Get-Content $logErr }
        $exitCode = $proc.ExitCode
    } finally {
        Pop-Location
    }
    foreach ($line in $output) { Write-Host $line }
    return @{ Output = $output; ExitCode = $exitCode }
}

function Parse-E2EOutput($output, $result) {
    foreach ($line in $output) {
        if ($line -match "Intent ID:\s+(0x[a-fA-F0-9]+)") { $result.IntentId = $Matches[1] }
        if ($line -match "Submitted:\s+(0x[a-fA-F0-9]+)") { $result.SubmittedTx = $Matches[1] }
        if ($line -match "(?:Cross-chain\s+)?[Ff]ulfilled by:\s+(0x[a-fA-F0-9]+)") { $result.Winner = $Matches[1] }
        if ($line -match "Payment tx hash:\s+(0x[a-fA-F0-9]+)") { $result.PaymentTx = $Matches[1] }
    }
}

function Has-SuccessIndicator($output) {
    foreach ($line in $output) {
        if ($line -match "Fulfilled by:" -or $line -match "Cross-chain fulfilled by:") { return $true }
    }
    return $false
}

try {
    Ensure-LogDir

    Write-Host "=== XDC Intent E2E Demo (Apothem) ===" -ForegroundColor Cyan
    Write-Host "Cross-chain destination chain: $DestChainId"
    Write-Host "Logs: $logDir"

    Stop-PortProcesses
    Stop-StartedProcesses

    # Middleware
    Write-Host "`nStarting middleware on port 3002..." -ForegroundColor Yellow
    $middlewareProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm run dev -w @xdc-intent/middleware" `
        -WorkingDirectory $root `
        -RedirectStandardOutput (Join-Path $logDir "middleware.log") `
        -RedirectStandardError  (Join-Path $logDir "middleware.err") `
        -PassThru -WindowStyle Hidden
    $processes += $middlewareProc

    Wait-ForHealth $services[0].HealthUrl $services[0].HealthyStatus $HealthTimeoutSeconds
    Write-Host "Middleware ready" -ForegroundColor Green

    # Solver A
    Write-Host "Starting solver-a on port 3001..." -ForegroundColor Yellow
    $solverAProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm run dev:a -w @xdc-intent/solver" `
        -WorkingDirectory $root `
        -RedirectStandardOutput (Join-Path $logDir "solver-a.log") `
        -RedirectStandardError  (Join-Path $logDir "solver-a.err") `
        -PassThru -WindowStyle Hidden
    $processes += $solverAProc

    # Solver B
    Write-Host "Starting solver-b on port 3003..." -ForegroundColor Yellow
    $solverBProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npm run dev:b -w @xdc-intent/solver" `
        -WorkingDirectory $root `
        -RedirectStandardOutput (Join-Path $logDir "solver-b.log") `
        -RedirectStandardError  (Join-Path $logDir "solver-b.err") `
        -PassThru -WindowStyle Hidden
    $processes += $solverBProc

    Wait-ForHealth $services[1].HealthUrl $services[1].HealthyStatus $HealthTimeoutSeconds
    Write-Host "Solver-a ready" -ForegroundColor Green

    Wait-ForHealth $services[2].HealthUrl $services[2].HealthyStatus $HealthTimeoutSeconds
    Write-Host "Solver-b ready" -ForegroundColor Green

    # Bridge keeper
    Write-Host "Starting bridge keeper..." -ForegroundColor Yellow
    $env:MOCK_BRIDGE_ADDRESS = "0xB494122Fb840D928d0f0F98E69985a85E9EBC139"
    $bridgeLog = Join-Path $logDir "bridge-keeper.log"
    $bridgeErr = Join-Path $logDir "bridge-keeper.err"
    $bridgeKeeperProc = Start-Process -FilePath "cmd.exe" `
        -ArgumentList "/c", "npx hardhat run scripts/bridge-keeper.ts --network $Network" `
        -WorkingDirectory (Join-Path $root "packages\contracts") `
        -RedirectStandardOutput $bridgeLog `
        -RedirectStandardError  $bridgeErr `
        -PassThru -WindowStyle Hidden
    $processes += $bridgeKeeperProc

    Wait-ForLogMessage $bridgeLog "Bridge keeper running" $BridgeKeeperLogTimeoutSeconds
    Write-Host "Bridge keeper ready" -ForegroundColor Green

    # Same-chain E2E
    $sameResult = Run-E2E "same-chain E2E" "scripts/e2e-quote-competition.ts" @{}
    Parse-E2EOutput $sameResult.Output $summary.SameChain
    $summary.SameChain.Status = if ($sameResult.ExitCode -eq 0 -or (Has-SuccessIndicator $sameResult.Output)) { "PASS" } else { "FAIL" }

    # Cross-chain E2E
    $crossResult = Run-E2E "cross-chain E2E" "scripts/e2e-cross-chain.ts" @{ DEST_CHAIN_ID = "$DestChainId" }
    Parse-E2EOutput $crossResult.Output $summary.CrossChain
    $summary.CrossChain.Status = if ($crossResult.ExitCode -eq 0 -or (Has-SuccessIndicator $crossResult.Output)) { "PASS" } else { "FAIL" }

} catch {
    Write-Host "`nERROR: $_" -ForegroundColor Red
    $summary.Error = $_.Exception.Message
} finally {
    Stop-StartedProcesses

    Write-Host "`n=== E2E Demo Summary ===" -ForegroundColor Cyan
    Write-Host "Same-chain E2E:  $($summary.SameChain.Status)"
    if ($summary.SameChain.IntentId)     { Write-Host "  Intent ID:     $($summary.SameChain.IntentId)" }
    if ($summary.SameChain.SubmittedTx)  { Write-Host "  Submitted Tx:  $($summary.SameChain.SubmittedTx)" }
    if ($summary.SameChain.Winner)       { Write-Host "  Winner:        $($summary.SameChain.Winner)" }
    if ($summary.SameChain.PaymentTx)    { Write-Host "  Payment Tx:    $($summary.SameChain.PaymentTx)" }

    Write-Host "`nCross-chain E2E: $($summary.CrossChain.Status) (dest chain $($summary.CrossChain.DestChainId))"
    if ($summary.CrossChain.IntentId)    { Write-Host "  Intent ID:     $($summary.CrossChain.IntentId)" }
    if ($summary.CrossChain.SubmittedTx) { Write-Host "  Submitted Tx:  $($summary.CrossChain.SubmittedTx)" }
    if ($summary.CrossChain.Winner)      { Write-Host "  Winner:        $($summary.CrossChain.Winner)" }
    if ($summary.CrossChain.PaymentTx)   { Write-Host "  Payment Tx:    $($summary.CrossChain.PaymentTx)" }

    if ($summary.Error) { Write-Host "`nError: $($summary.Error)" -ForegroundColor Red }

    $overall = if ($summary.SameChain.Status -eq "PASS" -and $summary.CrossChain.Status -eq "PASS") { "PASS" } else { "FAIL" }
    Write-Host "`nOverall: $overall" -ForegroundColor $(if ($overall -eq "PASS") { "Green" } else { "Red" })

    exit $(if ($overall -eq "PASS") { 0 } else { 1 })
}
