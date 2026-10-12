import ServerPdfTool from '../../components/ServerPdfTool';

export default function RepairPage() {
  return <ServerPdfTool title="Sửa PDF" description="Rewrite cấu trúc PDF bằng qpdf để khắc phục nhiều lỗi cấu trúc phổ biến." endpoint="/pdf/repair" actionLabel="Sửa PDF" outputName="solyan-repaired.pdf" />;
}
