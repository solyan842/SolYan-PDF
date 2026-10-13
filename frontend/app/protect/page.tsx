'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type PrintMode = 'none' | 'low' | 'full';
type ModifyMode = 'none' | 'assembly' | 'form' | 'annotate' | 'all';

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export default function ProtectPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [ownerPassword, setOwnerPassword] = useState('');
  const [printMode, setPrintMode] = useState<PrintMode>('full');
  const [modifyMode, setModifyMode] = useState<ModifyMode>('all');
  const [allowExtract, setAllowExtract] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
    setError('');
  }

  async function run() {
    if (!file || !password) return;
    setBusy(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('password', password);
      if (ownerPassword) body.append('owner_password', ownerPassword);
      body.append('print_mode', printMode);
      body.append('modify_mode', modifyMode);
      body.append('allow_extract', String(allowExtract));
      const response = await fetch(`${API_BASE}/pdf/protect`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try { const payload = await response.json(); message = payload.detail ?? message; } catch {}
        throw new Error(message);
      }
      downloadBlob(await response.blob(), 'solyan-protected.pdf');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể bảo vệ PDF.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">AES-256 · qpdf</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">SECURITY · V1.2</p>
      <h1>Bảo vệ PDF</h1>
      <p className="subtitle">Mã hóa AES-256 và đặt quyền in, chỉnh sửa, sao chép nội dung bằng qpdf.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>
    <section className="workspace form-workspace">
      <label className="field"><span>Mật khẩu mở PDF</span><input type="password" maxLength={128} value={password} onChange={(e)=>setPassword(e.target.value)} autoComplete="new-password"/></label>
      <label className="field"><span>Owner password (tùy chọn)</span><input type="password" maxLength={128} value={ownerPassword} onChange={(e)=>setOwnerPassword(e.target.value)} autoComplete="new-password" placeholder="Để trống = SolYan sinh ngẫu nhiên an toàn"/></label>
      <label className="field"><span>Quyền in</span><select value={printMode} onChange={(e)=>setPrintMode(e.target.value as PrintMode)}><option value="full">In đầy đủ</option><option value="low">Chỉ in độ phân giải thấp</option><option value="none">Không cho in</option></select></label>
      <label className="field"><span>Quyền chỉnh sửa</span><select value={modifyMode} onChange={(e)=>setModifyMode(e.target.value as ModifyMode)}><option value="all">Cho phép đầy đủ</option><option value="annotate">Cho annotate + form + sắp xếp trang</option><option value="form">Cho điền form/ký + sắp xếp trang</option><option value="assembly">Chỉ sắp xếp/chèn/xóa trang</option><option value="none">Không cho chỉnh sửa</option></select></label>
      <label className="field"><span>Trích xuất / sao chép text và hình</span><select value={allowExtract ? 'yes' : 'no'} onChange={(e)=>setAllowExtract(e.target.value === 'yes')}><option value="yes">Cho phép</option><option value="no">Không cho phép</option></select></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Nếu bỏ trống owner password, backend tạo một owner password ngẫu nhiên khác mật khẩu mở file để restriction không bị vô hiệu. Quyền PDF là cơ chế của chuẩn PDF và chỉ được thực thi bởi trình đọc tuân thủ; đây không phải DRM chống sao chép tuyệt đối.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || !password || busy}>{busy ? 'Đang mã hóa…' : 'Mã hóa và tải PDF'}</button>
    </section>
  </main>;
}
