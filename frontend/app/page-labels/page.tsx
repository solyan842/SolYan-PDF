'use client';

import { ChangeEvent, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_RULES = 20;

type LabelStyle = 'decimal' | 'upper_roman' | 'lower_roman' | 'upper_alpha' | 'lower_alpha' | 'none';
type LabelRule = {
  first_page: number;
  style: LabelStyle;
  start: number;
  prefix: string;
};

const STYLE_LABELS: Record<LabelStyle, string> = {
  decimal: '1, 2, 3…',
  upper_roman: 'I, II, III…',
  lower_roman: 'i, ii, iii…',
  upper_alpha: 'A, B, C…',
  lower_alpha: 'a, b, c…',
  none: 'Không hiện số',
};

async function responseError(response: Response) {
  try {
    const payload = await response.json();
    return payload.detail ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

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

export default function PageLabelsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<'set' | 'remove'>('set');
  const [rules, setRules] = useState<LabelRule[]>([
    { first_page: 1, style: 'decimal', start: 1, prefix: '' },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

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
    setResult('');
  }

  function updateRule(index: number, patch: Partial<LabelRule>) {
    setRules((current) => current.map((rule, i) => i === index ? { ...rule, ...patch } : rule));
    setError('');
    setResult('');
  }

  function addRule() {
    if (rules.length >= MAX_RULES) return;
    const last = rules[rules.length - 1];
    setRules((current) => [...current, {
      first_page: Math.max(2, (last?.first_page ?? 1) + 1),
      style: 'decimal',
      start: 1,
      prefix: '',
    }]);
  }

  function removeRule(index: number) {
    if (index === 0) return;
    setRules((current) => current.filter((_, i) => i !== index));
  }

  async function applyLabels() {
    if (!file) return;
    if (mode === 'set') {
      if (!rules.length || rules[0].first_page !== 1) {
        setError('Rule đầu tiên bắt buộc bắt đầu ở trang vật lý 1.');
        return;
      }
      if (rules.some((rule) => rule.first_page < 1 || rule.start < 1)) {
        setError('Trang bắt đầu và số bắt đầu phải từ 1 trở lên.');
        return;
      }
      if (rules.some((rule) => /[\/\r\n\0]/.test(rule.prefix))) {
        setError('Prefix không được chứa dấu /, NUL hoặc xuống dòng.');
        return;
      }
      for (let index = 1; index < rules.length; index += 1) {
        if (rules[index].first_page <= rules[index - 1].first_page) {
          setError('Các rule phải có trang bắt đầu tăng dần.');
          return;
        }
      }
    }

    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('mode', mode);
      body.append('rules_json', JSON.stringify(rules));
      const response = await fetch(`${API_BASE}/pdf/page-labels`, { method: 'POST', body });
      if (!response.ok) throw new Error(await responseError(response));
      const state = response.headers.get('X-SolYan-Page-Labels') ?? mode;
      downloadBlob(
        await response.blob(),
        mode === 'remove' ? 'solyan-page-labels-removed.pdf' : 'solyan-page-labeled.pdf',
      );
      setResult(state === 'removed' ? 'Đã xóa toàn bộ Page Labels và tải PDF.' : 'Đã đặt Page Labels và tải PDF.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể cập nhật Page Labels.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">qpdf · /PageLabels</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">PAGE LABELS · V1.5</p>
      <h1>Đánh nhãn trang PDF</h1>
      <p className="subtitle">Đặt số trang logic hiển thị trong PDF reader mà không in thêm chữ lên nội dung trang: Roman cho phần mở đầu, số Ả Rập cho nội dung chính, alphabet hoặc prefix tùy ý.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      <label className="field"><span>Thao tác</span><select value={mode} onChange={(event)=>setMode(event.target.value as 'set' | 'remove')}><option value="set">Đặt / thay thế Page Labels</option><option value="remove">Xóa toàn bộ Page Labels</option></select></label>

      {mode === 'set' && <>
        <div className="result-box"><strong>Quy tắc theo đoạn trang</strong><p style={{ marginBottom: 0 }}>Rule đầu tiên phải bắt đầu ở trang vật lý 1. Mỗi rule áp dụng từ trang đó đến trước rule kế tiếp.</p></div>
        <div style={{ display: 'grid', gap: 12 }}>
          {rules.map((rule, index) => <div className="result-box" style={{ margin: 0 }} key={index}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
              <label className="field"><span>Trang vật lý bắt đầu</span><input type="number" min={1} value={rule.first_page} disabled={index === 0} onChange={(event)=>updateRule(index, { first_page: Number(event.target.value) || 1 })}/></label>
              <label className="field"><span>Kiểu nhãn</span><select value={rule.style} onChange={(event)=>updateRule(index, { style: event.target.value as LabelStyle })}>{(Object.keys(STYLE_LABELS) as LabelStyle[]).map((style)=><option value={style} key={style}>{STYLE_LABELS[style]}</option>)}</select></label>
              <label className="field"><span>Số bắt đầu</span><input type="number" min={1} value={rule.start} disabled={rule.style === 'none'} onChange={(event)=>updateRule(index, { start: Number(event.target.value) || 1 })}/></label>
              <label className="field"><span>Prefix</span><input maxLength={64} value={rule.prefix} onChange={(event)=>updateRule(index, { prefix: event.target.value })} placeholder="VD: A- hoặc Phụ lục-"/></label>
            </div>
            {index > 0 && <button type="button" className="secondary-button" onClick={()=>removeRule(index)}>Xóa rule này</button>}
          </div>)}
        </div>
        <button type="button" className="secondary-button" onClick={addRule} disabled={rules.length >= MAX_RULES}>+ Thêm đoạn ({rules.length}/{MAX_RULES})</button>
      </>}

      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <p className="hint">Page Labels chỉ thay đổi cách reader gọi/hiển thị số trang; không đóng số lên bề mặt PDF và không thay đổi số lượng trang vật lý. PDF có mật khẩu cần mở khóa trước khi dùng công cụ này.</p>
      <p className="hint">Ví dụ sách: rule 1 = trang 1, Roman thường, bắt đầu 1 → i, ii, iii…; rule 2 = trang 5, số Ả Rập, bắt đầu 1 → trang vật lý 5 được hiển thị là 1.</p>
      {result && <div className="success">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={applyLabels} disabled={!file || busy}>{busy ? 'Đang cập nhật…' : (mode === 'remove' ? 'Xóa Page Labels và tải PDF' : 'Đặt Page Labels và tải PDF')}</button>
    </section>
  </main>;
}
