'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type Summary = {
  javascript: number;
  actions: number;
  triggers: number;
  activeAnnotations: number;
  attachmentReferences: number;
  reachableObjects: number;
};

type JavascriptItem = {
  name?: string | null;
  path: string;
  objectRef?: string | null;
  source: string;
  truncated: boolean;
  script?: string;
};

type Finding = {
  kind: string;
  actionType?: string;
  subtype?: string;
  key?: string;
  path: string;
  objectRef?: string | null;
  target?: string;
};

type Report = {
  hasActiveContent: boolean;
  summary: Summary;
  javascript: JavascriptItem[];
  findings: Finding[];
  findingsTruncated: boolean;
  limits: {
    maxFindings: number;
    maxScriptBytesEach: number;
    maxScriptBytesTotal: number;
  };
  note: string;
};

function readableToken(value?: string | null) {
  if (!value) return '—';
  return value.startsWith('/') ? value.slice(1) : value;
}

function findingLabel(item: Finding) {
  if (item.actionType) return `Action · ${readableToken(item.actionType)}`;
  if (item.subtype) return `Annotation · ${readableToken(item.subtype)}`;
  if (item.key) return `${item.kind} · ${readableToken(item.key)}`;
  return item.kind;
}

export default function ActiveContentPage() {
  const [file, setFile] = useState<File | null>(null);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);

  function onFile(event: ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    setError('');
    setReport(null);
    if (selected && selected.size > MAX_FILE_SIZE) {
      setFile(null);
      setError('PDF vượt giới hạn 100 MB.');
      event.target.value = '';
      return;
    }
    setFile(selected);
  }

  async function inspect() {
    if (!file) return;
    setBusy(true);
    setError('');
    setReport(null);
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('password', password);
      const response = await fetch(`${API_BASE}/pdf/inspect-active-content`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          message = payload.detail ?? message;
        } catch {}
        throw new Error(message);
      }
      setReport(await response.json() as Report);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể kiểm tra nội dung hoạt động trong PDF.');
    } finally {
      setBusy(false);
    }
  }

  const summaryItems = report ? [
    ['JavaScript', report.summary.javascript],
    ['Actions', report.summary.actions],
    ['Triggers', report.summary.triggers],
    ['Active annotations', report.summary.activeAnnotations],
    ['Attachment refs', report.summary.attachmentReferences],
    ['Objects đã duyệt', report.summary.reachableObjects],
  ] : [];

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf JSON · V1.2</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">INSPECT · SECURITY · V1.2</p>
      <h1>Kiểm tra JavaScript / Active Content</h1>
      <p className="subtitle">Quét cấu trúc PDF có thể truy cập để tìm JavaScript, actions, trigger, active annotation và tham chiếu file đính kèm — không thực thi JavaScript trong tài liệu.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      <label className="field"><span>Mật khẩu mở PDF (nếu có)</span><input type="password" maxLength={128} value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Để trống nếu PDF không mã hóa" autoComplete="off"/></label>
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Giới hạn 100 MB. Inspector chỉ đi từ trailer/root qua object graph có thể truy cập; object chết/không được tham chiếu không được xem là nội dung hoạt động. JavaScript được hiển thị dưới dạng text, không chạy trong trình duyệt.</p>
      <p className="hint"><strong>Giới hạn an toàn:</strong> đây là kiểm tra cấu trúc theo các vector PDF chuẩn đã biết, không phải antivirus và không thể chứng minh một PDF hoàn toàn an toàn.</p>
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={inspect} disabled={!file || busy}>{busy ? 'Đang kiểm tra…' : 'Kiểm tra Active Content'}</button>

      {report && <>
        <div className="result-box">
          <strong>{report.hasActiveContent ? 'Phát hiện cấu trúc cần xem xét' : 'Không phát hiện active content trong phạm vi kiểm tra'}</strong>
          <p>{report.hasActiveContent ? 'Hãy xem chi tiết bên dưới. Việc có finding không đồng nghĩa file chắc chắn độc hại.' : 'Kết quả này không phải bảo đảm an toàn tuyệt đối.'}</p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
          {summaryItems.map(([label, value]) => <div className="result-box" key={String(label)} style={{ margin: 0 }}><strong>{value}</strong><p style={{ marginBottom: 0 }}>{label}</p></div>)}
        </div>

        {report.javascript.length > 0 && <section style={{ marginTop: 22 }}>
          <h2>JavaScript tìm thấy</h2>
          <p className="hint">Chỉ hiển thị text; không thực thi. Mỗi script bị giới hạn {Math.round(report.limits.maxScriptBytesEach / 1024)} KiB, tổng tối đa {Math.round(report.limits.maxScriptBytesTotal / 1024)} KiB.</p>
          {report.javascript.map((item, index) => <div className="result-box" key={`${item.objectRef ?? item.path}-${index}`}>
            <strong>{item.name || `Script ${index + 1}`}</strong>
            <p>Source: {item.source} · Object: {item.objectRef ?? 'direct'} · {item.truncated ? 'đã cắt theo giới hạn' : 'đầy đủ trong giới hạn'}</p>
            <p className="hint" style={{ overflowWrap: 'anywhere' }}>{item.path}</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', overflowX: 'auto', maxHeight: 360, overflowY: 'auto', padding: 12, borderRadius: 10, background: 'rgba(127,127,127,0.08)' }}>{item.script ?? '[Không đọc được payload JavaScript]'}</pre>
          </div>)}
        </section>}

        {report.findings.length > 0 && <section style={{ marginTop: 22 }}>
          <h2>Findings cấu trúc</h2>
          {report.findingsTruncated && <div className="error">Danh sách đã đạt giới hạn {report.limits.maxFindings} findings; file có thể còn cấu trúc khác chưa hiển thị.</div>}
          <div style={{ display: 'grid', gap: 10 }}>
            {report.findings.map((item, index) => <div className="result-box" key={`${item.kind}-${item.path}-${index}`} style={{ margin: 0 }}>
              <strong>{findingLabel(item)}</strong>
              {item.target && <p>Target: <code>{item.target}</code></p>}
              <p className="hint" style={{ marginBottom: 0, overflowWrap: 'anywhere' }}>{item.objectRef ? `${item.objectRef} · ` : ''}{item.path}</p>
            </div>)}
          </div>
        </section>}

        {report.hasActiveContent && <div className="result-box" style={{ marginTop: 22 }}><strong>Muốn tạo bản đã loại các cấu trúc này?</strong><p>Công cụ Sanitization có thể loại JavaScript/actions, link, metadata và file đính kèm theo gate qpdf JSON riêng.</p><a className="feature-action" href="/sanitize">Mở Làm sạch PDF →</a></div>}
      </>}
    </section>
  </main>;
}
