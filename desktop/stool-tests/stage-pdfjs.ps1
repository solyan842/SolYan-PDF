$ErrorActionPreference = 'Stop'
$version = '6.4.299'
$expectedIntegrity = 'AVl138zALtfaAPvADulE0PZThbYzCBS79nL4pOSL/6Sm/4AH5A21BD9VHt97OlCuzJuCpmeZtAtkinisF4Vb1g=='
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$build = [IO.Path]::GetFullPath((Join-Path $repo 'desktop/ui/.pdfjs-build'))
$vendor = [IO.Path]::GetFullPath((Join-Path $repo 'desktop/ui/vendor/pdfjs'))
foreach ($target in @($build, $vendor)) {
  if (-not $target.StartsWith($repo + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to write outside the repository: $target"
  }
}
New-Item -ItemType Directory -Force -Path $build | Out-Null
Push-Location $repo
try {
  $archiveName = "pdfjs-dist-$version.tgz"
  if (-not (Test-Path -LiteralPath (Join-Path $build $archiveName) -PathType Leaf)) {
    $npmOutput = & npm.cmd pack "pdfjs-dist@$version" --pack-destination $build --silent 2>&1
    if ($LASTEXITCODE -ne 0) { throw "npm pack failed: $($npmOutput -join [Environment]::NewLine)" }
    if (-not (Test-Path -LiteralPath (Join-Path $build $archiveName) -PathType Leaf)) { throw "npm pack did not create $archiveName" }
  }
} finally { Pop-Location }
$archive = Join-Path $build $archiveName
if (-not (Test-Path -LiteralPath $archive -PathType Leaf)) { throw "Pinned PDF.js archive not found: $archive" }
$sha512 = [Security.Cryptography.SHA512]::Create()
try { $integrity = [Convert]::ToBase64String($sha512.ComputeHash([IO.File]::ReadAllBytes($archive))) }
finally { $sha512.Dispose() }
if ($integrity -cne $expectedIntegrity) { throw 'Pinned PDF.js package integrity mismatch' }
$extract = Join-Path $build 'extract'
New-Item -ItemType Directory -Force -Path $extract | Out-Null
tar -xzf $archive -C $extract
if ($LASTEXITCODE -ne 0) { throw "tar extraction failed with exit code $LASTEXITCODE" }
$package = Join-Path $extract 'package'
foreach ($required in @('build/pdf.mjs', 'build/pdf.worker.mjs', 'cmaps', 'standard_fonts', 'wasm', 'LICENSE')) {
  if (-not (Test-Path -LiteralPath (Join-Path $package $required))) { throw "PDF.js package is missing $required" }
}
Remove-Item -LiteralPath $vendor -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $vendor | Out-Null
Copy-Item (Join-Path $package 'build/pdf.mjs') (Join-Path $vendor 'pdf.mjs')
Copy-Item (Join-Path $package 'build/pdf.worker.mjs') (Join-Path $vendor 'pdf.worker.mjs')
Copy-Item (Join-Path $package 'cmaps') (Join-Path $vendor 'cmaps') -Recurse
Copy-Item (Join-Path $package 'standard_fonts') (Join-Path $vendor 'standard_fonts') -Recurse
Copy-Item (Join-Path $package 'wasm') (Join-Path $vendor 'wasm') -Recurse
Copy-Item (Join-Path $package 'LICENSE') (Join-Path $vendor 'LICENSE-PDFJS.txt')
"pdfjs-dist $version sha512-$integrity" | Set-Content -LiteralPath (Join-Path $vendor 'VERSION.txt') -Encoding utf8
foreach ($required in @('pdf.mjs', 'pdf.worker.mjs', 'cmaps', 'standard_fonts', 'wasm', 'LICENSE-PDFJS.txt', 'VERSION.txt')) {
  if (-not (Test-Path -LiteralPath (Join-Path $vendor $required))) { throw "PDF.js asset staging failed: $required" }
}
Remove-Item -LiteralPath $build -Recurse -Force
Write-Output "PDF.js $version staged and integrity verified: $integrity"
