param([string]$SshHost = 'my-vm')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$stagingDir = Join-Path $projectRoot '.deploy'
$archivePath = Join-Path $stagingDir 'source.tar.gz'
New-Item -ItemType Directory -Force -Path $stagingDir | Out-Null
if (-not (Test-Path -LiteralPath (Join-Path $PSScriptRoot '.env'))) {
    throw 'Missing deploy/.env credentials.'
}
& tar -czf $archivePath --exclude=.git --exclude=.deploy --exclude=.env --exclude=node_modules --exclude=.svelte-kit --exclude=build --exclude=backups --exclude='*.log' -C $projectRoot .
if ($LASTEXITCODE -ne 0) { throw 'Creating source archive failed.' }
& ssh $SshHost 'install -d -m 700 /opt/classquiz /opt/classquiz/deploy'
if ($LASTEXITCODE -ne 0) { throw 'Creating remote directory failed.' }
& scp $archivePath "${SshHost}:/opt/classquiz-source.tar.gz"
if ($LASTEXITCODE -ne 0) { throw 'Uploading source failed.' }
& ssh $SshHost 'tar -xzf /opt/classquiz-source.tar.gz -C /opt/classquiz && rm /opt/classquiz-source.tar.gz'
if ($LASTEXITCODE -ne 0) { throw 'Extracting source failed.' }
& scp (Join-Path $PSScriptRoot '.env') "${SshHost}:/opt/classquiz/deploy/.env"
if ($LASTEXITCODE -ne 0) { throw 'Uploading environment failed.' }
& ssh $SshHost 'chmod 700 /opt/classquiz /opt/classquiz/deploy && chmod 600 /opt/classquiz/deploy/.env && cd /opt/classquiz && docker compose --env-file deploy/.env -f deploy/compose.yaml config --quiet'
if ($LASTEXITCODE -ne 0) { throw 'Remote Compose validation failed.' }
Write-Host 'Source and environment uploaded to /opt/classquiz. Build and start explicitly; see deploy/README.md.'
