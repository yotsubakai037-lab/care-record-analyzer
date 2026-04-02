'use strict';

const ExcelJS = require('exceljs');
const iconv = require('iconv-lite');

// シンプルケース列名 → 内部標準名
const COLUMN_MAP = {
  '利用者名': 'user_name', '利用者': 'user_name', '氏名': 'user_name',
  '日付': 'date', '記録日': 'date',
  '支援内容': 'support_content', '記録内容': 'support_content', '内容': 'support_content',
  '担当者': 'staff_name', '支援者': 'staff_name', '記録者': 'staff_name',
  '体温': 'temperature', 'バイタル': 'vitals', '血圧': 'blood_pressure', '脈拍': 'pulse',
  '食事量': 'meal_amount', '食事': 'meal',
  '睡眠時間': 'sleep_hours', '睡眠': 'sleep', '就寝時間': 'sleep_time', '起床時間': 'wake_time',
  '特記事項': 'notes', '備考': 'notes',
  '評価': 'assessment', 'カテゴリ': 'category',
};

/**
 * アップロードされたバッファをパースしてオブジェクト配列を返す
 * Excel は非同期のため Promise を返す
 */
async function parseFile(buffer, filename) {
  const lower = filename.toLowerCase();

  if (lower.endsWith('.csv')) {
    return parseCsv(buffer);
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    return await parseExcel(buffer);
  }
  throw new Error('対応していないファイル形式です（CSV または Excel）');
}

function parseCsv(buffer) {
  // Shift-JIS / UTF-8 両対応
  let text;
  for (const enc of ['utf-8', 'shift_jis', 'cp932']) {
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded.includes('�')) { text = decoded; break; }
    } catch (_) { /* try next */ }
  }
  if (!text) text = buffer.toString('utf-8');

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const headers = splitCsvLine(lines[0]);
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const vals = splitCsvLine(line);
    const obj = {};
    headers.forEach((h, idx) => {
      const key = COLUMN_MAP[h.trim()] || h.trim();
      obj[key] = (vals[idx] || '').trim();
    });
    rows.push(obj);
  }
  return rows;
}

function splitCsvLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (const ch of line) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ',' && !inQ) { result.push(cur); cur = ''; }
    else { cur += ch; }
  }
  result.push(cur);
  return result;
}

async function parseExcel(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows = [];
  let headers = [];

  ws.eachRow((row, rowNum) => {
    const vals = row.values.slice(1); // index 0 は空
    if (rowNum === 1) {
      headers = vals.map(v => String(v || '').trim());
    } else {
      const obj = {};
      headers.forEach((h, i) => {
        const key = COLUMN_MAP[h] || h;
        const v = vals[i];
        obj[key] = v instanceof Date ? v.toISOString().slice(0, 10) : String(v ?? '');
      });
      rows.push(obj);
    }
  });

  return rows;
}

/** サマリー情報を生成 */
function getSummary(rows) {
  const users = [...new Set(rows.map(r => r.user_name || r['利用者名'] || r['利用者']).filter(Boolean))];
  const staff = [...new Set(rows.map(r => r.staff_name || r['担当者']).filter(Boolean))];
  const dates = rows.map(r => r.date || r['日付']).filter(Boolean).sort();

  return {
    totalRecords: rows.length,
    users,
    staff,
    dateRange: dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null,
    columns: rows.length ? Object.keys(rows[0]) : [],
  };
}

/** AI分析用テキスト生成（最新200件） */
function prepareForAnalysis(rows) {
  const target = rows.slice(-200);
  return target.map(row =>
    Object.entries(row)
      .filter(([, v]) => v !== null && v !== undefined && String(v).trim())
      .map(([k, v]) => `${k}: ${v}`)
      .join(' | ')
  ).join('\n');
}

module.exports = { parseFile, getSummary, prepareForAnalysis };
