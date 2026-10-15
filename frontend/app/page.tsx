const tools = [
  { href: '/compare', title: 'So sánh PDF', description: 'So sánh nội dung văn bản giữa hai PDF ngay trên thiết bị.', local: true },
  { href: '/pdf-info', title: 'Thông tin toàn bộ PDF', description: 'Phân tích metadata, trang, cấu trúc, font, ảnh, form/chữ ký, attachment, mã hóa/quyền và active-content summary.', local: false, badge: 'qpdf + Poppler' },
  { href: '/sign', title: 'Ký số PDF', description: 'Ký cryptographic bằng chứng thư PKCS#12 với pyHanko.', local: false, badge: 'pyHanko' },
  { href: '/verify-signature', title: 'Kiểm tra chữ ký số', description: 'Xác minh integrity, crypto validity, trust chain và thay đổi sau ký bằng pyHanko.', local: false, badge: 'pyHanko' },
  { href: '/remove-signatures', title: 'Xóa chữ ký số', description: 'Tạo bản PDF không còn signature field, widget và trạng thái chứng thực; giữ các form field khác.', local: false, badge: 'qpdf JSON' },
  { href: '/active-content', title: 'Kiểm tra Active Content', description: 'Xem JavaScript, actions, triggers, active annotations và attachment refs mà không thực thi code.', local: false, badge: 'qpdf JSON' },
  { href: '/sanitize', title: 'Làm sạch PDF', description: 'Loại JavaScript/actions, link, metadata và file đính kèm theo gate regression qpdf JSON.', local: false, badge: 'qpdf JSON' },
  { href: '/remove-annotations', title: 'Xóa comment / annotation', description: 'Xóa comment/markup an toàn, giữ Widget/Form; tùy chọn xóa mọi annotation trừ form.', local: false, badge: 'qpdf JSON' },
  { href: '/bookmarks', title: 'Bookmark / Mục lục PDF', description: 'Đọc, thêm, lồng cấp, sắp xếp và gán trang đích cho outline ngay trên thiết bị.', local: true },
  { href: '/pdfa', title: 'PDF/A', description: 'Tạo PDF/A bằng internal validator, không fallback Ghostscript.', local: false, badge: 'OCRmyPDF' },
  { href: '/workflow', title: 'Workflow PDF', description: 'Chạy nhiều thao tác local trong một lần xử lý.', local: true },
  { href: '/pdf-to-office', title: 'PDF → Office', description: 'DOCX/PPTX theo LibreOffice-first; XLSX theo Bloom → PP-StructureV3 fallback.', local: false, badge: 'V1 Gate' },
  { href: '/pdf-to-csv', title: 'PDF → CSV', description: 'Nhận diện bảng bằng PP-StructureV3, xuất CSV UTF-8 theo trang và đóng ZIP khi có nhiều trang dữ liệu.', local: false, badge: 'PP-StructureV3' },
  { href: '/pdf-to-html', title: 'PDF → HTML', description: 'Xuất một file HTML tự chứa bằng Poppler, nhúng ảnh bằng data URL và chặn scheme liên kết nguy hiểm.', local: false, badge: 'Poppler' },
  { href: '/pdf-to-text', title: 'PDF → Text', description: 'Trích xuất text layer thành TXT UTF-8 bằng Poppler, hỗ trợ phạm vi trang, mật khẩu và giữ bố cục.', local: false, badge: 'Poppler' },
  { href: '/pdf-to-markdown', title: 'PDF → Markdown', description: 'Nhận diện bố cục bằng PP-StructureV3 và xuất Markdown cho PDF scan hoặc tài liệu có cấu trúc.', local: false, badge: 'PP-StructureV3' },
  { href: '/pdf-to-xml', title: 'PDF → XML', description: 'Xuất text, font và tọa độ trang thành một file Poppler pdf2xml UTF-8, hỗ trợ phạm vi trang.', local: false, badge: 'Poppler' },
  { href: '/pdf-to-rtf', title: 'PDF → RTF', description: 'Nhập PDF bằng LibreOffice Writer rồi xuất Rich Text Format để tiếp tục chỉnh sửa.', local: false, badge: 'LibreOffice' },
  { href: '/pdf-to-postscript', title: 'PDF → PostScript / EPS', description: 'Xuất PS nhiều trang hoặc EPS một trang bằng Poppler pdftops, hỗ trợ Level 2/3 và phạm vi trang.', local: false, badge: 'Poppler' },
  { href: '/pdf-to-svg', title: 'PDF → SVG', description: 'Xuất từng trang thành SVG vector-first bằng Poppler pdftocairo; một trang tải SVG, nhiều trang đóng ZIP.', local: false, badge: 'Poppler' },
  { href: '/pdf-to-cbz', title: 'PDF → CBZ', description: 'Render trang PDF thành PNG rồi đóng gói Comic Book ZIP theo đúng thứ tự, hỗ trợ DPI và phạm vi trang.', local: false, badge: 'Poppler' },
  { href: '/office-to-pdf', title: 'Office → PDF', description: 'Word, Excel, PowerPoint và OpenDocument sang PDF.', local: false, badge: 'LibreOffice' },
  { href: '/images-to-pdf', title: 'Ảnh → PDF', description: 'Ghép PNG/JPG thành PDF ngay trên thiết bị.', local: true },
  { href: '/pdf-to-images', title: 'PDF → Ảnh', description: 'Render các trang thành PNG/JPEG và tải ZIP.', local: true },
  { href: '/extract-images', title: 'Trích xuất ảnh nhúng', description: 'Lấy ảnh raster nhúng nguyên bản khi có thể và tải thành ZIP.', local: false, badge: 'Poppler' },
  { href: '/scanner-photo-split', title: 'Tách ảnh từ bản scan', description: 'Nhận diện nhiều ảnh trên cùng mặt scan, crop/deskew từng ảnh và xuất PNG theo thứ tự ổn định.', local: false, badge: 'OpenCV + PDFium' },
  { href: '/remove-images', title: 'Xóa ảnh nhúng', description: 'Loại Image XObject khỏi page/Form resources trong khi giữ text, vector và content stream.', local: false, badge: 'qpdf JSON' },
  { href: '/attachments', title: 'File đính kèm PDF', description: 'Xem, thêm, tải ra hoặc xóa embedded files bằng qpdf.', local: false, badge: 'qpdf server' },
  { href: '/remove-blank-pages', title: 'Xóa trang trắng', description: 'Giữ chắc trang có text; đo raster với ngưỡng tùy chỉnh cho trang không text.', local: false, badge: 'Poppler + qpdf' },
  { href: '/n-up', title: 'N-up · Nhiều trang/tờ', description: 'Xếp nhiều trang lên mỗi tờ A4 với grid, margin, thứ tự và hướng đọc tùy chỉnh.', local: true },
  { href: '/booklet', title: 'Booklet · Đóng ghim giữa', description: 'Dàn saddle-stitch 2-up với thứ tự trang, gutter, gáy trái/phải và duplex.', local: true },
  { href: '/poster', title: 'Poster PDF · In ghép nhiều tờ', description: 'Chia mỗi trang lớn thành lưới A3/A4/A5/Letter/Legal/Tabloid để in và ghép poster.', local: true },
  { href: '/split-sections', title: 'Chia trang thành Section', description: 'Chia trang được chọn thành lưới hàng × cột rồi xuất một PDF hoặc nhiều file trong ZIP.', local: true },
  { href: '/crop', title: 'Crop PDF', description: 'Cắt page boxes theo lề và phạm vi trang, giữ vector/text và rotation.', local: true },
  { href: '/resize-pages', title: 'Resize / Scale trang', description: 'Đặt nội dung vào khổ A0–A6, Letter, Legal hoặc kích thước tùy chỉnh.', local: true },
  { href: '/overlay', title: 'Overlay PDF', description: 'Chồng một PDF lên PDF nền theo trang hoặc lặp trang đầu, có opacity/margin.', local: true },
  { href: '/single-page', title: 'PDF → Một trang dài', description: 'Nối toàn bộ trang theo chiều dọc thành một trang liên tục, giữ vector/text.', local: true },
  { href: '/ocr', title: 'OCR tài liệu', description: 'PP-OCRv6 và PP-StructureV3 cho ảnh/PDF scan.', local: false, badge: 'PaddleOCR' },
  { href: '/viewer', title: 'PDF Viewer', description: 'Xem PDF bằng PDF.js với điều hướng trang và zoom.', local: true },
  { href: '/editor', title: 'Chỉnh sửa PDF', description: 'Thêm text/ảnh, highlight, che nội dung và khung chú thích.', local: true },
  { href: '/auto-redact', title: 'Auto Redact Text', description: 'Tìm từ/cụm từ trong text layer và secure-redact hàng loạt bằng raster replacement chỉ trên các trang có match.', local: true },
  { href: '/forms', title: 'Form PDF', description: 'Đọc và điền AcroForm trực tiếp trong trình duyệt.', local: true },
  { href: '/unlock-forms', title: 'Mở khóa Form PDF', description: 'Gỡ ReadOnly/Lock khỏi AcroForm và mở thuộc tính XFA readOnly mà không flatten field.', local: false, badge: 'qpdf JSON' },
  { href: '/merge', title: 'Gộp PDF', description: 'Gộp nhiều file PDF theo đúng thứ tự.', local: true },
  { href: '/split', title: 'Tách PDF', description: 'Tách thủ công, theo số trang hoặc dung lượng mục tiêu best-effort rồi tải ZIP.', local: true },
  { href: '/auto-split', title: 'Tự động tách bằng QR', description: 'Nhận diện trang QR phân cách bằng OpenCV/PDFium rồi tách bản gốc bằng qpdf, hỗ trợ scan hai mặt.', local: false, badge: 'QR + qpdf' },
  { href: '/auto-rename', title: 'Tự động đặt tên PDF', description: 'Dùng PDF.js chọn dòng tiêu đề nổi bật theo cỡ chữ và tải lại file byte-identical với tên an toàn.', local: true },
  { href: '/split-by-bookmarks', title: 'Tách theo Bookmark / Chương', description: 'Dùng outline để chia tài liệu thành chapter theo độ sâu bookmark và tải ZIP.', local: true },
  { href: '/organize', title: 'Sắp xếp trang', description: 'Đổi thứ tự, bỏ trang hoặc trích xuất trang.', local: true },
  { href: '/rotate', title: 'Xoay PDF', description: 'Xoay toàn bộ hoặc một số trang.', local: true },
  { href: '/auto-rotate', title: 'Tự động xoay PDF', description: 'Nhận diện hướng trang bằng Tesseract OSD rồi xoay tương đối bằng qpdf, không rasterize nội dung.', local: false, badge: 'OSD + qpdf' },
  { href: '/color-transform', title: 'Đảo màu / High Contrast', description: 'Biến đổi màu hiển thị bằng raster local; hỗ trợ invert, grayscale, high contrast và hai màu tùy chỉnh.', local: true },
  { href: '/scanner-effect', title: 'Scanner Effect', description: 'Mô phỏng tài liệu đã scan bằng raster local với preset DPI, grayscale/color, noise, blur, viền giấy và lệch góc deterministic.', local: true },
  { href: '/watermark', title: 'Watermark / Stamp', description: 'Đóng dấu chữ hoặc PNG/JPG với vị trí, xoay, opacity, page range và biến động.', local: true },
  { href: '/page-numbers', title: 'Đánh số trang', description: 'Thêm số trang vào chân trang.', local: true },
  { href: '/metadata', title: 'Metadata', description: 'Xem và chỉnh sửa metadata PDF.', local: true },
  { href: '/protect', title: 'Bảo vệ PDF', description: 'Mã hóa AES-256 và đặt quyền in/sửa/copy bằng qpdf.', local: false, badge: 'qpdf server' },
  { href: '/unlock', title: 'Mở khóa PDF', description: 'Giải mã PDF bằng mật khẩu hợp lệ.', local: false, badge: 'qpdf server' },
  { href: '/compress', title: 'Tối ưu cấu trúc PDF', description: 'Tối ưu object streams và Flate bằng qpdf, không thay đổi chất lượng ảnh.', local: false, badge: 'qpdf server' },
  { href: '/decompress', title: 'Giải nén cấu trúc PDF', description: 'Mở stream hỗ trợ và tắt object streams để PDF dễ kiểm tra/debug hơn.', local: false, badge: 'qpdf server' },
  { href: '/compress-images', title: 'Nén ảnh trong PDF', description: 'Tối ưu ảnh bằng JPEG khi qpdf xác định kết quả nhỏ hơn.', local: false, badge: 'qpdf server' },
  { href: '/web-optimize', title: 'Tối ưu PDF cho Web', description: 'Linearize PDF để reader tương thích có thể bắt đầu hiển thị sớm hơn.', local: false, badge: 'qpdf server' },
  { href: '/flatten', title: 'Flatten PDF', description: 'Đóng băng annotation và form field vào nội dung trang.', local: false, badge: 'qpdf server' },
  { href: '/repair', title: 'Sửa PDF', description: 'Rewrite cấu trúc PDF bằng qpdf.', local: false, badge: 'qpdf server' },
];

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Web-first · Privacy-first</div></header>
      <section className="hero home-hero"><p className="eyebrow">SOLYAN PDF</p><h1>Công cụ PDF đơn giản, nhanh và riêng tư</h1><p className="subtitle">Tác vụ nhẹ chạy ngay trong trình duyệt; tác vụ nặng được tách thành các engine service riêng để dễ thay thế và mở rộng.</p></section>
      <section className="feature-banner"><div><span className="feature-kicker">DÀNH CHO NGƯỜI DÙNG VIỆT NAM</span><h2>13 Tiện ích Việt Nam</h2><p>Đổi số tiền thành chữ, VAT, phần trăm, tính tuổi, BMI, công suất điều hòa, IP, ping, vị trí từ khóa và website rank.</p></div><a className="feature-action" href="/vietnamese">Mở Tiện ích Việt Nam →</a></section>
      <section className="tool-grid" aria-label="Công cụ PDF">{tools.map((tool) => <a className="tool-card" href={tool.href} key={tool.href}><span className="tool-icon">PDF</span><h2>{tool.title}</h2><p>{tool.description}</p><span className={tool.local ? 'tool-badge local' : 'tool-badge server'}>{tool.local ? 'Trên thiết bị' : (tool.badge ?? 'Server')}</span><span className="tool-link">Mở công cụ →</span></a>)}</section>
      <section className="coming-soon"><h2>V1.5 đang phát triển · v0.1.7 stable</h2><p>V1.5 tiếp tục OSS-first bằng các gap tự-contained có giá trị rõ ràng; PDF → SVG là lane đầu tiên, tận dụng Poppler sẵn có thay vì kéo thêm runtime.</p></section>
      <footer>SolYan PDF · Browser-first · PWA-ready</footer>
    </main>
  );
}