'use strict';

const iconv = require('iconv-lite');

// Talknote CSVの列名候補 → 内部標準名
const COLUMN_MAP = {
  '投稿日時': 'datetime',
  '日時':     'datetime',
  '日付':     'datetime',
  '投稿者名': 'poster_name',
  '投稿者':   'poster_name',
  '名前':     'poster_name',
  'グループ名': 'group_name',
  'グループ':   'group_name',
  '本文':     'content',
  'メッセージ': 'content',
  '内容':     'content',
  'テキスト': 'content',
  '添付ファイル': 'attachment',
  '添付':     'attachment',
};

/**
 * Talknote CSVバッファをパースしてオブジェクト配列を返す
 */
function parseTalknote(buffer, filename) {
  const lower = (filename || '').toLowerCase();
  if (!lower.endsWith('.csv')) {
    throw new Error('Talknoteデータは CSV 形式でアップロードしてください');
  }

  let text;
  for (const enc of ['utf-8', 'shift_jis', 'cp932']) {
    try {
      const decoded = iconv.decode(buffer, enc);
      if (!decoded.includes('')) { text = decoded; break; }
    } catch (_) { /* try next */ }
  }
  if (!text) text = buffer.toString('utf-8');

  // BOM除去
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);

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
    // content が空の行は除外
    if (!obj.content && !obj['本文']) continue;
    rows.push(obj);
  }

  if (!rows.length) {
    throw new Error('Talknote CSVからデータを読み込めませんでした。列名を確認してください（投稿日時・投稿者名・本文 など）');
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

/** Talknoteデータのサマリー生成 */
function getTalknoteSummary(rows) {
  const posters = [...new Set(rows.map(r => r.poster_name).filter(Boolean))];
  const groups  = [...new Set(rows.map(r => r.group_name).filter(Boolean))];
  const dates   = rows.map(r => String(r.datetime || '').slice(0, 10)).filter(Boolean).sort();

  return {
    totalPosts: rows.length,
    posters,
    groups,
    dateRange: dates.length ? { start: dates[0], end: dates[dates.length - 1] } : null,
  };
}

/** AI分析用テキスト生成（最新200件） */
function prepareForAnalysis(rows) {
  return rows.slice(-200).map(row => {
    const parts = [];
    if (row.datetime)     parts.push(`[${row.datetime}]`);
    if (row.poster_name)  parts.push(`投稿者: ${row.poster_name}`);
    if (row.group_name)   parts.push(`グループ: ${row.group_name}`);
    if (row.content)      parts.push(`内容: ${row.content}`);
    return parts.join(' | ');
  }).join('\n');
}

/**
 * テキスト貼り付けからTalknoteデータをパースする。
 * CSV形式（ヘッダー行あり）と改行区切りの平文の両方に対応。
 */
function parseTalknoteText(text) {
  if (!text || !text.trim()) {
    throw new Error('テキストが空です');
  }

  // BOM除去
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1);
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const nonEmpty = lines.filter(l => l.trim());

  if (!nonEmpty.length) throw new Error('読み込めるデータがありません');

  // 1行目がCSVヘッダーっぽいか判定（カンマ含む＋列名キーワード）
  const firstLine = nonEmpty[0];
  const csvKeywords = ['投稿日時', '投稿者', '本文', 'グループ', '日時', '内容', 'メッセージ'];
  const looksLikeCsv = firstLine.includes(',') && csvKeywords.some(k => firstLine.includes(k));

  if (looksLikeCsv) {
    // CSVとして解析（既存ロジックを流用）
    const headers = splitCsvLine(firstLine);
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
      if (!obj.content && !obj['本文']) continue;
      rows.push(obj);
    }
    if (!rows.length) throw new Error('CSVからデータを読み込めませんでした');
    return rows;
  }

  // 平文として解析：各行をメッセージとして扱う
  return nonEmpty.map(line => ({ content: line.trim() }));
}

module.exports = { parseTalknote, parseTalknoteText, getTalknoteSummary, prepareForAnalysis };
