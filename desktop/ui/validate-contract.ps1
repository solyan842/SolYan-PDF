$ErrorActionPreference = "Stop"

$required = @(
  "desktop/ui/index.html",
  "desktop/ui/styles.css",
  "desktop/ui/catalog.js",
  "desktop/ui/app.js",
  "desktop/ui/merge.html",
  "desktop/ui/merge.js",
  "desktop/ui/repair.html",
  "desktop/ui/repair.js",
  "desktop/ui/extract-images.html",
  "desktop/ui/extract-images.js",
  "desktop/ui/info.html",
  "desktop/ui/info.js",
  "desktop/ui/active-content.html",
  "desktop/ui/active-content.js",
  "desktop/ui/attachments.html",
  "desktop/ui/attachments.js",
  "desktop/ui/remove-images.html",
  "desktop/ui/remove-images.js",
  "desktop/ui/sanitize.html",
  "desktop/ui/sanitize.js",
  "desktop/ui/linearize.html",
  "desktop/ui/linearize.js",
  "desktop/ui/decompress.html",
  "desktop/ui/decompress.js",
  "desktop/ui/transform.html",
  "desktop/ui/transform.js",
  "desktop/ui/security-transform.html",
  "desktop/ui/security-transform.js",
  "desktop/ui/remove-signature.html",
  "desktop/ui/remove-signature.js",
  "desktop/ui/workspace.html",
  "desktop/backend/stage-native-runtimes.ps1",
  "desktop/vendor/qpdf-windows-x64.json",
  "desktop/vendor/poppler-windows-x64.json",
  "desktop/src-tauri/tauri.conf.json"
)
foreach ($path in $required) {
  if (-not (Test-Path $path)) { throw "Missing required desktop file: $path" }
}

$html = Get-Content "desktop/ui/index.html" -Raw
$catalog = Get-Content "desktop/ui/catalog.js" -Raw
$app = Get-Content "desktop/ui/app.js" -Raw
$repair = Get-Content "desktop/ui/repair.js" -Raw
$extractImages = Get-Content "desktop/ui/extract-images.js" -Raw
$info = Get-Content "desktop/ui/info.js" -Raw
$activeContent = Get-Content "desktop/ui/active-content.js" -Raw
$attachments = Get-Content "desktop/ui/attachments.js" -Raw
$removeImages = Get-Content "desktop/ui/remove-images.js" -Raw
$sanitize = Get-Content "desktop/ui/sanitize.js" -Raw
$linearize = Get-Content "desktop/ui/linearize.js" -Raw
$decompress = Get-Content "desktop/ui/decompress.js" -Raw
$transform = Get-Content "desktop/ui/transform.js" -Raw
$securityTransform = Get-Content "desktop/ui/security-transform.js" -Raw
$removeSignature = Get-Content "desktop/ui/remove-signature.js" -Raw

foreach ($text in @("Công cụ phổ biến", "Tất cả công cụ", "Ctrl K")) {
  if (-not $html.Contains($text)) { throw "Desktop UI contract missing: $text" }
}
foreach ($text in @(
  "Nối PDF", "PDF sang Word", "OCR PDF", "Tiện ích Việt Nam", "Sửa lỗi PDF",
  "Trích xuất hình ảnh", "Thông tin PDF", "Kiểm tra nội dung chủ động", "Tệp đính kèm",
  "Xóa hình ảnh", "Làm sạch PDF", "Tối ưu xem web", "Giải nén cấu trúc PDF",
  "Nén PDF", "Flatten PDF", "Tối ưu hình ảnh", "Bảo vệ PDF", "Mở khóa PDF", "Xóa chữ ký"
)) {
  if (-not $catalog.Contains($text)) { throw "Desktop catalog missing: $text" }
}
foreach ($text in @(
  "repair: './repair.html'",
  "'extract-images': './extract-images.html'",
  "info: './info.html'",
  "'active-content': './active-content.html'",
  "attachments: './attachments.html'",
  "'remove-images': './remove-images.html'",
  "sanitize: './sanitize.html'",
  "linearize: './linearize.html'",
  "decompress: './decompress.html'",
  "compress: './transform.html?tool=compress'",
  "flatten: './transform.html?tool=flatten'",
  "'image-opt': './transform.html?tool=image-opt'",
  "protect: './security-transform.html?tool=protect'",
  "unlock: './security-transform.html?tool=unlock'",
  "'remove-signature': './remove-signature.html'"
)) {
  if (-not $app.Contains($text)) { throw "Desktop route contract missing: $text" }
}

foreach ($text in @("desktop_core_session", "/pdf/repair", "X-SolYan-Desktop-Token")) {
  if (-not $repair.Contains($text)) { throw "Repair PDF local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/extract-images", "X-SolYan-Desktop-Token", "X-SolYan-Extracted-Images")) {
  if (-not $extractImages.Contains($text)) { throw "Extract Images local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/info", "X-SolYan-Desktop-Token", "password")) {
  if (-not $info.Contains($text)) { throw "PDF Info local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/inspect-active-content", "X-SolYan-Desktop-Token", "password")) {
  if (-not $activeContent.Contains($text)) { throw "Active Content local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/attachments/list", "/pdf/attachments/add", "/pdf/attachments/extract", "/pdf/attachments/remove", "X-SolYan-Desktop-Token")) {
  if (-not $attachments.Contains($text)) { throw "Attachments local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/remove-images", "X-SolYan-Desktop-Token", "X-SolYan-Images-Removed")) {
  if (-not $removeImages.Contains($text)) { throw "Remove Images local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/sanitize", "X-SolYan-Desktop-Token", "X-SolYan-Sanitize-Actions-Removed")) {
  if (-not $sanitize.Contains($text)) { throw "Sanitize PDF local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/web-optimize", "X-SolYan-Desktop-Token")) {
  if (-not $linearize.Contains($text)) { throw "Web optimize local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/decompress", "X-SolYan-Desktop-Token")) {
  if (-not $decompress.Contains($text)) { throw "Decompress PDF local-core contract missing: $text" }
}
foreach ($text in @("desktop_core_session", "/pdf/compress", "/pdf/flatten", "/pdf/compress-images", "X-SolYan-Desktop-Token")) {
  if (-not $transform.Contains($text)) { throw "Reusable transform local-core contract missing: $text" }
}
foreach ($text in @(
  "desktop_core_session", "/pdf/protect", "/pdf/unlock", "X-SolYan-Desktop-Token",
  "owner_password", "print_mode", "modify_mode", "allow_extract"
)) {
  if (-not $securityTransform.Contains($text)) { throw "Security transform local-core contract missing: $text" }
}
foreach ($text in @(
  "desktop_core_session", "/pdf/remove-signatures", "X-SolYan-Desktop-Token",
  "X-SolYan-Signature-Fields-Removed", "X-SolYan-Signature-Widgets-Removed",
  "X-SolYan-Signature-Values-Removed", "X-SolYan-Signature-Permissions-Removed", "X-SolYan-Signature-DSS-Removed"
)) {
  if (-not $removeSignature.Contains($text)) { throw "Remove Signatures local-core contract missing: $text" }
}

$strictCspPages = @(
  "desktop/ui/index.html", "desktop/ui/merge.html", "desktop/ui/repair.html",
  "desktop/ui/extract-images.html", "desktop/ui/info.html", "desktop/ui/active-content.html",
  "desktop/ui/attachments.html", "desktop/ui/remove-images.html", "desktop/ui/sanitize.html",
  "desktop/ui/linearize.html", "desktop/ui/decompress.html", "desktop/ui/transform.html",
  "desktop/ui/security-transform.html", "desktop/ui/remove-signature.html", "desktop/ui/workspace.html"
)
foreach ($page in $strictCspPages) {
  if ((Get-Content $page -Raw) -match 'style\s*=') { throw "Strict CSP violation: inline style attribute found in $page" }
}

Write-Output "Desktop UI contract and CSP hygiene OK"
