param(
  [string]$Destination = (Join-Path $PSScriptRoot "../src-tauri/resources/ocr/paddlex-cache")
)

$ErrorActionPreference = "Stop"

$PaddleOcrVersion = "3.7.0"
$PaddleXVersion = "3.7.2"
$PaddleXCommit = "ffb64904d23708863ff5b8da312a5cbd52a7f462"
$BaseUrl = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0"
$Models = @(
  @{ Name = "PP-LCNet_x1_0_doc_ori"; Sha256 = "282337df5c41f7cdf8dacd5acf71fddfdc10218399f4b318463c17f4eae96c97"; Bytes = 6881280 },
  @{ Name = "UVDoc"; Sha256 = "15d79c6bcbf738b7e132eedff6ed57c7e834c73cbc140a1fff8fd8ab9c2a35b9"; Bytes = 32256000 },
  @{ Name = "PP-LCNet_x1_0_textline_ori"; Sha256 = "6171f69605215a85624d650e9079fa45f7c3eaf944296181bcc5395bf3ddc7f6"; Bytes = 6871040 },
  @{ Name = "PP-OCRv6_medium_det"; Sha256 = "144d0621e059566e5086e228829171591c144c2deb07b2dad4962214fbabfcf7"; Bytes = 62279680 },
  @{ Name = "PP-OCRv6_medium_rec"; Sha256 = "4eecc1c6a4623765042e6fc15446da0da110b7d875b6b72b2d351d2b2dbd4da6"; Bytes = 76851200 }
)

$cacheRoot = [System.IO.Path]::GetFullPath($Destination)
$officialModels = Join-Path $cacheRoot "official_models"
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("solyan-paddlex-models-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force $officialModels, $work | Out-Null

$inventoryModels = @()
try {
  foreach ($model in $Models) {
    $archive = Join-Path $work ("$($model.Name)_infer.tar")
    $extractRoot = Join-Path $work ("extract-$($model.Name)")
    New-Item -ItemType Directory -Force $extractRoot | Out-Null
    $url = "$BaseUrl/$($model.Name)_infer.tar"

    Write-Host "Downloading $($model.Name) from $url"
    Invoke-WebRequest -Uri $url -OutFile $archive -UseBasicParsing

    $actualBytes = (Get-Item $archive).Length
    if ($actualBytes -ne [int64]$model.Bytes) {
      throw "$($model.Name) size mismatch: expected $($model.Bytes), got $actualBytes"
    }
    $actualSha = (Get-FileHash $archive -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualSha -ne $model.Sha256) {
      throw "$($model.Name) SHA256 mismatch: expected $($model.Sha256), got $actualSha"
    }

    & tar -xf $archive -C $extractRoot
    if ($LASTEXITCODE -ne 0) { throw "tar failed to extract $($model.Name)" }

    $items = @(Get-ChildItem $extractRoot -Force)
    if ($items.Count -eq 0) { throw "$($model.Name) archive extracted no files" }
    $payloadRoot = $extractRoot
    if ($items.Count -eq 1 -and $items[0].PSIsContainer) {
      $payloadRoot = $items[0].FullName
    }

    $target = Join-Path $officialModels $model.Name
    Remove-Item $target -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force $target | Out-Null
    Get-ChildItem $payloadRoot -Force | Copy-Item -Destination $target -Recurse -Force

    $payloadFiles = @(Get-ChildItem $target -File -Recurse -Force)
    if ($payloadFiles.Count -eq 0) { throw "$($model.Name) staged model directory is empty" }
    $payloadBytes = ($payloadFiles | Measure-Object -Property Length -Sum).Sum
    $inventoryModels += [ordered]@{
      name = $model.Name
      sha256 = $model.Sha256
      archive_bytes = [int64]$model.Bytes
      staged_files = $payloadFiles.Count
      staged_bytes = [int64]$payloadBytes
      url = $url
    }
    Write-Host "Staged $($model.Name): $($payloadFiles.Count) files / $payloadBytes bytes"
  }

  $inventory = [ordered]@{
    paddleocr_version = $PaddleOcrVersion
    paddlex_version = $PaddleXVersion
    paddlex_commit = $PaddleXCommit
    cache_layout = "official_models/<model>"
    models = $inventoryModels
  }
  $inventory | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $cacheRoot "solyan-model-inventory.json") -Encoding utf8

  foreach ($model in $Models) {
    $modelDir = Join-Path $officialModels $model.Name
    if (-not (Test-Path $modelDir -PathType Container)) {
      throw "Missing staged model directory: $modelDir"
    }
  }
  Write-Host "Staged PaddleX text OCR cache at $cacheRoot"
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
