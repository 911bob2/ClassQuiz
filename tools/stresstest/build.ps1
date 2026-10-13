# SPDX-License-Identifier: MPL-2.0
$ErrorActionPreference = 'Stop'
$taskOldGoos = $env:GOOS
$taskOldGoarch = $env:GOARCH
$taskOldCgo = $env:CGO_ENABLED
Push-Location $PSScriptRoot
try {
    New-Item -ItemType Directory -Force -Path (Join-Path $PSScriptRoot 'bin') | Out-Null
    $env:CGO_ENABLED = '0'
    $env:GOARCH = 'amd64'
    $env:GOOS = 'windows'
    $taskWindowsPath = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../stresstest.exe'))
    go build -trimpath -ldflags '-s -w' -o $taskWindowsPath .
    if ($LASTEXITCODE -ne 0) { throw 'Windows build failed' }
    $env:GOOS = 'linux'
    $taskLinuxPath = Join-Path $PSScriptRoot 'bin/stresstest-linux-amd64'
    go build -trimpath -ldflags '-s -w' -o $taskLinuxPath .
    if ($LASTEXITCODE -ne 0) { throw 'Linux build failed' }
    Write-Output "Windows: $taskWindowsPath"
    Write-Output "Linux:   $taskLinuxPath"
}
finally {
    $env:GOOS = $taskOldGoos
    $env:GOARCH = $taskOldGoarch
    $env:CGO_ENABLED = $taskOldCgo
    Pop-Location
}
