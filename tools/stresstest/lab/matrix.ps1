param([switch]$IncludeSlowBaseline)
$ErrorActionPreference = 'Stop'
$compose = Join-Path $PSScriptRoot 'compose.yaml'
$runs = @(
    @{ Label='scoped-1000'; Patches='scoped'; Users=1000; Questions=3 },
    @{ Label='indexed-1000'; Patches='indexed'; Users=1000; Questions=3 },
    @{ Label='scoped-indexed-1000'; Patches='scoped,indexed'; Users=1000; Questions=10 },
    @{ Label='scoped-indexed-300'; Patches='scoped,indexed'; Users=300; Questions=10 },
    @{ Label='scoped-atomic-1000'; Patches='scoped,atomic'; Users=1000; Questions=10 },
    @{ Label='compact-1000'; Patches='scoped,indexed,compact'; Users=1000; Questions=10; Compact=$true }
)
if ($IncludeSlowBaseline) {
    $runs = @(@{ Label='baseline-1000-three'; Patches='baseline'; Users=1000; Questions=3 }) + $runs
}
try {
    foreach ($run in $runs) {
        $env:LAB_PATCHES = $run.Patches
        docker compose -f $compose up -d --no-deps --force-recreate api
        if ($LASTEXITCODE -ne 0) { throw 'API recreation failed' }
        $ready = $false
        for ($attempt=0; $attempt -lt 60; $attempt++) {
            try {
                $response = Invoke-WebRequest 'http://127.0.0.1:18088/__bench/metrics' -TimeoutSec 2
                if ($response.StatusCode -eq 200) { $ready = $true; break }
            } catch {}
            Start-Sleep -Seconds 1
        }
        if (!$ready) { throw 'API did not become ready' }
        $runnerArgs = @('compose','-f',$compose,'run','--rm','--no-deps','runner',
            '--users',"$($run.Users)",'--label',$run.Label,'--questions',"$($run.Questions)",'--ramp','15')
        if ($run.Compact) { $runnerArgs += '--compact' }
        & docker @runnerArgs
        if ($LASTEXITCODE -ne 0) { Write-Warning "Run reported a failure: $($run.Label). Inspect its JSON; continuing the comparison." }
    }
} finally {
    Remove-Item Env:LAB_PATCHES -ErrorAction SilentlyContinue
    docker compose -f $compose up -d --no-deps --force-recreate api
}
