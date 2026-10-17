param(
  [string]$Destination = (Join-Path $PSScriptRoot "../src-tauri/resources/ocr/tesseract")
)

$ErrorActionPreference = "Stop"

$TesseractVersion = "5.5.3"
$TesseractBuild = "5.5.3.20260724"
$TesseractUrl = "https://github.com/tesseract-ocr/tesseract/releases/download/5.5.3/tesseract-ocr-w64-setup-5.5.3.20260724.exe"
$TesseractSha256 = "bee9e3434bd94fd65387d9be28cd467a41f61b1275383b55b0f59a1331270ae4"
$TessdataCommit = "65727574dfcd264acbb0c3e07860e4e9e9b22185"
$Tessdata = @(
  @{ Name = "vie.traineddata"; Blob = "e54a5912fb634c581c4a45ae9f37cbc021ec7140" },
  @{ Name = "eng.traineddata"; Blob = "bbef4675053b5b468cdb477053e28b1c698ba08e" },
  @{ Name = "osd.traineddata"; Blob = "527457ca8f8fe1fda7c2f88bce3c0e4be12be9d0" }
)

function Get-GitBlobSha1([string]$Path) {
  $bytes = [System.IO.File]::ReadAllBytes($Path)
  $header = [System.Text.Encoding]::ASCII.GetBytes("blob $($bytes.Length)`0")
  $stream = New-Object System.IO.MemoryStream
  try {
    $stream.Write($header, 0, $header.Length)
    $stream.Write($bytes, 0, $bytes.Length)
    $stream.Position = 0
    $sha1 = [System.Security.Cryptography.SHA1]::Create()
    try {
      return ([System.BitConverter]::ToString($sha1.ComputeHash($stream))).Replace("-", "").ToLowerInvariant()
    } finally {
      $sha1.Dispose()
    }
  } finally {
    $stream.Dispose()
  }
}

$resolvedDestination = [System.IO.Path]::GetFullPath($Destination)
$work = Join-Path ([System.IO.Path]::GetTempPath()) ("solyan-tesseract-" + [guid]::NewGuid().ToString("N"))
$installer = Join-Path $work "tesseract-installer.exe"
$extract = Join-Path $work "extract"
New-Item -ItemType Directory -Force $work, $extract | Out-Null

try {
  Invoke-WebRequest -Uri $TesseractUrl -OutFile $installer -UseBasicParsing
  $actual = (Get-FileHash $installer -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($actual -ne $TesseractSha256) {
    throw "Tesseract SHA256 mismatch: expected $TesseractSha256, got $actual"
  }

  $sevenZip = (Get-Command 7z.exe -ErrorAction SilentlyContinue).Source
  if (-not $sevenZip) { throw "7z.exe is required to extract the pinned NSIS Tesseract package" }
  & $sevenZip x -y "-o$extract" $installer | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7-Zip failed to extract the Tesseract installer" }

  $tesseract = Get-ChildItem $extract -Filter "tesseract.exe" -File -Recurse | Select-Object -First 1
  if (-not $tesseract) { throw "Extracted Tesseract package does not contain tesseract.exe" }
  $runtimeRoot = $tesseract.Directory.FullName

  Remove-Item $resolvedDestination -Recurse -Force -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force $resolvedDestination | Out-Null
  Copy-Item (Join-Path $runtimeRoot "*") $resolvedDestination -Recurse -Force

  $tessdataDir = Join-Path $resolvedDestination "tessdata"
  New-Item -ItemType Directory -Force $tessdataDir | Out-Null
  foreach ($item in $Tessdata) {
    $target = Join-Path $tessdataDir $item.Name
    $url = "https://raw.githubusercontent.com/tesseract-ocr/tessdata_fast/$TessdataCommit/$($item.Name)"
    Invoke-WebRequest -Uri $url -OutFile $target -UseBasicParsing
    $blob = Get-GitBlobSha1 $target
    if ($blob -ne $item.Blob) {
      throw "$($item.Name) Git blob mismatch: expected $($item.Blob), got $blob"
    }
  }

  $exe = Join-Path $resolvedDestination "tesseract.exe"
  if (-not (Test-Path $exe)) { throw "Staged tesseract.exe is missing" }
  $env:TESSDATA_PREFIX = $tessdataDir
  $versionOutput = (& $exe --version 2>&1 | Out-String)
  if ($LASTEXITCODE -ne 0 -or $versionOutput -notmatch [regex]::Escape($TesseractVersion)) {
    throw "Unexpected Tesseract version: $versionOutput"
  }
  $languages = (& $exe --list-langs 2>&1 | Out-String)
  foreach ($language in @("vie", "eng", "osd")) {
    if ($languages -notmatch "(?m)^$language`r?$") { throw "Staged Tesseract is missing language '$language'" }
  }

  $inventory = [ordered]@{
    tesseract_version = $TesseractVersion
    tesseract_build = $TesseractBuild
    tesseract_sha256 = $TesseractSha256
    tessdata_commit = $TessdataCommit
    tessdata_git_blobs = [ordered]@{
      vie = $Tessdata[0].Blob
      eng = $Tessdata[1].Blob
      osd = $Tessdata[2].Blob
    }
  }
  $inventory | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $resolvedDestination "solyan-runtime-inventory.json") -Encoding utf8
  Write-Host $versionOutput.Trim()
  Write-Host $languages.Trim()
  Write-Host "Staged OCR native runtime at $resolvedDestination"
} finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}
