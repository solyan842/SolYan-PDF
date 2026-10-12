const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
const GROUPS = ['', 'nghìn', 'triệu', 'tỷ'];

function readThreeDigits(value: number, forceHundreds = false): string {
  const hundreds = Math.floor(value / 100);
  const tens = Math.floor((value % 100) / 10);
  const units = value % 10;
  const parts: string[] = [];

  if (hundreds > 0 || forceHundreds) {
    parts.push(DIGITS[hundreds], 'trăm');
    if (tens === 0 && units > 0) parts.push('lẻ');
  }

  if (tens > 1) {
    parts.push(DIGITS[tens], 'mươi');
    if (units === 1) parts.push('mốt');
    else if (units === 4) parts.push('tư');
    else if (units === 5) parts.push('lăm');
    else if (units > 0) parts.push(DIGITS[units]);
  } else if (tens === 1) {
    parts.push('mười');
    if (units === 5) parts.push('lăm');
    else if (units > 0) parts.push(DIGITS[units]);
  } else if (units > 0 && (hundreds > 0 || !forceHundreds)) {
    parts.push(DIGITS[units]);
  }

  return parts.join(' ');
}

export function numberToVietnameseCurrency(input: string | number): string {
  const normalized = String(input).replace(/[\s.,]/g, '');
  if (!/^\d+$/.test(normalized)) throw new Error('Chỉ nhập số nguyên không âm.');
  const value = BigInt(normalized);
  if (value === 0n) return 'Không đồng';

  const chunks: number[] = [];
  let remaining = value;
  while (remaining > 0n) {
    chunks.push(Number(remaining % 1000n));
    remaining /= 1000n;
  }

  const parts: string[] = [];
  for (let i = chunks.length - 1; i >= 0; i -= 1) {
    const chunk = chunks[i];
    if (chunk === 0) continue;
    const forceHundreds = i < chunks.length - 1 && chunk < 100;
    parts.push(readThreeDigits(chunk, forceHundreds));

    const groupIndex = i % 3;
    const billionLevel = Math.floor(i / 3);
    if (groupIndex > 0) parts.push(GROUPS[groupIndex]);
    if (billionLevel > 0) parts.push(Array(billionLevel).fill('tỷ').join(' '));
  }

  const sentence = parts.join(' ').replace(/\s+/g, ' ').trim();
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)} đồng`;
}

export function removeVietnameseDiacritics(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function textStats(value: string) {
  const trimmed = value.trim();
  const words = trimmed ? trimmed.split(/\s+/u).length : 0;
  return {
    characters: value.length,
    charactersNoSpaces: value.replace(/\s/g, '').length,
    words,
    lines: value ? value.split(/\r?\n/).length : 0,
  };
}

export function vatFromNet(net: number, rate: number) {
  const vat = net * rate / 100;
  return { net, vat, gross: net + vat };
}

export function vatFromGross(gross: number, rate: number) {
  const net = gross / (1 + rate / 100);
  return { net, vat: gross - net, gross };
}

export function percentageOf(value: number, percent: number) {
  return value * percent / 100;
}

export function percentageChange(from: number, to: number) {
  if (from === 0) throw new Error('Giá trị ban đầu phải khác 0.');
  return ((to - from) / Math.abs(from)) * 100;
}

export function exactAge(birthDate: string, now = new Date()) {
  const birth = new Date(`${birthDate}T00:00:00`);
  if (Number.isNaN(birth.getTime()) || birth > now) throw new Error('Ngày sinh không hợp lệ.');
  let years = now.getFullYear() - birth.getFullYear();
  let months = now.getMonth() - birth.getMonth();
  let days = now.getDate() - birth.getDate();
  if (days < 0) {
    months -= 1;
    const previousMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    days += previousMonthDays;
  }
  if (months < 0) { years -= 1; months += 12; }
  return { years, months, days, totalDays: Math.floor((now.getTime() - birth.getTime()) / 86400000) };
}

export function bmi(weightKg: number, heightCm: number) {
  if (weightKg <= 0 || heightCm <= 0) throw new Error('Chiều cao/cân nặng phải lớn hơn 0.');
  const value = weightKg / ((heightCm / 100) ** 2);
  const category = value < 18.5 ? 'Thiếu cân' : value < 23 ? 'Bình thường (chuẩn châu Á)' : value < 25 ? 'Thừa cân' : value < 30 ? 'Béo phì độ I' : 'Béo phì độ II+';
  return { value, category };
}

export function acCapacityBtu(areaM2: number, ceilingM = 3, sunLevel = 1) {
  if (areaM2 <= 0 || ceilingM <= 0) throw new Error('Diện tích và chiều cao phải lớn hơn 0.');
  const volume = areaM2 * ceilingM;
  const factor = 200 * Math.max(0.8, Math.min(1.4, sunLevel));
  const btu = Math.round(volume * factor / 500) * 500;
  const hp = btu / 9000;
  return { btu, hp };
}
