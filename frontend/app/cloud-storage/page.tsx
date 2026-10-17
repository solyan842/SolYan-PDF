'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

type ProviderStatus = {
  id: 'google' | 'onedrive';
  label: string;
  configured: boolean;
  connected: boolean;
  scopes: string[];
  picker_configured?: boolean;
  least_privilege_scope?: string;
  supports: { list: boolean; download: boolean; upload: boolean; replace: boolean };
};

type ProviderPayload = {
  providers: ProviderStatus[];
  max_file_size: number;
  session_storage: string;
  credentials_required_for_build: boolean;
};

type CloudItem = {
  id: string;
  name: string;
  kind: 'folder' | 'pdf';
  size: number | null;
  modified_at: string | null;
  web_url: string | null;
};

type FolderCrumb = { id: string; name: string };

function formatBytes(value: number | null) {
  if (value === null) return '—';
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
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

async function errorMessage(response: Response) {
  try {
    const payload = await response.json() as { detail?: string };
    return payload.detail ?? `HTTP ${response.status}`;
  } catch {
    return `HTTP ${response.status}`;
  }
}

export default function CloudStoragePage() {
  const [providers, setProviders] = useState<ProviderStatus[]>([]);
  const [selectedProvider, setSelectedProvider] = useState<'google' | 'onedrive'>('google');
  const [items, setItems] = useState<CloudItem[]>([]);
  const [crumbs, setCrumbs] = useState<FolderCrumb[]>([{ id: 'root', name: 'Root' }]);
  const [maxFileSize, setMaxFileSize] = useState(100 * 1024 * 1024);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  const provider = useMemo(
    () => providers.find((item) => item.id === selectedProvider) ?? null,
    [providers, selectedProvider],
  );
  const currentFolder = crumbs[crumbs.length - 1] ?? { id: 'root', name: 'Root' };

  async function refreshProviders() {
    const response = await fetch(`${API_BASE}/storage/providers`, {
      credentials: 'include',
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(await errorMessage(response));
    const payload = await response.json() as ProviderPayload;
    setProviders(payload.providers);
    setMaxFileSize(payload.max_file_size);
    return payload.providers;
  }

  async function loadFiles(providerId = selectedProvider, folderId = currentFolder.id) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `${API_BASE}/storage/${providerId}/files?folder_id=${encodeURIComponent(folderId)}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      const payload = await response.json() as { items: CloudItem[] };
      setItems(payload.items);
    } catch (cause) {
      setItems([]);
      setError(cause instanceof Error ? cause.message : 'Không thể đọc Cloud Storage.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    refreshProviders()
      .then((state) => {
        if (cancelled) return;
        const connected = state.find((item) => item.connected);
        if (connected) {
          setSelectedProvider(connected.id);
          void loadFiles(connected.id, 'root');
        }
      })
      .catch((cause) => {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Không thể đọc trạng thái Cloud Storage.');
      });

    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === '1') setResult('Đã kết nối Cloud Storage.');
    if (params.get('error')) setError('Kết nối OAuth không hoàn tất. Vui lòng thử lại.');
    return () => { cancelled = true; };
    // Initial provider/session discovery only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function chooseProvider(providerId: 'google' | 'onedrive') {
    setSelectedProvider(providerId);
    setCrumbs([{ id: 'root', name: 'Root' }]);
    setItems([]);
    setError('');
    setResult('');
    const next = providers.find((item) => item.id === providerId);
    if (next?.connected) void loadFiles(providerId, 'root');
  }

  function connect(providerId: 'google' | 'onedrive') {
    window.location.assign(
      `${API_BASE}/storage/${providerId}/auth/start?return_path=${encodeURIComponent('/cloud-storage')}`,
    );
  }

  async function logout(providerId: 'google' | 'onedrive') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE}/storage/${providerId}/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      await refreshProviders();
      setItems([]);
      setCrumbs([{ id: 'root', name: 'Root' }]);
      setResult(`Đã ngắt kết nối ${providerId === 'google' ? 'Google Drive' : 'OneDrive'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể ngắt kết nối.');
    } finally {
      setBusy(false);
    }
  }

  async function enterFolder(item: CloudItem) {
    const next = [...crumbs, { id: item.id, name: item.name }];
    setCrumbs(next);
    await loadFiles(selectedProvider, item.id);
  }

  async function goBack() {
    if (crumbs.length <= 1) return;
    const next = crumbs.slice(0, -1);
    setCrumbs(next);
    await loadFiles(selectedProvider, next[next.length - 1]?.id ?? 'root');
  }

  async function download(item: CloudItem) {
    setBusy(true);
    setError('');
    setResult('');
    try {
      const response = await fetch(
        `${API_BASE}/storage/${selectedProvider}/files/${encodeURIComponent(item.id)}`,
        { credentials: 'include', cache: 'no-store' },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      downloadBlob(await response.blob(), item.name);
      setResult(`Đã tải ${item.name}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể tải PDF từ cloud.');
    } finally {
      setBusy(false);
    }
  }

  async function upload(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('V1.7 chỉ nhận file PDF.');
      return;
    }
    if (file.size > maxFileSize) {
      setError(`PDF vượt giới hạn ${formatBytes(maxFileSize)}.`);
      return;
    }
    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      body.append('folder_id', currentFolder.id);
      const response = await fetch(`${API_BASE}/storage/${selectedProvider}/files`, {
        method: 'POST',
        body,
        credentials: 'include',
      });
      if (!response.ok) throw new Error(await errorMessage(response));
      setResult(`Đã lưu ${file.name} lên ${provider?.label ?? 'cloud'}.`);
      await loadFiles(selectedProvider, currentFolder.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể upload PDF.');
    } finally {
      setBusy(false);
    }
  }

  async function replace(item: CloudItem, event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0] ?? null;
    input.value = '';
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('V1.7 chỉ nhận file PDF.');
      return;
    }
    if (file.size > maxFileSize) {
      setError(`PDF vượt giới hạn ${formatBytes(maxFileSize)}.`);
      return;
    }
    if (!window.confirm(`Ghi đè nội dung của “${item.name}” bằng file đã chọn? Thao tác này thay đổi file trên cloud.`)) return;

    setBusy(true);
    setError('');
    setResult('');
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch(
        `${API_BASE}/storage/${selectedProvider}/files/${encodeURIComponent(item.id)}/replace`,
        { method: 'POST', body, credentials: 'include' },
      );
      if (!response.ok) throw new Error(await errorMessage(response));
      setResult(`Đã cập nhật ${item.name}.`);
      await loadFiles(selectedProvider, currentFolder.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể ghi đè PDF trên cloud.');
    } finally {
      setBusy(false);
    }
  }

  return <main className="shell">
    <header className="topbar">
      <a className="brand" href="/">SolYan PDF</a>
      <div className="privacy-pill server-pill">OAuth · Server-side tokens</div>
    </header>

    <section className="hero compact-hero">
      <p className="eyebrow">CLOUD STORAGE · V1.7</p>
      <h1>Google Drive & OneDrive</h1>
      <p className="subtitle">Mở, tải và lưu PDF qua cloud mà không đưa client secret hoặc refresh token xuống trình duyệt.</p>
    </section>

    <section className="workspace form-workspace">
      <div className="form-grid two-col">
        {providers.map((item) => <button
          type="button"
          key={item.id}
          className={selectedProvider === item.id ? 'merge-button' : 'secondary-button'}
          onClick={() => chooseProvider(item.id)}
          disabled={busy}
        >
          {item.label} · {!item.configured ? 'Chưa cấu hình' : item.connected ? 'Đã kết nối' : 'Sẵn sàng kết nối'}
        </button>)}
      </div>

      {!provider && <p className="hint">Đang đọc cấu hình Cloud Storage…</p>}

      {provider && !provider.configured && <div className="result-box">
        <strong>{provider.label} chưa được cấu hình.</strong><br/>
        Deployment cần OAuth Client ID/Secret tương ứng trong biến môi trường. SolYan vẫn build và chạy bình thường khi bỏ trống credential.
      </div>}

      {provider?.configured && !provider.connected && <div>
        <p className="hint">
          {provider.id === 'google'
            ? 'Google Drive dùng scope drive.file: SolYan chỉ thấy file được ứng dụng tạo hoặc được người dùng cấp cho ứng dụng; không tự xin quyền toàn bộ Drive.'
            : 'OneDrive dùng Microsoft Graph delegated Files.ReadWrite + offline_access. Token được giữ trong session phía server.'}
        </p>
        <button className="merge-button" type="button" onClick={() => connect(provider.id)} disabled={busy}>
          Kết nối {provider.label}
        </button>
      </div>}

      {provider?.connected && <>
        <div className="form-grid two-col">
          <div>
            <p className="hint"><strong>Thư mục:</strong> {crumbs.map((crumb) => crumb.name).join(' / ')}</p>
            <button className="secondary-button" type="button" onClick={goBack} disabled={busy || crumbs.length <= 1}>← Lên một cấp</button>
          </div>
          <div>
            <label className="picker">
              <input type="file" accept="application/pdf,.pdf" onChange={upload} disabled={busy}/>
              <span>+ Upload PDF vào thư mục này</span>
            </label>
          </div>
        </div>

        {provider.id === 'google' && <p className="hint">
          <strong>Quyền tối thiểu:</strong> <code>drive.file</code>. {provider.picker_configured
            ? 'Deployment đã có cấu hình Google Picker; backend chỉ cấp access token ngắn hạn khi UI Picker được gọi, refresh token vẫn ở server.'
            : 'Muốn chọn PDF có sẵn ngoài phạm vi app-visible, operator có thể cấu hình Google Picker API key/App ID mà không cần mở rộng sang full-Drive scope.'}
        </p>}

        <div className="result-box">
          <strong>{provider.label}</strong> · {items.length} mục PDF/thư mục · giới hạn {formatBytes(maxFileSize)}
        </div>

        {busy && <p className="hint">Đang xử lý Cloud Storage…</p>}
        {!busy && items.length === 0 && <p className="hint">Không có PDF/thư mục nào trong phạm vi ứng dụng ở vị trí này.</p>}

        <div className="tool-grid">
          {items.map((item) => <article className="tool-card" key={item.id}>
            <div className="tool-card-top">
              <h3>{item.kind === 'folder' ? '📁' : '📄'} {item.name}</h3>
              <span className="local-badge">{item.kind === 'folder' ? 'Folder' : formatBytes(item.size)}</span>
            </div>
            {item.modified_at && <p>{new Date(item.modified_at).toLocaleString('vi-VN')}</p>}
            {item.kind === 'folder' ? <button className="secondary-button" type="button" onClick={() => enterFolder(item)} disabled={busy}>Mở thư mục</button> : <>
              <button className="secondary-button" type="button" onClick={() => download(item)} disabled={busy}>Tải PDF</button>
              <label className="secondary-button">
                Ghi đè bằng PDF khác
                <input type="file" accept="application/pdf,.pdf" onChange={(event) => replace(item, event)} disabled={busy} hidden/>
              </label>
              {item.web_url && <a className="secondary-button" href={item.web_url} target="_blank" rel="noreferrer">Mở trên dịch vụ cloud</a>}
            </>}
          </article>)}
        </div>

        <button className="secondary-button" type="button" onClick={() => logout(provider.id)} disabled={busy}>Ngắt kết nối {provider.label}</button>
      </>}

      {result && <div className="result-box">{result}</div>}
      {error && <div className="error">{error}</div>}

      <p className="hint">Session OAuth V1.7 được giữ trong bộ nhớ server và mất khi backend restart. Deployment nhiều replica sẽ cần shared encrypted session store trước khi scale ngang.</p>
    </section>
  </main>;
}
