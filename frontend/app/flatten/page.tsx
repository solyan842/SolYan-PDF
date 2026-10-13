import ServerPdfTool from '../../components/ServerPdfTool';

export default function FlattenPage() {
  return <ServerPdfTool title="Flatten PDF" description="Đóng băng annotation và trường biểu mẫu vào nội dung trang bằng qpdf; phù hợp trước khi chia, xoay hoặc gửi cho hệ thống không xử lý annotation tốt." endpoint="/pdf/flatten" actionLabel="Flatten PDF" outputName="solyan-flattened.pdf" />;
}
