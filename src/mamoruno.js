'use strict';

const iconv = require('iconv-lite');

/**
 * まもるーの睡眠センサーCSVをパースしてオブジェクト配列を返す
 * 想定カラム: 利用者名, 日付, 就寝時刻, 起床時刻, 睡眠時間, 体動回数, 離床回数, 睡眠効率
 */
function parseMamoruno(buffer) {
  let text;
  for (const enc of ['utf-8', 'shift_jis', 'cp932']) {
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded.includes('\uFFFD')) { text = decoded; break; }
    } catch (_) {}
  }
  if (!text) text = buffer.toString('utf-8');

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (nonEmpty.length < 2) throw new Error('データが見つかりません');

  const headers = nonEmpty[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  const rows = [];

  for (let i = 1; i < nonEmpty.length; i++) {
    const cells = nonEmpty[i].split(',').map(c => c.trim().replace(/^"|"$/g, ''));
    if (cells.every(c => !c)) continue;
    const row = {};
    headers.forEach((h, idx) => { row[h] = cells[idx] || ''; });
    rows.push(row);
  }

  return rows;
}

function getMamorunoSummary(rows) {
  const userKey   = '利用者名';
  const dateKey   = '日付';
  const users     = [...new Set(rows.map(r => r[userKey]).filter(Boolean))];
  const dates     = rows.map(r => r[dateKey]).filter(Boolean).sort();
  const dateRange = dates.length
    ? { start: dates[0], end: dates[dates.length - 1] }
    : null;

  return {
    totalRecords: rows.length,
    users,
    dateRange,
    columns: rows.length ? Object.keys(rows[0]) : [],
  };
}

module.exports = { parseMamoruno, getMamorunoSummary };
