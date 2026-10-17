param(
  [string]$Destination = (Join-Path $PSScriptRoot "../src-tauri/resources/ocr/paddlex-cache")
)

$ErrorActionPreference = "Stop"

$PaddleOcrVersion = "3.7.0"
$PaddleXVersion = "3.7.2"
$PaddleXCommit = "ffb64904d23708863ff5b8da312a5cbd52a7f462"
$BaseUrl = "https://paddle-model-ecology.bj.bcebos.com/paddlex/official_inference_model/paddle3.0.0"
$Models = @(
  @{ Name = "PP-DocLayout_plus-L"; Sha256 = "80fff9c2fb598ca27380a48e733ac47ba022aaf06706ea9c39273ae63d7940dc"; Bytes = 130396160 },
  @{ Name = "PP-DocBlockLayout"; Sha256 = "b31a30c65d289e4a550e46d69edf2d8bbb13263c5331289ab21f9af487205e1f"; Bytes = 129935360 },
  @{ Name = "PP-OCRv5_server_det"; Sha256 = "22a33e0ba6a21425ea4192da03bf4395c9a0c67902bd924b7328fc859073045d"; Bytes = 88340480 },
  @{ Name = "PP-OCRv5_server_rec"; Sha256 = "d99be2ffd348943ab52876179168be4fb5b14f5f0812f2ae4c76d89ec2ea750a"; Bytes = 84869120 },
  @{ Name = "PP-LCNet_x1_0_table_cls"; Sha256 = "d00942b82838dd00b8a04f4db4f5cc0c146d27f4a56eb2fd3986de86e3e844bf"; Bytes = 6860800 },
  @{ Name = "SLANeXt_wired"; Sha256 = "9803e7fb73f895846184ce18208503ca041b57f7d2cac6145bb302c76476f609"; Bytes = 365742080 },
  @{ Name = "SLANet_plus"; Sha256 = "68526c5c6573a8a17cdc14805e026f11c2545e42d89a1317bb58d3e1e4b58318"; Bytes = 7997440 },
  @{ Name = "RT-DETR-L_wired_table_cell_det"; Sha256 = "da4a5ec40f1d86fd00aa6dc739e8e9d18a575b9960c0798be3ec93c47025074d"; Bytes = 129935360 },
  @{ Name = "RT-DETR-L_wireless_table_cell_det"; Sha256 = "6f0a78b0444fb0e50f7762a78c15ca38df6402b814558ef00dbcb1f5fc2a5a3d"; Bytes = 129935360 },
  @{ Name = "PP-FormulaNet_plus-L"; Sha256 = "2328cb22d93c800ddf490f9110ecbaffa70bf1e48f448d858a42c28a89c748f7"; Bytes = 731504640 }
)

$cacheRoot = [System.IO.Path]::GetFullPath($Destination)
$officialModels = Join-Path $cacheRoot "official_models"
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("solyan-paddlex-structure-models-" + [guid]::NewGuid().ToString("N"))
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
    archive_bytes_total = [int64](($Models | Measure-Object -Property Bytes -Sum).Sum)
    models = $inventoryModels
  }
  $inventory | ConvertTo-Json -Depth 6 | Set-Content (Join-Path $cacheRoot "solyan-structure-model-inventory.json") -Encoding utf8

  foreach ($model in $Models) {
    $modelDir = Join-Path $officialModels $model.Name
    if (-not (Test-Path $modelDir -PathType Container)) {
      throw "Missing staged structure model directory: $modelDir"
    }
  }
  Write-Host "Staged PaddleX PP-StructureV3 cache at $cacheRoot"
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
