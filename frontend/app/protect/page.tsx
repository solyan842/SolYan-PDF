import ServerPdfTool from '../../components/ServerPdfTool';

export default function ProtectPage() {
  return <ServerPdfTool title="Bảo vệ PDF" description="Mã hóa PDF bằng AES-256 thông qua qpdf backend." endpoint="/pdf/protect" actionLabel="Bảo vệ PDF" outputName="solyan-protected.pdf" passwordMode="required" />;
}
