const tools = [
  { href: '/merge', title: 'Gộp PDF', description: 'Gộp nhiều file PDF theo đúng thứ tự.' },
  { href: '/split', title: 'Tách PDF', description: 'Tách theo nhóm trang tùy chọn.' },
  { href: '/organize', title: 'Sắp xếp trang', description: 'Đổi thứ tự, bỏ trang hoặc trích xuất trang.' },
  { href: '/rotate', title: 'Xoay PDF', description: 'Xoay toàn bộ hoặc một số trang.' },
];

export default function HomePage() {
  return (
    <main className="shell">
      <header className="topbar">
        <a className="brand" href="/">SolYan PDF</a>
        <div className="privacy-pill">Web-first · Privacy-first</div>
      </header>
      <section className="hero home-hero">
        <p className="eyebrow">SOLYAN PDF</p>
        <h1>Công cụ PDF đơn giản, nhanh và riêng tư</h1>
        <p className="subtitle">Các thao tác cơ bản chạy trực tiếp trong trình duyệt. File không cần rời khỏi thiết bị của bạn.</p>
      </section>
      <section className="tool-grid" aria-label="Công cụ PDF">
        {tools.map((tool) => (
          <a className="tool-card" href={tool.href} key={tool.href}>
            <span className="tool-icon">PDF</span>
            <h2>{tool.title}</h2>
            <p>{tool.description}</p>
            <span className="tool-link">Mở công cụ →</span>
          </a>
        ))}
      </section>
      <section className="coming-soon">
        <h2>Đang triển khai tiếp</h2>
        <p>Protect / Unlock · Watermark · Page numbers · Metadata · Repair · Compress · Tiện ích Việt Nam</p>
      </section>
      <footer>SolYan PDF · Browser-first · PWA-ready</footer>
    </main>
  );
}
