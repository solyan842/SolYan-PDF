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
  "desktop/ui/poppler-convert.html", "desktop/ui/poppler-convert.js", "desktop/ui/office-convert.html", "desktop/ui/office-convert.js",
  "desktop/ui/portfolio.html", "desktop/ui/portfolio.js", "desktop/ui/workspace.html", "desktop/ui/page-tools.html", "desktop/ui/page-tools.js", "desktop/ui/page-layout.html", "desktop/ui/page-layout.js", "desktop/ui/image-to-pdf.html", "desktop/ui/image-to-pdf.js", "desktop/ui/utilities.html", "desktop/ui/utility-tools.js", "desktop/ui/form-fill.html", "desktop/ui/form-fill.js", "desktop/ui/overlay.html", "desktop/ui/overlay.js", "desktop/stool-tests/page-layout.browser.mjs",
  "desktop/ui/ocr.html", "desktop/ui/ocr.js", "desktop/ui/ocr.css",
  "desktop/ui/sign.html", "desktop/ui/sign.js", "desktop/backend/sign_runner.py",
  "desktop/ui/pdfa.html", "desktop/ui/pdfa.js", "desktop/backend/archive_runner.py",
  "desktop/backend/stage-native-runtimes.ps1", "desktop/backend/stage-office-runtime.ps1",
  "desktop/vendor/qpdf-windows-x64.json", "desktop/vendor/poppler-windows-x64.json", "desktop/vendor/libreoffice-windows-x64.json",
  "desktop/src-tauri/tauri.conf.json"
)
foreach ($path in $required) { if (-not (Test-Path $path)) { throw "Missing required desktop file: $path" } }


$html = Get-Content "desktop/ui/index.html" -Raw
$catalog = (Get-Content "desktop/ui/catalog.js" -Raw) + (Get-Content "desktop/ui/catalog-additions.js" -Raw)
$app = Get-Content "desktop/ui/app.js" -Raw
$requiredRoutes = @("split:", "rotate:", "'extract-pages':", "reorder:", "'remove-pages':", "crop:", "metadata:", "'image-pdf':", "'page-numbers':", "bates:", "'number-text':", "'vn-text':", "vat:", "percent:", "age:", "bmi:", "aircon:", "'fill-form':", "overlay:", "'advanced-split':", "'split-sections':", "resize:", "'long-page':", "nup:", "booklet:")
foreach ($route in $requiredRoutes) { if (-not $app.Contains($route)) { throw "Missing sTool UI route: $route" } }
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
  popplerConvert = Get-Content "desktop/ui/poppler-convert.js" -Raw
  officeConvert = Get-Content "desktop/ui/office-convert.js" -Raw
  portfolio = Get-Content "desktop/ui/portfolio.js" -Raw
  ocr = Get-Content "desktop/ui/ocr.js" -Raw
}

foreach ($text in @("Công cụ phổ biến", "Tất cả công cụ", "Ctrl K", "catalog-additions.js")) { if (-not $html.Contains($text)) { throw "Desktop UI contract missing: $text" } }
foreach ($text in @("Nối PDF","PDF sang Word","PDF sang PowerPoint","Word sang PDF","Excel sang PDF","PowerPoint sang PDF","OpenDocument sang PDF","RTF sang PDF","OCR PDF","Tiện ích Việt Nam","Sửa lỗi PDF","Trích xuất hình ảnh","Thông tin PDF","Kiểm tra nội dung chủ động","Tệp đính kèm","Xóa hình ảnh","Làm sạch PDF","Tối ưu xem web","Giải nén cấu trúc PDF","Nén PDF","Flatten PDF","Tối ưu hình ảnh","Bảo vệ PDF","Mở khóa PDF","Xóa chữ ký","Quyền hạn PDF","Xóa chú thích","Mở khóa biểu mẫu","Xóa trang trắng","Page Labels","PDF sang TXT","PDF sang HTML","PDF sang XML","PDF sang CBZ","PDF sang SVG","PDF sang PostScript","PDF sang EPS","PDF Portfolio","Ký PDF","Kiểm tra chữ ký")) { if (-not $catalog.Contains($text)) { throw "Desktop catalog missing: $text" } }
foreach ($text in @("repair: './repair.html'","'extract-images': './extract-images.html'","info: './info.html'","'active-content': './active-content.html'","attachments: './attachments.html'","'remove-images': './remove-images.html'","sanitize: './sanitize.html'","linearize: './linearize.html'","decompress: './decompress.html'","compress: './transform.html?tool=compress'","flatten: './transform.html?tool=flatten'","'image-opt': './transform.html?tool=image-opt'","protect: './security-transform.html?tool=protect'","unlock: './security-transform.html?tool=unlock'","'remove-signature': './remove-signature.html'","permissions: './permissions.html'","'remove-annotations': './remove-annotations.html'","'unlock-forms': './unlock-forms.html'","'remove-blank': './remove-blank.html'","'page-labels': './page-labels.html'","'pdf-text': './poppler-convert.html?tool=text'","'pdf-html': './poppler-convert.html?tool=html'","'pdf-xml': './poppler-convert.html?tool=xml'","'pdf-cbz': './poppler-convert.html?tool=cbz'","'pdf-svg': './poppler-convert.html?tool=svg'","'pdf-ps': './poppler-convert.html?tool=ps'","'pdf-eps': './poppler-convert.html?tool=eps'","portfolio: './portfolio.html'","'word-pdf': './office-convert.html?tool=word-pdf'","'excel-pdf': './office-convert.html?tool=excel-pdf'","'ppt-pdf': './office-convert.html?tool=ppt-pdf'","'odf-pdf': './office-convert.html?tool=odf-pdf'","'rtf-pdf': './office-convert.html?tool=rtf-pdf'","'pdf-word': './office-convert.html?tool=pdf-word'","'pdf-ppt': './office-convert.html?tool=pdf-ppt'")) { if (-not $app.Contains($text)) { throw "Desktop route contract missing: $text" } }

foreach ($text in @("'ocr-pdf': './ocr.html'","'ocr-image': './ocr.html'")) { if (-not $app.Contains($text)) { throw "Desktop OCR route contract missing: $text" } }

$signUi = Get-Content "desktop/ui/sign.js" -Raw
foreach ($value in @("desktop_core_session", "/sign/pkcs12", "/sign/validate", "X-SolYan-Desktop-Token")) {
  if (-not $signUi.Contains($value)) { throw "Signing UI contract missing: $value" }
}
foreach ($value in @("sign: './sign.html'", "'verify-signature': './sign.html?mode=verify'")) {
  if (-not $app.Contains($value)) { throw "Desktop signing route missing: $value" }
}
$signProxy = Get-Content "backend/app/sign_proxy.py" -Raw
foreach ($value in @("SOLYAN_SIGN_TOKEN", "_sign_auth_headers")) {
  if (-not $signProxy.Contains($value)) { throw "Signing proxy token contract missing: $value" }
}
$pdfaUi = Get-Content "desktop/ui/pdfa.js" -Raw
foreach ($value in @("desktop_core_session", "/archive/pdfa", "X-SolYan-Desktop-Token")) {
  if (-not $pdfaUi.Contains($value)) { throw "PDF/A UI contract missing: $value" }
}
if (-not $app.Contains("pdfa: './pdfa.html'")) { throw "Desktop PDF/A route missing" }
$archiveProxy = Get-Content "backend/app/archive_proxy.py" -Raw
foreach ($value in @("SOLYAN_ARCHIVE_TOKEN", "_archive_auth_headers")) {
  if (-not $archiveProxy.Contains($value)) { throw "Archive proxy auth contract missing: $value" }
}
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
  @{ n='Page Labels'; s=$scripts.pageLabels; t=@('desktop_core_session','/pdf/page-labels','X-SolYan-Desktop-Token','mode','rules_json','X-SolYan-Page-Labels') },
  @{ n='Poppler converters'; s=$scripts.popplerConvert; t=@('desktop_core_session','/pdf/to-text','/pdf/to-html','/pdf/to-xml','/pdf/to-cbz','/pdf/to-svg','/pdf/to-postscript','X-SolYan-Desktop-Token','password','first_page','last_page','preserve_page_breaks','precise_coordinates','include_hidden_text','raster_dpi','output_format','level') },
  @{ n='Office converters'; s=$scripts.officeConvert; t=@('desktop_core_session','/office/to-pdf','/experimental/pdf-to-office','X-SolYan-Desktop-Token','target','mode','auto','X-SolYan-Conversion-Engine','LibreOffice-first') },
  @{ n='OCR PDF/Image'; s=$scripts.ocr; t=@('desktop_core_session','/ocr/text','X-SolYan-Desktop-Token','payload.text') },
  @{ n='PDF Portfolio'; s=$scripts.portfolio; t=@('desktop_core_session','/pdf/portfolio','X-SolYan-Desktop-Token','X-SolYan-Portfolio-Files') }
)
foreach ($contract in $contracts) { foreach ($text in $contract.t) { if (-not $contract.s.Contains($text)) { throw "$($contract.n) local-core contract missing: $text" } } }

$strictCspPages = @("desktop/ui/index.html","desktop/ui/merge.html","desktop/ui/repair.html","desktop/ui/extract-images.html","desktop/ui/info.html","desktop/ui/active-content.html","desktop/ui/attachments.html","desktop/ui/remove-images.html","desktop/ui/sanitize.html","desktop/ui/linearize.html","desktop/ui/decompress.html","desktop/ui/transform.html","desktop/ui/security-transform.html","desktop/ui/remove-signature.html","desktop/ui/permissions.html","desktop/ui/remove-annotations.html","desktop/ui/unlock-forms.html","desktop/ui/remove-blank.html","desktop/ui/page-labels.html","desktop/ui/poppler-convert.html","desktop/ui/office-convert.html","desktop/ui/portfolio.html","desktop/ui/ocr.html","desktop/ui/sign.html","desktop/ui/pdfa.html","desktop/ui/workspace.html")
foreach ($page in $strictCspPages) { if ((Get-Content $page -Raw) -match 'style\s*=') { throw "Strict CSP violation: inline style attribute found in $page" } }

Write-Output "Desktop UI contract and CSP hygiene OK"
