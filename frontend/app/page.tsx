const tools = [
  { href: '/compare', title: 'So sánh PDF', description: 'So sánh nội dung văn bản giữa hai PDF ngay trên thiết bị.', local: true },
  { href: '/sign', title: 'Ký số PDF', description: 'Ký cryptographic bằng chứng thư PKCS#12 với pyHanko.', local: false, badge: 'pyHanko' },
  { href: '/pdfa', title: 'PDF/A', description: 'Tạo PDF/A bằng internal validator, không fallback Ghostscript.', local: false, badge: 'OCRmyPDF' },
  { href: '/workflow', title: 'Workflow PDF', description: 'Chạy nhiều thao tác local trong một lần xử lý.', local: true },
  { href: '/pdf-to-office', title: 'PDF → Office', description: 'DOCX/XLSX/PPTX qua Bloom adapter, đang ở mức experimental.', local: false, badge: 'Experimental' },
  { href: '/office-to-pdf', title: 'Office → PDF', description: 'Word, Excel, PowerPoint và OpenDocument sang PDF.', local: false, badge: 'LibreOffice' },
  { href: '/images-to-pdf', title: 'Ảnh → PDF', description: 'Ghép PNG/JPG thành PDF ngay trên thiết bị.', local: true },
  { href: '/pdf-to-images', title: 'PDF → Ảnh', description: 'Render các trang thành PNG/JPEG và tải ZIP.', local: true },
  { href: '/ocr', title: 'OCR tài liệu', description: 'PP-OCRv6 và PP-StructureV3 cho ảnh/PDF scan.', local: false, badge: 'PaddleOCR' },
  { href: '/viewer', title: 'PDF Viewer', description: 'Xem PDF bằng PDF.js với điều hướng trang và zoom.', local: true },
  { href: '/editor', title: 'Chỉnh sửa PDF', description: 'Thêm text/ảnh, highlight, che nội dung và khung chú thích.', local: true },
  { href: '/forms', title: 'Form PDF', description: 'Đọc và điền AcroForm trực tiếp trong trình duyệt.', local: true },
  { href: '/merge', title: 'Gộp PDF', description: 'Gộp nhiều file PDF theo đúng thứ tự.', local: true },
  { href: '/split', title: 'Tách PDF', description: 'Tách theo nhóm trang tùy chọn.', local: true },
  { href: '/organize', title: 'Sắp xếp trang', description: 'Đổi thứ tự, bỏ trang hoặc trích xuất trang.', local: true },
  { href: '/rotate', title: 'Xoay PDF', description: 'Xoay toàn bộ hoặc một số trang.', local: true },
  { href: '/watermark', title: 'Watermark', description: 'Đóng watermark chữ lên PDF.', local: true },
  { href: '/page-numbers', title: 'Đánh số trang', description: 'Thêm số trang vào chân trang.', local: true },
  { href: '/metadata', title: 'Metadata', description: 'Xem và chỉnh sửa metadata PDF.', local: true },
  { href: '/protect', title: 'Bảo vệ PDF', description: 'Mã hóa PDF bằng AES-256 với qpdf.', local: false, badge: 'qpdf server' },
  { href: '/unlock', title: 'Mở khóa PDF', description: 'Giải mã PDF bằng mật khẩu hợp lệ.', local: false, badge: 'qpdf server' },
  { href: '/compress', title: 'Tối ưu PDF', description: 'Tối ưu cấu trúc/object streams bằng qpdf; không downsample ảnh.', local: false, badge: 'qpdf server' },
  { href: '/repair', title: 'Sửa PDF', description: 'Rewrite cấu trúc PDF bằng qpdf.', local: false, badge: 'qpdf server' },
];

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Web-first · Privacy-first</div></header>
      <section className="hero home-hero"><p className="eyebrow">SOLYAN PDF</p><h1>Công cụ PDF đơn giản, nhanh và riêng tư</h1><p className="subtitle">Tác vụ nhẹ chạy ngay trong trình duyệt; tác vụ nặng được tách thành các engine service riêng để dễ thay thế và mở rộng.</p></section>
      <section className="feature-banner"><div><span className="feature-kicker">DÀNH CHO NGƯỜI DÙNG VIỆT NAM</span><h2>13 Tiện ích Việt Nam</h2><p>Đổi số tiền thành chữ, VAT, phần trăm, tính tuổi, BMI, công suất điều hòa, IP, ping, vị trí từ khóa và website rank.</p></div><a className="feature-action" href="/vietnamese">Mở Tiện ích Việt Nam →</a></section>
      <section className="tool-grid" aria-label="Công cụ PDF">{tools.map((tool) => <a className="tool-card" href={tool.href} key={tool.href}><span className="tool-icon">PDF</span><h2>{tool.title}</h2><p>{tool.description}</p><span className={tool.local ? 'tool-badge local' : 'tool-badge server'}>{tool.local ? 'Trên thiết bị' : (tool.badge ?? 'Server')}</span><span className="tool-link">Mở công cụ →</span></a>)}</section>
      <section className="coming-soon"><h2>Còn lại trước production</h2><p>Secure redaction · thumbnail thật · PWA/deployment · Tesseract fallback · cloud connectors tùy credential.</p></section>
      <footer>SolYan PDF · Browser-first · PWA-ready</footer>
    </main>
  );
}
