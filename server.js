'use strict';

require('dotenv').config();
const express = require('express');
const multer  = require('multer');
const path    = require('path');
const { parseFile, getSummary, prepareForAnalysis } = require('./src/simpleCase');
const { parseTalknote, parseTalknoteText, getTalknoteSummary, prepareForAnalysis: prepareTalknote } = require('./src/talknote');
const { parseMamoruno, getMamorunoSummary } = require('./src/mamoruno');
const { analyze } = require('./src/aiAnalyzer');

const app  = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ---- ファイルアップロード & パース ----
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません' });
    const rows = await parseFile(req.file.buffer, req.file.originalname);
    const summary = getSummary(rows);
    res.json({ rows, summary });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Talknote アップロード & パース ----
app.post('/api/upload-talknote', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません' });
    const rows = parseTalknote(req.file.buffer, req.file.originalname);
    const summary = getTalknoteSummary(rows);
    res.json({ rows, summary });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- Talknote テキスト貼り付け ----
app.post('/api/paste-talknote', (req, res) => {
  try {
    const { text } = req.body;
    const rows = parseTalknoteText(text);
    const summary = getTalknoteSummary(rows);
    res.json({ rows, summary });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- まもるーの アップロード & パース ----
app.post('/api/upload-mamoruno', upload.single('file'), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'ファイルが選択されていません' });
    const rows    = parseMamoruno(req.file.buffer);
    const summary = getMamorunoSummary(rows);
    res.json({ rows, summary });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---- サンプルデータ一括読み込み ----
app.get('/api/load-sample', async (req, res) => {
  try {
    const fs = require('fs');
    const sampleDir = path.join(__dirname, 'sample_data');

    const scBuf = fs.readFileSync(path.join(sampleDir, 'sample_simple_case.csv'));
    const scRows = await parseFile(scBuf, 'sample_simple_case.csv');
    const scSummary = getSummary(scRows);

    const mmBuf = fs.readFileSync(path.join(sampleDir, 'sample_mamoruno.csv'));
    const mmRows = parseMamoruno(mmBuf);
    const mmSummary = getMamorunoSummary(mmRows);

    res.json({ scRows, scSummary, mmRows, mmSummary });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- AI分析 ----
app.post('/api/analyze', async (req, res) => {
  const { rows, talknoteRows, analysisType, userName, apiKey } = req.body;

  if (!apiKey) return res.status(400).json({ error: 'APIキーを入力してください' });
  if ((!rows || !rows.length) && (!talknoteRows || !talknoteRows.length)) {
    return res.status(400).json({ error: 'データがありません' });
  }

  try {
    // シンプルケース: 利用者で絞り込み
    const target = rows && rows.length
      ? (userName && userName !== '__all__'
          ? rows.filter(r => (r.user_name || r['利用者名'] || r['利用者']) === userName)
          : rows)
      : [];

    const dataText      = target.length ? prepareForAnalysis(target) : null;
    const talknoteText  = talknoteRows && talknoteRows.length ? prepareTalknote(talknoteRows) : null;

    const result = await analyze({
      dataText,
      talknoteText,
      analysisType,
      userName: userName !== '__all__' ? userName : null,
      apiKey,
    });

    res.json({ result });
  } catch (e) {
    const msg = e.status === 401
      ? 'APIキーが無効です。Anthropic APIキー（sk-ant-...）またはGitHub Token（ghp_...）を確認してください。'
      : `分析エラー: ${e.message}`;
    res.status(e.status || 500).json({ error: msg });
  }
});

app.listen(PORT, () => {
  console.log(`\n===================================`);
  console.log(` ケア記録 AI分析アプリ 起動中`);
  console.log(` http://localhost:${PORT}`);
  console.log(`===================================\n`);

  // ブラウザを自動オープン（Windows）
  const { exec } = require('child_process');
  exec(`start http://localhost:${PORT}`);
});
