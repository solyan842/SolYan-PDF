import ServerPdfTool from '../../components/ServerPdfTool';

export default function CompressPage() {
  return <ServerPdfTool title="Nén PDF" description="Tối ưu object streams và recompress Flate bằng qpdf." endpoint="/pdf/compress" actionLabel="Nén PDF" outputName="solyan-compressed.pdf" />;
}
