import ServerPdfTool from '../../components/ServerPdfTool';

export default function ExtractImagesPage() {
  return <ServerPdfTool
    title="Trích xuất ảnh từ PDF"
    description="Lấy các ảnh raster nhúng trong PDF và tải về dưới dạng ZIP. JPEG/JPEG2000/JBIG2/CCITT được giữ native khi Poppler hỗ trợ; các ảnh khác được xuất PNG/TIFF phù hợp."
    endpoint="/pdf/extract-images"
    actionLabel="Trích xuất ảnh"
    outputName="solyan-extracted-images.zip"
    engineLabel="Poppler pdfimages server"
    eyebrow="EXTRACT · POPPLER"
    hint="Giới hạn mặc định: 100 MB/PDF, tối đa 2.000 ảnh, 100 MP/ảnh, 1 gigapixel tổng và 512 MB dữ liệu trích xuất."
  />;
}
