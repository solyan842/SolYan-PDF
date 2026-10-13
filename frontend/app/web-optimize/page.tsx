import ServerPdfTool from '../../components/ServerPdfTool';

export default function WebOptimizePage() {
  return <ServerPdfTool title="Tối ưu PDF cho Web" description="Linearize PDF bằng qpdf để trình đọc tương thích có thể bắt đầu hiển thị trước khi tải xong toàn bộ file." endpoint="/pdf/web-optimize" actionLabel="Tối ưu cho Web" outputName="solyan-web-optimized.pdf" />;
}
