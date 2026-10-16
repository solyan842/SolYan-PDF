'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

type TranslationService = {
  id: string;
  local: boolean;
  requires_operator_configuration: boolean;
};

type Capabilities = {
  engine: string;
  default_service: string;
  services: TranslationService[];
  max_file_size: number;
};

const LANGUAGE_OPTIONS = [
  ['en', 'English'],
  ['vi', 'Tiếng Việt'],
  ['zh', '中文'],
  ['ja', '日本語'],
  ['ko', '한국어'],
  ['fr', 'Français'],
  ['de', 'Deutsch'],
  ['es', 'Español'],
  ['pt', 'Português'],
  ['ru', 'Русский'],
] as const;

const SERVICE_LABELS: Record<string, string> = {
  argos: 'Argos · Local / Free',
  ollama: 'Ollama · Local LLM',
  openai: 'OpenAI · Cloud',
  deepl: 'DeepL · Cloud',
  google: 'Google · Online',
  bing: 'Bing · Online',
};

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

export default function TranslatePage() {
  const [file, setFile] = useState<File | null>(null);
  const [sourceLanguage, setSourceLanguage] = useState('en');
  const [targetLanguage, setTargetLanguage] = useState('vi');
  const [service, setService] = useState('argos');
  const [outputMode, setOutputMode] = useState('translated');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/pdf/translate/capabilities`)
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Capabilities>;
      })
      .then((payload) => {
        if (cancelled) return;
        setCapabilities(payload);
        if (payload.default_service) setService(payload.default_service);
      })
      .catch(() => {
        if (!cancelled) setCapabilities(null);
      });
    return () => { cancelled = true; };
  }, []);

  const services = useMemo<TranslationService[]>(() => {
    if (capabilities?.services?.length) return capabilities.services;
    return [{ id: 'argos', local: true, requires_operator_configuration: false }];
  }, [capabilities]);

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

  function swapLanguages() {
    setSourceLanguage(targetLanguage);
    setTargetLanguage(sourceLanguage);
  }

  async function run() {
    if (!file) return;
    if (sourceLanguage === targetLanguage) {
      setError('Ngôn ngữ nguồn và ngôn ngữ đích phải khác nhau.');
      return;
    }

    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('source_language', sourceLanguage);
      body.append('target_language', targetLanguage);
      body.append('service', service);
      body.append('output_mode', outputMode);
      body.append('thread_count', '2');

      const response = await fetch(`${API_BASE}/pdf/translate`, { method: 'POST', body });
      if (!response.ok) {
        let message = `HTTP ${response.status}`;
        try {
          const payload = await response.json();
          message = payload.detail ?? message;
        } catch {}
        throw new Error(message);
      }

      const isLocal = response.headers.get('X-SolYan-Translation-Local') === '1';
      const usedService = response.headers.get('X-SolYan-Translation-Service') ?? service;
      const filename = outputMode === 'bilingual' ? 'solyan-translated-bilingual.pdf' : 'solyan-translated.pdf';
      downloadBlob(await response.blob(), filename);
      setResult(`Đã dịch bằng ${usedService}${isLocal ? ' · xử lý local' : ' · dịch vụ có thể dùng mạng ngoài'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể dịch PDF.');
    } finally {
      setBusy(false);
    }
  }

  const selectedService = services.find((item) => item.id === service);

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill server-pill">Hybrid · Local first</div></header>
    <section className="hero compact-hero">
      <p className="eyebrow">TRANSLATE · V1.6</p>
      <h1>Dịch PDF giữ bố cục</h1>
      <p className="subtitle">Hybrid translation: Argos/Ollama cho chế độ local miễn phí; OpenAI, DeepL, Google hoặc Bing là lựa chọn online khi deployment cho phép.</p>
      <label className="picker"><input type="file" accept="application/pdf,.pdf" onChange={onFile}/><span>+ Chọn file PDF</span></label>
    </section>

    <section className="workspace form-workspace">
      {file && <p className="selected-file">Đã chọn: <strong>{file.name}</strong></p>}
      <div className="form-grid two-col">
        <label className="field"><span>Ngôn ngữ nguồn</span><select value={sourceLanguage} onChange={(e)=>setSourceLanguage(e.target.value)}>{LANGUAGE_OPTIONS.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label>
        <label className="field"><span>Ngôn ngữ đích</span><select value={targetLanguage} onChange={(e)=>setTargetLanguage(e.target.value)}>{LANGUAGE_OPTIONS.map(([code, label]) => <option value={code} key={code}>{label}</option>)}</select></label>
      </div>
      <button className="secondary-button" type="button" onClick={swapLanguages} disabled={busy}>Đổi chiều dịch ↔</button>

      <div className="form-grid two-col">
        <label className="field"><span>Engine dịch</span><select value={service} onChange={(e)=>setService(e.target.value)}>{services.map((item) => <option value={item.id} key={item.id}>{SERVICE_LABELS[item.id] ?? item.id}{item.local ? ' · Local' : ''}</option>)}</select></label>
        <label className="field"><span>Đầu ra</span><select value={outputMode} onChange={(e)=>setOutputMode(e.target.value)}><option value="translated">PDF đã dịch</option><option value="bilingual">PDF song ngữ</option></select></label>
      </div>

      <p className="hint"><strong>Free:</strong> Argos không cần tài khoản/API key nhưng translation service phải cài extra <code>argostranslate</code> và model ngôn ngữ. Ollama cũng không cần cloud account nếu model chạy local.</p>
      {selectedService && !selectedService.local && <p className="hint"><strong>Quyền riêng tư:</strong> engine này có thể gửi phần text của tài liệu sang dịch vụ bên ngoài. SolYan không nhận API key từ trình duyệt; credential chỉ cấu hình ở translation service của deployment.</p>}
      <p className="hint">SolYan core chỉ dùng adapter HTTP. PDFMathTranslate/BabelDOC là engine tách biệt để không trộn AGPL vào Apache-2.0 core.</p>

      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}
      <button className="merge-button" type="button" onClick={run} disabled={!file || busy}>{busy ? 'Đang dịch PDF…' : 'Dịch PDF và tải xuống'}</button>
    </section>
  </main>;
}
