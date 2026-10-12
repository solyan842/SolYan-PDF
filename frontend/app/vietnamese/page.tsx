'use client';

import { useMemo, useState } from 'react';
import {
  acCapacityBtu,
  bmi,
  exactAge,
  numberToVietnameseCurrency,
  percentageChange,
  percentageOf,
  removeVietnameseDiacritics,
  textStats,
  vatFromGross,
  vatFromNet,
} from '../../lib/vn-utils';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8000';

function money(value: number) {
  return Number.isFinite(value) ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value) : '—';
}

export default function VietnameseUtilitiesPage() {
  const [numberInput, setNumberInput] = useState('1234567');
  const [text, setText] = useState('Xin chào Việt Nam');
  const [vatMode, setVatMode] = useState<'net' | 'gross'>('net');
  const [vatValue, setVatValue] = useState(1000000);
  const [vatRate, setVatRate] = useState(10);
  const [percentValue, setPercentValue] = useState(1000000);
  const [percent, setPercent] = useState(10);
  const [changeFrom, setChangeFrom] = useState(100);
  const [changeTo, setChangeTo] = useState(120);
  const [birthDate, setBirthDate] = useState('1990-01-01');
  const [weight, setWeight] = useState(60);
  const [height, setHeight] = useState(165);
  const [area, setArea] = useState(20);
  const [ceiling, setCeiling] = useState(3);
  const [sun, setSun] = useState(1);
  const [networkResult, setNetworkResult] = useState('');
  const [networkBusy, setNetworkBusy] = useState(false);
  const [host, setHost] = useState('google.com');
  const [keyword, setKeyword] = useState('pdf tools');
  const [domain, setDomain] = useState('example.com');

  const stats = useMemo(() => textStats(text), [text]);
  const vat = useMemo(() => vatMode === 'net' ? vatFromNet(vatValue, vatRate) : vatFromGross(vatValue, vatRate), [vatMode, vatValue, vatRate]);

  async function network(path: string, body?: Record<string, string>) {
    setNetworkBusy(true); setNetworkResult('');
    try {
      const response = await fetch(`${API_BASE}${path}`, body ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : undefined);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail ?? `HTTP ${response.status}`);
      setNetworkResult(JSON.stringify(data, null, 2));
    } catch (cause) {
      setNetworkResult(cause instanceof Error ? `Lỗi: ${cause.message}` : 'Lỗi mạng');
    } finally { setNetworkBusy(false); }
  }

  let numberWords = '';
  try { numberWords = numberToVietnameseCurrency(numberInput); } catch (error) { numberWords = error instanceof Error ? error.message : ''; }

  let ageText = '';
  try { const age = exactAge(birthDate); ageText = `${age.years} năm ${age.months} tháng ${age.days} ngày · ${age.totalDays.toLocaleString('vi-VN')} ngày`; } catch (error) { ageText = error instanceof Error ? error.message : ''; }

  let bmiText = '';
  try { const result = bmi(weight, height); bmiText = `${result.value.toFixed(1)} · ${result.category}`; } catch (error) { bmiText = error instanceof Error ? error.message : ''; }

  let acText = '';
  try { const result = acCapacityBtu(area, ceiling, sun); acText = `Khoảng ${result.btu.toLocaleString('vi-VN')} BTU · ${result.hp.toFixed(1)} HP`; } catch (error) { acText = error instanceof Error ? error.message : ''; }

  return <main className="shell">
    <header className="topbar"><a className="brand" href="/">SolYan PDF</a><div className="privacy-pill">Tiện ích Việt Nam</div></header>
    <section className="hero compact-hero"><p className="eyebrow">13 TIỆN ÍCH VIỆT NAM</p><h1>Tiện ích Việt Nam</h1><p className="subtitle">Văn bản, tính toán và tiện ích Internet dành cho người dùng Việt Nam.</p></section>

    <section className="utility-grid">
      <article className="utility-card"><h2>Đổi số tiền thành chữ</h2><label className="field"><span>Số tiền</span><input value={numberInput} onChange={(e)=>setNumberInput(e.target.value)} /></label><div className="result-box">{numberWords}</div></article>

      <article className="utility-card"><h2>Bỏ dấu tiếng Việt</h2><label className="field"><span>Văn bản</span><textarea value={text} onChange={(e)=>setText(e.target.value)} /></label><div className="result-box">{removeVietnameseDiacritics(text)}</div></article>

      <article className="utility-card"><h2>Chữ hoa / chữ thường</h2><div className="result-box"><b>HOA:</b> {text.toLocaleUpperCase('vi-VN')}<br/><b>thường:</b> {text.toLocaleLowerCase('vi-VN')}</div></article>

      <article className="utility-card"><h2>Đếm từ & ký tự</h2><div className="metric-row"><span>Từ <b>{stats.words}</b></span><span>Ký tự <b>{stats.characters}</b></span><span>Không khoảng trắng <b>{stats.charactersNoSpaces}</b></span><span>Dòng <b>{stats.lines}</b></span></div></article>

      <article className="utility-card"><h2>Tính VAT</h2><div className="inline-controls"><select value={vatMode} onChange={(e)=>setVatMode(e.target.value as 'net'|'gross')}><option value="net">Giá chưa VAT</option><option value="gross">Giá đã VAT</option></select><input type="number" value={vatRate} onChange={(e)=>setVatRate(Number(e.target.value))}/><span>%</span></div><label className="field"><span>Giá trị</span><input type="number" value={vatValue} onChange={(e)=>setVatValue(Number(e.target.value))}/></label><div className="result-box">Trước VAT: {money(vat.net)} · VAT: {money(vat.vat)} · Sau VAT: {money(vat.gross)}</div></article>

      <article className="utility-card"><h2>Tính phần trăm</h2><div className="inline-controls"><input type="number" value={percent} onChange={(e)=>setPercent(Number(e.target.value))}/><span>% của</span><input type="number" value={percentValue} onChange={(e)=>setPercentValue(Number(e.target.value))}/></div><div className="result-box">{money(percentageOf(percentValue, percent))}</div><div className="inline-controls"><input type="number" value={changeFrom} onChange={(e)=>setChangeFrom(Number(e.target.value))}/><span>→</span><input type="number" value={changeTo} onChange={(e)=>setChangeTo(Number(e.target.value))}/></div><div className="result-box">Thay đổi: {changeFrom === 0 ? '—' : `${percentageChange(changeFrom, changeTo).toFixed(2)}%`}</div></article>

      <article className="utility-card"><h2>Tính tuổi</h2><label className="field"><span>Ngày sinh</span><input type="date" value={birthDate} onChange={(e)=>setBirthDate(e.target.value)}/></label><div className="result-box">{ageText}</div></article>

      <article className="utility-card"><h2>BMI / cân nặng</h2><div className="inline-controls"><input type="number" value={weight} onChange={(e)=>setWeight(Number(e.target.value))}/><span>kg</span><input type="number" value={height} onChange={(e)=>setHeight(Number(e.target.value))}/><span>cm</span></div><div className="result-box">{bmiText}</div></article>

      <article className="utility-card"><h2>Công suất điều hòa</h2><div className="inline-controls"><input type="number" value={area} onChange={(e)=>setArea(Number(e.target.value))}/><span>m²</span><input type="number" step="0.1" value={ceiling} onChange={(e)=>setCeiling(Number(e.target.value))}/><span>m cao</span></div><label className="field"><span>Mức nắng/nhiệt tải (0.8–1.4)</span><input type="number" min="0.8" max="1.4" step="0.1" value={sun} onChange={(e)=>setSun(Number(e.target.value))}/></label><div className="result-box">{acText}</div></article>

      <article className="utility-card"><h2>Xem địa chỉ IP Internet</h2><button className="ghost wide" type="button" disabled={networkBusy} onClick={()=>network('/net/ip')}>Xem IP</button></article>

      <article className="utility-card"><h2>Ping IP / website</h2><label className="field"><span>Host</span><input value={host} onChange={(e)=>setHost(e.target.value)}/></label><button className="ghost wide" type="button" disabled={networkBusy} onClick={()=>network('/net/ping',{host})}>Ping</button></article>

      <article className="utility-card"><h2>Vị trí từ khóa Google</h2><label className="field"><span>Từ khóa</span><input value={keyword} onChange={(e)=>setKeyword(e.target.value)}/></label><label className="field"><span>Domain</span><input value={domain} onChange={(e)=>setDomain(e.target.value)}/></label><button className="ghost wide" type="button" disabled={networkBusy} onClick={()=>network('/net/keyword-position',{keyword,domain})}>Kiểm tra</button></article>

      <article className="utility-card"><h2>Thứ hạng website</h2><label className="field"><span>Domain</span><input value={domain} onChange={(e)=>setDomain(e.target.value)}/></label><button className="ghost wide" type="button" disabled={networkBusy} onClick={()=>network('/net/site-rank',{domain})}>Kiểm tra rank</button></article>
    </section>

    <section className="workspace network-output"><h2>Kết quả tiện ích Internet</h2><pre>{networkResult || 'Chưa có kết quả.'}</pre></section>
    <footer>SolYan PDF · Tiện ích Việt Nam</footer>
  </main>;
}
