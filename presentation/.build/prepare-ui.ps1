$ErrorActionPreference = 'Stop'
$sourceRoot = 'C:\Users\Denis\Documents\AntiGravity\ClassQuiz'
$targetRoot = 'C:\Users\Denis\.codex\worktrees\ui-cleanup\ClassQuiz'
$sourceFiles = @(
    'frontend/src/lib/footer.svelte',
    'frontend/src/lib/navbar.svelte',
    'frontend/src/routes/+page.svelte',
    'frontend/src/routes/account/register/+page.svelte'
)
$utf8 = [System.Text.UTF8Encoding]::new($false)
foreach ($relative in $sourceFiles) {
    $content = [System.IO.File]::ReadAllText((Join-Path $sourceRoot $relative)).Replace("`r`n", "`n")
    if ($relative -eq 'frontend/src/routes/+page.svelte') {
        $content = $content.Replace('quiz.911bob.dev', 'classquiz.de')
    }
    [System.IO.File]::WriteAllText((Join-Path $targetRoot $relative), $content, $utf8)
}
$newsletter = Join-Path $targetRoot 'frontend/src/lib/landing/newsletter.svelte'
Remove-Item -LiteralPath $newsletter
git -C $targetRoot diff --check
if ($LASTEXITCODE -ne 0) { throw 'Whitespace validation failed' }
git -C $targetRoot diff --stat
