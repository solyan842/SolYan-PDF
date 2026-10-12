import ServerPdfTool from '../../components/ServerPdfTool';

export default function UnlockPage() {
  return <ServerPdfTool title="Mở khóa PDF" description="Giải mã PDF khi bạn có mật khẩu hợp lệ." endpoint="/pdf/unlock" actionLabel="Mở khóa PDF" outputName="solyan-unlocked.pdf" passwordMode="optional" />;
}
