import ServerPdfTool from '../../components/ServerPdfTool';

export default function DecompressPdfPage() {
  return <ServerPdfTool title="Giải nén cấu trúc PDF" description="Mở các stream hỗ trợ và tắt object streams bằng qpdf để PDF dễ kiểm tra/debug hơn. Đây là rewrite cấu trúc, không phải giảm dung lượng và không rasterize nội dung trang." endpoint="/pdf/decompress" actionLabel="Giải nén cấu trúc" outputName="solyan-decompressed.pdf" />;
}
