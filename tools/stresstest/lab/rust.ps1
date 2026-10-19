param([int[]]$Users = @(1000,10000), [string]$Suffix = (Get-Date -Format 'yyyyMMdd-HHmmss'), [int]$Questions = 10, [int]$Ramp = 120, [string[]]$ExtraArgs = @())
$ErrorActionPreference = 'Stop'
Push-Location (Resolve-Path (Join-Path $PSScriptRoot '../../..'))
try {
    $compose = @('-f','tools/stresstest/lab/compose.yaml','-f','tools/stresstest/lab/compose.rust.yaml')
    foreach ($count in $Users) {
        docker compose @compose up -d --no-deps --force-recreate api | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Rust API start failed' }
        $ready = $false
        for ($attempt=0; $attempt -lt 45; $attempt++) {
            try {
                $state = Invoke-RestMethod http://127.0.0.1:18088/__bench/reset -Method Post -TimeoutSec 2
                if ($state.rust_pid) { $ready=$true; break }
            } catch { Start-Sleep -Seconds 1 }
        }
        if (-not $ready) { throw 'Python-supervised Rust child did not become ready' }
        docker compose @compose exec -T proxy nginx -s reload | Out-Host
        if ($LASTEXITCODE -ne 0) { throw 'Proxy refresh failed' }
        Start-Sleep -Seconds 2
        $label = "rust-$count-$Suffix"
        $options = @('--label',$label,'--users',$count,'--questions',$Questions,'--ramp',$Ramp,'--idle','10','--large-audience','--rust') + $ExtraArgs
        docker compose @compose run --rm runner @options | Out-Host
        if ($LASTEXITCODE -ne 0) { throw "Run $label failed; preserved its report" }
    }
} finally { Pop-Location }
