# -CpuSet pins the build container (for example '8-15' to keep a benchmark's CPUs free).
# Without it the container may use every CPU Docker Desktop offers.
param([switch]$Test, [switch]$CaptchaLab, [string]$CpuSet = $env:RUST_BUILD_CPUSET)
$ErrorActionPreference = 'Stop'
$source = $PSScriptRoot
$output = Join-Path $PSScriptRoot '../stresstest/lab/results'
New-Item -ItemType Directory -Force -Path $output | Out-Null
$cargoArgs = @('build', '--release', '--locked')
if ($Test) { $cargoArgs = @('test', '--locked') }
if ($CaptchaLab) { $cargoArgs += @('--features', 'captcha-lab') }
$dockerArgs = @('run', '--rm', '--memory', '4g')
if ($CpuSet) { $dockerArgs += @('--cpuset-cpus', $CpuSet) }
docker @dockerArgs -v "${source}:/src" -v classquiz-rust-registry:/usr/local/cargo/registry -v classquiz-rust-target:/target -v "${output}:/out" -e CARGO_TARGET_DIR=/target -w /src rust:1.95-bookworm cargo @cargoArgs
if ($LASTEXITCODE -ne 0) { throw 'Rust compilation/test failed' }
if (-not $Test) {
    $binaryName = if ($CaptchaLab) { 'classquiz-realtime-captcha-lab' } else { 'classquiz-realtime' }
    docker run --rm -v classquiz-rust-target:/target:ro -v "${output}:/out" --entrypoint cp rust:1.95-bookworm /target/release/classquiz-realtime "/out/$binaryName"
    if ($LASTEXITCODE -ne 0) { throw 'Copying Linux binary failed' }
}
