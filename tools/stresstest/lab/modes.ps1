param([string[]]$Runs = @('basic:300','basic:500','basic:750','basic:1000','large:1000','large:1500','large:2000','large:3000'), [string]$Suffix = (Get-Date -Format 'yyyyMMdd-HHmmss'), [int]$Questions = 10, [string[]]$ExtraArgs = @())
$ErrorActionPreference = 'Stop'
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '../../..'))
try {
    $env:LAB_PATCHES = 'baseline'
    foreach ($run in $Runs) {
        $mode, $users = $run.Split(':')
        docker compose -f tools/stresstest/lab/compose.yaml up -d --force-recreate api | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'API start failed' }
        $ready = $false
        for ($attempt = 0; $attempt -lt 30; $attempt++) {
            try {
                $null = Invoke-RestMethod http://127.0.0.1:18088/__bench/metrics -TimeoutSec 2
                $ready = $true
                break
            } catch { Start-Sleep -Seconds 1 }
        }
        if (-not $ready) { throw 'API not ready' }
        # Recreating the API briefly removes its Docker DNS record. Refresh all
        # nginx workers once the replacement is ready, before admitting players.
        docker compose -f tools/stresstest/lab/compose.yaml exec -T proxy nginx -s reload | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Proxy refresh failed' }
        Start-Sleep -Seconds 2
        $options = @('--label', "$mode-$users-$Suffix", '--users', $users, '--questions', $Questions, '--ramp', '15')
        if ($mode -eq 'large') { $options += '--large-audience' }
        $options += $ExtraArgs
        docker compose -f tools/stresstest/lab/compose.yaml run --rm runner @options | Out-Host
        if ($LASTEXITCODE -ne 0) { Write-Warning "Run $run failed; preserved its report" }
    }
} finally {
    Remove-Item Env:LAB_PATCHES -ErrorAction SilentlyContinue
    Pop-Location
}
