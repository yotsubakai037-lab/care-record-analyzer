'use strict';

const KNOWN_COLS = ['利用者名', '日付', '就寝時刻', '起床時刻', '睡眠時間', '体動回数', '離床回数', '睡眠効率'];

/**
 * まもるーのPDFをコピペしたテキストをパースしてオブジェクト配列を返す。
 * タブ区切り・複数スペース区切り・ヘッダー行あり/なしに対応。
 */
function parseMamorunoPdfText(text) {
  if (!text || !text.trim()) throw new Error('テキストが空です');

  // BOM除去
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());
  if (!nonEmpty.length) throw new Error('読み込めるデータがありません');

  // セパレータ検出（タブ優先、次にカンマ、次に2文字以上の空白）
  const detectSep = line => {
    if (line.includes('\t')) return /\t/;
    if (line.includes(','))  return /,/;
    return /\s{2,}/;
  };

  // ヘッダー行を探す（既知カラム名を2つ以上含む行）
  let headerIdx = -1;
  for (let i = 0; i < nonEmpty.length; i++) {
    const matches = KNOWN_COLS.filter(c => nonEmpty[i].includes(c));
    if (matches.length >= 2) { headerIdx = i; break; }
  }

  const rows = [];

  if (headerIdx >= 0) {
    // ヘッダー行あり: 構造化パース
    const sep = detectSep(nonEmpty[headerIdx]);
    const headers = nonEmpty[headerIdx].split(sep).map(h => h.trim());

    for (let i = headerIdx + 1; i < nonEmpty.length; i++) {
      const line = nonEmpty[i].trim();
      if (!line) continue;
      const cells = line.split(sep).map(c => c.trim());
      if (cells.every(c => !c)) continue;
      const row = {};
      headers.forEach((h, idx) => { row[h] = cells[idx] || ''; });
      const dateVal = row['日付'] || '';
      if (headers.length > 1 && !dateVal && cells.filter(Boolean).length < 2) continue;
      rows.push(row);
    }
  } else {
    // ヘッダー行なし: 日付パターンを持つ行のみ対象
    const dateRe = /\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2}/;
    let currentUser = '';

    for (const line of nonEmpty) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // 利用者名だけの行（日付なし・時刻なし）
      if (!dateRe.test(trimmed) && !/\d{2}:\d{2}/.test(trimmed)) {
        if (/^[　-鿿豈-﫿a-zA-Z\s　]+$/.test(trimmed)) {
          currentUser = trimmed;
        }
        continue;
      }

      if (!dateRe.test(trimmed)) continue;

      const sep = detectSep(trimmed);
      const cells = trimmed.split(sep).map(c => c.trim()).filter(Boolean);

      let userCell = '';
      let restCells = cells;
      if (cells.length > 0 && !dateRe.test(cells[0]) && !/^\d/.test(cells[0])) {
        userCell = cells[0];
        restCells = cells.slice(1);
      }

      rows.push({
        '利用者名': userCell || currentUser,
        '日付':     restCells[0] || '',
        '就寝時刻': restCells[1] || '',
        '起床時刻': restCells[2] || '',
        '睡眠時間': restCells[3] || '',
        '体動回数': restCells[4] || '',
        '離床回数': restCells[5] || '',
        '睡眠効率': restCells[6] || '',
      });
    }
  }

  // 日付を YYYY-MM-DD に正規化
  rows.forEach(r => {
    if (r['日付']) r['日付'] = r['日付'].replace(/\//g, '-');
  });

  if (!rows.length) {
    throw new Error('まもるーのデータを読み取れませんでした。PDFのテキストをそのままコピーして貼り付けてください。');
  }
  return rows;
}

function getMamorunoSummary(rows) {
  const users   = [...new Set(rows.map(r => r['利用者名']).filter(Boolean))];
  const dates   = rows.map(r => r['日付']).filter(Boolean).sort();
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

module.exports = { parseMamorunoPdfText, getMamorunoSummary };
