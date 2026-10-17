$ErrorActionPreference = "Stop"

$required = @(
  "desktop/ui/index.html", "desktop/ui/styles.css", "desktop/ui/catalog.js", "desktop/ui/catalog-additions.js", "desktop/ui/app.js",
  "desktop/ui/merge.html", "desktop/ui/merge.js", "desktop/ui/repair.html", "desktop/ui/repair.js",
  "desktop/ui/extract-images.html", "desktop/ui/extract-images.js", "desktop/ui/info.html", "desktop/ui/info.js",
  "desktop/ui/active-content.html", "desktop/ui/active-content.js", "desktop/ui/attachments.html", "desktop/ui/attachments.js",
  "desktop/ui/remove-images.html", "desktop/ui/remove-images.js", "desktop/ui/sanitize.html", "desktop/ui/sanitize.js",
  "desktop/ui/linearize.html", "desktop/ui/linearize.js", "desktop/ui/decompress.html", "desktop/ui/decompress.js",
  "desktop/ui/transform.html", "desktop/ui/transform.js", "desktop/ui/security-transform.html", "desktop/ui/security-transform.js",
  "desktop/ui/remove-signature.html", "desktop/ui/remove-signature.js", "desktop/ui/permissions.html", "desktop/ui/permissions.js",
  "desktop/ui/remove-annotations.html", "desktop/ui/remove-annotations.js", "desktop/ui/unlock-forms.html", "desktop/ui/unlock-forms.js",
  "desktop/ui/remove-blank.html", "desktop/ui/remove-blank.js", "desktop/ui/page-labels.html", "desktop/ui/page-labels.js",
  "desktop/ui/workspace.html", "desktop/backend/stage-native-runtimes.ps1", "desktop/vendor/qpdf-windows-x64.json",
  "desktop/vendor/poppler-windows-x64.json", "desktop/src-tauri/tauri.conf.json"
)
foreach ($path in $required) { if (-not (Test-Path $path)) { throw "Missing required desktop file: $path" } }

$html = Get-Content "desktop/ui/index.html" -Raw
$catalog = (Get-Content "desktop/ui/catalog.js" -Raw) + (Get-Content "desktop/ui/catalog-additions.js" -Raw)
$app = Get-Content "desktop/ui/app.js" -Raw
$scripts = @{
  repair = Get-Content "desktop/ui/repair.js" -Raw
  extractImages = Get-Content "desktop/ui/extract-images.js" -Raw
  info = Get-Content "desktop/ui/info.js" -Raw
  activeContent = Get-Content "desktop/ui/active-content.js" -Raw
  attachments = Get-Content "desktop/ui/attachments.js" -Raw
  removeImages = Get-Content "desktop/ui/remove-images.js" -Raw
  sanitize = Get-Content "desktop/ui/sanitize.js" -Raw
  linearize = Get-Content "desktop/ui/linearize.js" -Raw
  decompress = Get-Content "desktop/ui/decompress.js" -Raw
  transform = Get-Content "desktop/ui/transform.js" -Raw
  securityTransform = Get-Content "desktop/ui/security-transform.js" -Raw
  removeSignature = Get-Content "desktop/ui/remove-signature.js" -Raw
  permissions = Get-Content "desktop/ui/permissions.js" -Raw
  removeAnnotations = Get-Content "desktop/ui/remove-annotations.js" -Raw
  unlockForms = Get-Content "desktop/ui/unlock-forms.js" -Raw
  removeBlank = Get-Content "desktop/ui/remove-blank.js" -Raw
  pageLabels = Get-Content "desktop/ui/page-labels.js" -Raw
}

foreach ($text in @("Công cụ phổ biến", "Tất cả công cụ", "Ctrl K", "catalog-additions.js")) { if (-not $html.Contains($text)) { throw "Desktop UI contract missing: $text" } }
foreach ($text in @("Nối PDF","PDF sang Word","OCR PDF","Tiện ích Việt Nam","Sửa lỗi PDF","Trích xuất hình ảnh","Thông tin PDF","Kiểm tra nội dung chủ động","Tệp đính kèm","Xóa hình ảnh","Làm sạch PDF","Tối ưu xem web","Giải nén cấu trúc PDF","Nén PDF","Flatten PDF","Tối ưu hình ảnh","Bảo vệ PDF","Mở khóa PDF","Xóa chữ ký","Quyền hạn PDF","Xóa chú thích","Mở khóa biểu mẫu","Xóa trang trắng","Page Labels")) { if (-not $catalog.Contains($text)) { throw "Desktop catalog missing: $text" } }
foreach ($text in @("repair: './repair.html'","'extract-images': './extract-images.html'","info: './info.html'","'active-content': './active-content.html'","attachments: './attachments.html'","'remove-images': './remove-images.html'","sanitize: './sanitize.html'","linearize: './linearize.html'","decompress: './decompress.html'","compress: './transform.html?tool=compress'","flatten: './transform.html?tool=flatten'","'image-opt': './transform.html?tool=image-opt'","protect: './security-transform.html?tool=protect'","unlock: './security-transform.html?tool=unlock'","'remove-signature': './remove-signature.html'","permissions: './permissions.html'","'remove-annotations': './remove-annotations.html'","'unlock-forms': './unlock-forms.html'","'remove-blank': './remove-blank.html'","'page-labels': './page-labels.html'")) { if (-not $app.Contains($text)) { throw "Desktop route contract missing: $text" } }

$contracts = @(
  @{ n='Repair PDF'; s=$scripts.repair; t=@('desktop_core_session','/pdf/repair','X-SolYan-Desktop-Token') },
  @{ n='Extract Images'; s=$scripts.extractImages; t=@('desktop_core_session','/pdf/extract-images','X-SolYan-Desktop-Token','X-SolYan-Extracted-Images') },
  @{ n='PDF Info'; s=$scripts.info; t=@('desktop_core_session','/pdf/info','X-SolYan-Desktop-Token','password') },
  @{ n='Active Content'; s=$scripts.activeContent; t=@('desktop_core_session','/pdf/inspect-active-content','X-SolYan-Desktop-Token','password') },
  @{ n='Attachments'; s=$scripts.attachments; t=@('desktop_core_session','/pdf/attachments/list','/pdf/attachments/add','/pdf/attachments/extract','/pdf/attachments/remove','X-SolYan-Desktop-Token') },
  @{ n='Remove Images'; s=$scripts.removeImages; t=@('desktop_core_session','/pdf/remove-images','X-SolYan-Desktop-Token','X-SolYan-Images-Removed') },
  @{ n='Sanitize'; s=$scripts.sanitize; t=@('desktop_core_session','/pdf/sanitize','X-SolYan-Desktop-Token','X-SolYan-Sanitize-Actions-Removed') },
  @{ n='Web optimize'; s=$scripts.linearize; t=@('desktop_core_session','/pdf/web-optimize','X-SolYan-Desktop-Token') },
  @{ n='Decompress'; s=$scripts.decompress; t=@('desktop_core_session','/pdf/decompress','X-SolYan-Desktop-Token') },
  @{ n='Transform'; s=$scripts.transform; t=@('desktop_core_session','/pdf/compress','/pdf/flatten','/pdf/compress-images','X-SolYan-Desktop-Token') },
  @{ n='Security transform'; s=$scripts.securityTransform; t=@('desktop_core_session','/pdf/protect','/pdf/unlock','X-SolYan-Desktop-Token','owner_password','print_mode','modify_mode','allow_extract') },
  @{ n='Remove signatures'; s=$scripts.removeSignature; t=@('desktop_core_session','/pdf/remove-signatures','X-SolYan-Desktop-Token','X-SolYan-Signature-Fields-Removed','X-SolYan-Signature-Widgets-Removed','X-SolYan-Signature-Values-Removed','X-SolYan-Signature-Permissions-Removed','X-SolYan-Signature-DSS-Removed') },
  @{ n='Permissions'; s=$scripts.permissions; t=@('desktop_core_session','/pdf/info','X-SolYan-Desktop-Token','password','encryption','permissions') },
  @{ n='Remove annotations'; s=$scripts.removeAnnotations; t=@('desktop_core_session','/pdf/remove-annotations','X-SolYan-Desktop-Token','remove_all_non_widget','X-SolYan-Comments-Removed','X-SolYan-Other-Annotations-Removed','X-SolYan-Widgets-Preserved') },
  @{ n='Unlock forms'; s=$scripts.unlockForms; t=@('desktop_core_session','/pdf/unlock-forms','X-SolYan-Desktop-Token','X-SolYan-Form-Fields-Visited','X-SolYan-Readonly-Flags-Cleared','X-SolYan-Form-Locks-Removed','X-SolYan-XFA-Streams-Modified','X-SolYan-XFA-Attributes-Opened') },
  @{ n='Remove blank pages'; s=$scripts.removeBlank; t=@('desktop_core_session','/pdf/remove-blank-pages','X-SolYan-Desktop-Token','threshold','white_percent','X-SolYan-Blank-Pages-Removed','X-SolYan-Blank-Pages','X-SolYan-Blank-Threshold','X-SolYan-Blank-White-Percent') },
  @{ n='Page Labels'; s=$scripts.pageLabels; t=@('desktop_core_session','/pdf/page-labels','X-SolYan-Desktop-Token','mode','rules_json','X-SolYan-Page-Labels') }
)
foreach ($contract in $contracts) { foreach ($text in $contract.t) { if (-not $contract.s.Contains($text)) { throw "$($contract.n) local-core contract missing: $text" } } }

$strictCspPages = @("desktop/ui/index.html","desktop/ui/merge.html","desktop/ui/repair.html","desktop/ui/extract-images.html","desktop/ui/info.html","desktop/ui/active-content.html","desktop/ui/attachments.html","desktop/ui/remove-images.html","desktop/ui/sanitize.html","desktop/ui/linearize.html","desktop/ui/decompress.html","desktop/ui/transform.html","desktop/ui/security-transform.html","desktop/ui/remove-signature.html","desktop/ui/permissions.html","desktop/ui/remove-annotations.html","desktop/ui/unlock-forms.html","desktop/ui/remove-blank.html","desktop/ui/page-labels.html","desktop/ui/workspace.html")
foreach ($page in $strictCspPages) { if ((Get-Content $page -Raw) -match 'style\s*=') { throw "Strict CSP violation: inline style attribute found in $page" } }

Write-Output "Desktop UI contract and CSP hygiene OK"
