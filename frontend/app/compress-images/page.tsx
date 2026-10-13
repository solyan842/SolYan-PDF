import ServerPdfTool from '../../components/ServerPdfTool';

export default function CompressImagesPage() {
  return <ServerPdfTool title="Nén ảnh trong PDF" description="Cho phép qpdf chuyển các ảnh phù hợp sang JPEG khi việc đó thực sự làm file nhỏ hơn; ảnh không bị resize nhưng có thể xuất hiện artefact JPEG nhẹ." endpoint="/pdf/compress-images" actionLabel="Nén ảnh PDF" outputName="solyan-image-compressed.pdf" />;
}
