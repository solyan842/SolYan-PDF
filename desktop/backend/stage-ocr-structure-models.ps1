param(
  [Parameter(Mandatory = $true)]
  [string]$Destination,
  [string]$Manifest = (Join-Path $PSScriptRoot "ocr-structure-models.json")
)

$ErrorActionPreference = "Stop"

$manifestPath = [System.IO.Path]::GetFullPath($Manifest)
if (-not (Test-Path $manifestPath -PathType Leaf)) {
  throw "PP-StructureV3 model manifest not found: $manifestPath"
}
$spec = Get-Content $manifestPath -Raw | ConvertFrom-Json
if ($spec.schema_version -ne 1) { throw "Unsupported model-pack manifest schema: $($spec.schema_version)" }
if ($spec.cache_layout -ne "official_models/<model>") { throw "Unexpected PaddleX cache layout: $($spec.cache_layout)" }
if (-not $spec.models -or $spec.models.Count -ne 10) { throw "Expected exactly 10 PP-StructureV3 extra models" }

$cacheRoot = [System.IO.Path]::GetFullPath($Destination)
$officialModels = Join-Path $cacheRoot "official_models"
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("solyan-ppstructure-models-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $officialModels, $work | Out-Null

$inventoryModels = @()
$archiveTotal = [int64]0
try {
  foreach ($model in $spec.models) {
    $name = [string]$model.name
    if ($name -notmatch '^[A-Za-z0-9_.+-]+$') { throw "Invalid model name in manifest: $name" }
    $url = "$($spec.source_base_url)/${name}_infer.tar"
    $archive = Join-Path $work ("${name}_infer.tar")
    $extractRoot = Join-Path $work ("extract-$name")
    New-Item -ItemType Directory -Force $extractRoot | Out-Null

    Write-Host "Downloading $name from $url"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing

    $actualBytes = [int64](Get-Item $archive).Length
    $expectedBytes = [int64]$model.size_bytes
    if ($actualBytes -ne $expectedBytes) {
      throw "$name size mismatch: expected $expectedBytes, got $actualBytes"
    }
    $actualSha = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    $expectedSha = ([string]$model.sha256).ToLowerInvariant()
    if ($actualSha -ne $expectedSha) {
      throw "$name SHA256 mismatch: expected $expectedSha, got $actualSha"
    }
    $archiveTotal += $actualBytes

    & tar -xf $archive -C $extractRoot
    if ($LASTEXITCODE -ne 0) { throw "tar failed to extract $name" }
    $items = @(Get-ChildItem $extractRoot -Force)
    if ($items.Count -eq 0) { throw "$name archive extracted no files" }
    $payloadRoot = $extractRoot
    if ($items.Count -eq 1 -and $items[0].PSIsContainer) {
      $payloadRoot = $items[0].FullName
    }

    $target = Join-Path $officialModels $name
    Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $target | Out-Null
    Get-ChildItem $payloadRoot -Force | Copy-Item -Destination $target -Recurse -Force

    $payloadFiles = @(Get-ChildItem $target -File -Recurse -Force)
    if ($payloadFiles.Count -eq 0) { throw "$name staged model directory is empty" }
    $payloadBytes = [int64](($payloadFiles | Measure-Object -Property Length -Sum).Sum)
    $inventoryModels += [ordered]@{
      name = $name
      sha256 = $expectedSha
      archive_bytes = $expectedBytes
      staged_files = $payloadFiles.Count
      staged_bytes = $payloadBytes
      url = $url
    }
    Write-Host "Staged ${name}: $($payloadFiles.Count) files / $payloadBytes bytes"
  }

  $expectedTotal = [int64]$spec.archive_total_bytes
  if ($archiveTotal -ne $expectedTotal) {
    throw "Model-pack archive total mismatch: expected $expectedTotal, got $archiveTotal"
  }

  $inventory = [ordered]@{
    schema_version = 1
    pack_id = $spec.pack_id
    paddleocr_version = $spec.paddleocr_version
    paddlex_version = $spec.paddlex_version
    paddlex_commit = $spec.paddlex_commit
    cache_layout = $spec.cache_layout
    archive_total_bytes = $archiveTotal
    models = $inventoryModels
  }
  $inventory | ConvertTo-Json -Depth 8 | Set-Content (Join-Path $cacheRoot "solyan-structure-model-inventory.json") -Encoding utf8
  Write-Host "Staged PP-StructureV3 model pack at $cacheRoot ($archiveTotal verified archive bytes)"
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
