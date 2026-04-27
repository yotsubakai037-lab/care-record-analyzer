'use strict';

let allRows = [];
let summary = null;
let talknoteRows = [];
let talknoteSummary = null;
let mamorunoRows = [];
let mamorunoSummary = null;
let charts = {};

// ===== 初期化 =====
document.addEventListener('DOMContentLoaded', () => {
  setupTabs();
  setupFileUpload();
  setupTalknoteUpload();
  setupMamorunoUpload();
  setupAnalysis();
  setupRiskTab();
});

// ===== タブ =====
function setupTabs() {
  document.querySelectorAll('.tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => {
        c.classList.remove('active');
        c.hidden = true;
      });
      btn.classList.add('active');
      const target = document.getElementById('tab-' + btn.dataset.tab);
      target.hidden = false;
      target.classList.add('active');

      if (btn.dataset.tab === 'charts' && allRows.length) renderCharts();
      if (btn.dataset.tab === 'mamoruno' && mamorunoRows.length) renderMamorunoTab();
      if (btn.dataset.tab === 'integrated') renderIntegratedTab();
      if (btn.dataset.tab === 'risk') showRiskTab();
    });
  });
}

// ===== ファイルアップロード =====
function setupFileUpload() {
  const input = document.getElementById('fileInput');
  const label = document.getElementById('uploadLabel');
  const status = document.getElementById('fileStatus');

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    document.getElementById('uploadText').textContent = '読み込み中...';
    status.textContent = '';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      allRows = data.rows;
      summary = data.summary;

      document.getElementById('uploadText').textContent = file.name;
      status.textContent = `✓ ${summary.totalRecords} 件読み込み完了`;

      showDataScreen();
    } catch (e) {
      showToast(e.message);
      document.getElementById('uploadText').textContent = 'CSV / Excel をアップロード';
    }

    input.value = '';
  });
}

function showDataScreen() {
  document.getElementById('welcomeScreen').hidden = true;
  document.getElementById('dataScreen').hidden = false;

  renderOverview();
  populateUserSelect();
}

// ===== Talknote 貼り付け =====
function setupTalknoteUpload() {
  const btn    = document.getElementById('talknoteLoadBtn');
  const status = document.getElementById('talknoteFileStatus');

  btn.addEventListener('click', async () => {
    const text = document.getElementById('talknotePasteArea').value.trim();
    if (!text) { showToast('テキストを貼り付けてから「読み込む」を押してください'); return; }

    btn.disabled = true;
    btn.textContent = '読み込み中...';
    status.textContent = '';

    try {
      const res  = await fetch('/api/paste-talknote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      talknoteRows    = data.rows;
      talknoteSummary = data.summary;

      status.textContent = `✓ ${talknoteSummary.totalPosts} 件読み込み完了`;

      renderTalknoteTab();

      // データ画面を表示（シンプルケースがなくても）
      if (document.getElementById('dataScreen').hidden) {
        document.getElementById('welcomeScreen').hidden = true;
        document.getElementById('dataScreen').hidden = false;
        renderOverview();
        populateUserSelect();
      }

    } catch (e) {
      showToast(e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = '読み込む';
    }
  });
}

function renderTalknoteTab() {
  document.getElementById('talknoteEmpty').hidden  = true;
  document.getElementById('talknoteLoaded').hidden = false;

  // メトリクス
  const mr = document.getElementById('talknoteMetricsRow');
  mr.innerHTML = '';
  const metrics = [
    { label: '総投稿件数', value: talknoteSummary.totalPosts.toLocaleString() + ' 件' },
    { label: '投稿者数',   value: talknoteSummary.posters.length + ' 名' },
    { label: 'グループ数', value: talknoteSummary.groups.length + ' 件' },
  ];
  if (talknoteSummary.dateRange) {
    metrics.push({ label: '投稿期間', value: talknoteSummary.dateRange.start + ' 〜 ' + talknoteSummary.dateRange.end });
  }
  metrics.forEach(m => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `<div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div>`;
    mr.appendChild(card);
  });

  // プレビューテーブル
  const preview = talknoteRows.slice(0, 20);
  const cols = preview.length ? Object.keys(preview[0]) : [];
  const table = document.getElementById('talknoteTable');
  table.innerHTML = `
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(row =>
      `<tr>${cols.map(c => `<td title="${row[c] || ''}">${row[c] || ''}</td>`).join('')}</tr>`
    ).join('')}</tbody>
  `;
}

// ===== 概要タブ =====
function renderOverview() {
  // メトリクス
  const mr = document.getElementById('metricsRow');
  mr.innerHTML = '';

  const metrics = [
    { label: '総記録件数', value: summary.totalRecords.toLocaleString() + ' 件' },
    { label: '利用者数', value: summary.users.length + ' 名' },
    { label: 'スタッフ数', value: summary.staff.length + ' 名' },
  ];
  if (summary.dateRange) {
    metrics.push({ label: '記録期間', value: summary.dateRange.start + ' 〜 ' + summary.dateRange.end });
  }

  metrics.forEach(m => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `<div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div>`;
    mr.appendChild(card);
  });

  // プレビューテーブル
  const table = document.getElementById('previewTable');
  const cols = summary.columns;
  const preview = allRows.slice(0, 10);

  table.innerHTML = `
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(row =>
      `<tr>${cols.map(c => `<td title="${row[c] || ''}">${row[c] || ''}</td>`).join('')}</tr>`
    ).join('')}</tbody>
  `;
}

// ===== グラフタブ =====
function renderCharts() {
  // グラフタブ用チャートのみ破棄（まもるーの用は残す）
  ['daily', 'users', 'numeric'].forEach(k => destroyChart(k));

  const dateKey = findKey(['date', '日付', '記録日']);
  const userKey = findKey(['user_name', '利用者名', '利用者', '氏名']);

  // 日別件数
  if (dateKey) {
    const counts = {};
    allRows.forEach(r => {
      const d = String(r[dateKey] || '').slice(0, 10);
      if (d) counts[d] = (counts[d] || 0) + 1;
    });
    const labels = Object.keys(counts).sort();
    const ctx = document.getElementById('chartDaily').getContext('2d');
    charts.daily = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: '件数', data: labels.map(l => counts[l]), backgroundColor: '#3182ce' }],
      },
      options: { plugins: { legend: { display: false } }, scales: { x: { ticks: { maxRotation: 45 } } } },
    });
  }

  // 利用者別件数
  if (userKey) {
    const counts = {};
    allRows.forEach(r => {
      const u = r[userKey] || '不明';
      counts[u] = (counts[u] || 0) + 1;
    });
    const labels = Object.keys(counts);
    const ctx = document.getElementById('chartUsers').getContext('2d');
    charts.users = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ label: '件数', data: labels.map(l => counts[l]), backgroundColor: '#2b6cb0' }],
      },
      options: { plugins: { legend: { display: false } }, indexAxis: 'y' },
    });
  }

  // 数値列プルダウン
  const numericCols = summary.columns.filter(col => {
    const vals = allRows.map(r => r[col]).filter(v => v !== '' && v !== null && v !== undefined);
    return vals.some(v => !isNaN(Number(v)));
  });

  const sel = document.getElementById('numericColSelect');
  sel.innerHTML = numericCols.map(c => `<option value="${c}">${c}</option>`).join('');
  if (numericCols.length) {
    renderNumericChart(numericCols[0]);
    sel.addEventListener('change', () => renderNumericChart(sel.value));
  }
}

function renderNumericChart(col) {
  if (charts.numeric) charts.numeric.destroy();
  const dateKey = findKey(['date', '日付', '記録日']);
  const userKey = findKey(['user_name', '利用者名', '利用者', '氏名']);

  const sorted = [...allRows].sort((a, b) => {
    const da = String(a[dateKey] || ''), db = String(b[dateKey] || '');
    return da < db ? -1 : da > db ? 1 : 0;
  });

  const users = summary.users.length ? summary.users : ['全員'];
  const colors = ['#3182ce', '#e53e3e', '#38a169', '#d69e2e', '#805ad5'];

  const datasets = users.map((u, i) => {
    const rows = userKey ? sorted.filter(r => r[userKey] === u) : sorted;
    return {
      label: String(u),
      data: rows.map(r => ({ x: String(r[dateKey] || '').slice(0, 10), y: Number(r[col]) || null })),
      borderColor: colors[i % colors.length],
      backgroundColor: colors[i % colors.length] + '33',
      tension: 0.3,
      fill: false,
    };
  });

  const ctx = document.getElementById('chartNumeric').getContext('2d');
  charts.numeric = new Chart(ctx, {
    type: 'line',
    data: { datasets },
    options: {
      scales: {
        x: { type: 'category', ticks: { maxRotation: 45 } },
        y: { beginAtZero: false },
      },
    },
  });
}


// ===== まもるーの PDFアップロード =====
function setupMamorunoUpload() {
  const input  = document.getElementById('mamorunoFileInput');
  const status = document.getElementById('mamorunoFileStatus');

  input.addEventListener('change', async () => {
    const file = input.files[0];
    if (!file) return;

    document.getElementById('mamorunoUploadText').textContent = '読み込み中...';
    status.textContent = '';

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res  = await fetch('/api/upload-mamoruno', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      mamorunoRows    = data.rows;
      mamorunoSummary = data.summary;

      document.getElementById('mamorunoUploadText').textContent = file.name;
      status.textContent = `✓ ${mamorunoSummary.totalRecords} 件読み込み完了`;

      if (document.getElementById('dataScreen').hidden) {
        document.getElementById('welcomeScreen').hidden = true;
        document.getElementById('dataScreen').hidden = false;
        renderOverview();
        populateUserSelect();
      }

      const tab = document.querySelector('.tab[data-tab="mamoruno"]');
      if (tab && tab.classList.contains('active')) renderMamorunoTab();

    } catch (e) {
      showToast(e.message);
      document.getElementById('mamorunoUploadText').textContent = 'PDF をアップロード';
    }

    input.value = '';
  });
}

// ===== まもるーのタブ描画 =====
function renderMamorunoTab() {
  document.getElementById('mamorunoEmpty').hidden  = true;
  document.getElementById('mamorunoLoaded').hidden = false;

  // 利用者リスト（まもるーの ＋ シンプルケース）
  const mUsers = mamorunoSummary ? mamorunoSummary.users : [];
  const sUsers = summary ? summary.users : [];
  const allUsers = [...new Set([...mUsers, ...sUsers])];

  const sel = document.getElementById('mamorunoUserSelect');
  sel.innerHTML = '<option value="__all__">全員</option>';
  allUsers.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u; opt.textContent = u;
    sel.appendChild(opt);
  });
  sel.onchange = () => drawMamorunoCharts(sel.value);

  // メトリクス
  const mr = document.getElementById('mamorunoMetricsRow');
  mr.innerHTML = '';
  [
    { label: 'センサー記録数', value: mamorunoSummary.totalRecords + ' 件' },
    { label: '対象利用者数',   value: mamorunoSummary.users.length + ' 名' },
    { label: 'ケア記録件数',   value: (summary ? summary.totalRecords : 0) + ' 件' },
    ...(mamorunoSummary.dateRange ? [{ label: '記録期間', value: mamorunoSummary.dateRange.start + ' 〜 ' + mamorunoSummary.dateRange.end }] : []),
  ].forEach(m => {
    const card = document.createElement('div');
    card.className = 'metric-card';
    card.innerHTML = `<div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div>`;
    mr.appendChild(card);
  });

  drawMamorunoCharts('__all__');

  // プレビューテーブル
  const preview = mamorunoRows.slice(0, 15);
  const cols = preview.length ? Object.keys(preview[0]) : [];
  const table = document.getElementById('mamorunoTable');
  table.innerHTML = `
    <thead><tr>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead>
    <tbody>${preview.map(row =>
      `<tr>${cols.map(c => `<td title="${row[c] || ''}">${row[c] || ''}</td>`).join('')}</tr>`
    ).join('')}</tbody>
  `;
}

function drawMamorunoCharts(filterUser) {
  const colors = ['#6b46c1', '#e53e3e', '#38a169', '#d69e2e', '#3182ce'];

  // フィルタリング
  const mRows = filterUser === '__all__'
    ? mamorunoRows
    : mamorunoRows.filter(r => r['利用者名'] === filterUser);

  const sRows = allRows.length
    ? (filterUser === '__all__' ? allRows : allRows.filter(r => (r['利用者名'] || r.user_name) === filterUser))
    : [];

  const users = filterUser === '__all__'
    ? [...new Set(mRows.map(r => r['利用者名']).filter(Boolean))]
    : [filterUser];

  // まもるーの 睡眠時間グラフ
  destroyChart('mamorunoSleep');
  {
    const datasets = users.map((u, i) => {
      const rows = mRows.filter(r => r['利用者名'] === u).sort((a,b) => a['日付'] < b['日付'] ? -1 : 1);
      return {
        label: u,
        data: rows.map(r => ({ x: r['日付'], y: parseFloat(r['睡眠時間']) || null })),
        backgroundColor: colors[i % colors.length] + 'cc',
        borderColor:     colors[i % colors.length],
        borderWidth: 1,
      };
    });
    const ctx = document.getElementById('chartMamorunoSleep').getContext('2d');
    charts.mamorunoSleep = new Chart(ctx, {
      type: 'bar',
      data: { datasets },
      options: { scales: { x: { type: 'category', ticks: { maxRotation: 45 } }, y: { title: { display: true, text: '時間' }, min: 0, max: 12 } } },
    });
  }

  // シンプルケース 睡眠時間グラフ
  destroyChart('simpleSleep');
  if (sRows.length) {
    const dateKey  = findKey(['date', '日付', '記録日']);
    const sleepKey = findKey(['sleep_hours', '睡眠時間']);
    const userKey  = findKey(['user_name', '利用者名', '利用者']);

    if (sleepKey && dateKey) {
      const sUsers = filterUser === '__all__'
        ? [...new Set(sRows.map(r => r[userKey]).filter(Boolean))]
        : [filterUser];

      const datasets = sUsers.map((u, i) => {
        const rows = sRows.filter(r => r[userKey] === u).sort((a,b) => a[dateKey] < b[dateKey] ? -1 : 1);
        return {
          label: u,
          data: rows.map(r => ({ x: String(r[dateKey]).slice(0,10), y: parseFloat(r[sleepKey]) || null })),
          borderColor:     colors[i % colors.length],
          backgroundColor: colors[i % colors.length] + '33',
          tension: 0.3, fill: false,
        };
      });
      const ctx = document.getElementById('chartSimpleSleep').getContext('2d');
      charts.simpleSleep = new Chart(ctx, {
        type: 'line',
        data: { datasets },
        options: { scales: { x: { type: 'category', ticks: { maxRotation: 45 } }, y: { title: { display: true, text: '時間' }, min: 0 } } },
      });
    }
  }

  // 統合比較グラフ（センサー vs ケア記録）
  destroyChart('combinedSleep');
  {
    const dateKey  = findKey(['date', '日付', '記録日']);
    const sleepKey = findKey(['sleep_hours', '睡眠時間']);
    const userKey  = findKey(['user_name', '利用者名', '利用者']);

    const datasets = [];
    users.forEach((u, i) => {
      // センサー
      const mFiltered = mRows.filter(r => r['利用者名'] === u).sort((a,b) => a['日付'] < b['日付'] ? -1 : 1);
      datasets.push({
        label: u + '（センサー）',
        data: mFiltered.map(r => ({ x: r['日付'], y: parseFloat(r['睡眠時間']) || null })),
        borderColor:     colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '33',
        borderDash: [],
        tension: 0.3, fill: false,
      });
      // ケア記録
      if (sRows.length && dateKey && sleepKey) {
        const sFiltered = sRows.filter(r => r[userKey] === u).sort((a,b) => a[dateKey] < b[dateKey] ? -1 : 1);
        datasets.push({
          label: u + '（ケア記録）',
          data: sFiltered.map(r => ({ x: String(r[dateKey]).slice(0,10), y: parseFloat(r[sleepKey]) || null })),
          borderColor:     colors[i % colors.length],
          backgroundColor: 'transparent',
          borderDash: [5, 5],
          tension: 0.3, fill: false,
        });
      }
    });

    const ctx = document.getElementById('chartCombinedSleep').getContext('2d');
    charts.combinedSleep = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: {
        scales: { x: { type: 'category', ticks: { maxRotation: 45 } }, y: { title: { display: true, text: '睡眠時間（時間）' }, min: 0 } },
        plugins: { legend: { position: 'bottom' } },
      },
    });
  }

  // 体動回数グラフ
  destroyChart('bodyMove');
  {
    const datasets = users.map((u, i) => {
      const rows = mRows.filter(r => r['利用者名'] === u).sort((a,b) => a['日付'] < b['日付'] ? -1 : 1);
      return {
        label: u,
        data: rows.map(r => ({ x: r['日付'], y: parseInt(r['体動回数']) || null })),
        borderColor: colors[i % colors.length],
        backgroundColor: colors[i % colors.length] + '33',
        tension: 0.3, fill: false,
      };
    });
    const ctx = document.getElementById('chartBodyMove').getContext('2d');
    charts.bodyMove = new Chart(ctx, {
      type: 'line',
      data: { datasets },
      options: { scales: { x: { type: 'category', ticks: { maxRotation: 45 } }, y: { title: { display: true, text: '回' }, min: 0 } } },
    });
  }

  // 離床回数グラフ
  destroyChart('outOfBed');
  {
    const datasets = users.map((u, i) => {
      const rows = mRows.filter(r => r['利用者名'] === u).sort((a,b) => a['日付'] < b['日付'] ? -1 : 1);
      return {
        label: u,
        data: rows.map(r => ({ x: r['日付'], y: parseInt(r['離床回数']) || null })),
        backgroundColor: colors[i % colors.length] + 'cc',
        borderColor:     colors[i % colors.length],
        borderWidth: 1,
      };
    });
    const ctx = document.getElementById('chartOutOfBed').getContext('2d');
    charts.outOfBed = new Chart(ctx, {
      type: 'bar',
      data: { datasets },
      options: { scales: { x: { type: 'category', ticks: { maxRotation: 45 } }, y: { title: { display: true, text: '回' }, min: 0 } } },
    });
  }
}

function destroyChart(key) {
  if (charts[key]) { charts[key].destroy(); delete charts[key]; }
}

// ===== 統合分析タブ =====

// 不穏・体調変化を示すキーワード
const ALERT_KEYWORDS = ['不穏', '拒否', '転倒', '発熱', '痛み', '泣', '叫', '暴れ', '興奮', '不眠', '覚醒', '夜間', '食欲低下', '体調不良'];

function renderIntegratedTab() {
  const hasData = allRows.length || mamorunoRows.length;
  document.getElementById('intEmpty').hidden  = !!hasData;
  document.getElementById('intLoaded').hidden = !hasData;
  if (!hasData) return;

  // 利用者リスト（全データソースを統合）
  const mUsers = mamorunoSummary ? mamorunoSummary.users : [];
  const sUsers = summary ? summary.users : [];
  const allUsers = [...new Set([...mUsers, ...sUsers])];

  const sel = document.getElementById('intUserSelect');
  // ユーザーリストが変わっていたら再構築
  const current = sel.value;
  sel.innerHTML = allUsers.map(u => `<option value="${u}">${u}</option>`).join('');
  if (current && allUsers.includes(current)) sel.value = current;

  sel.onchange = () => refreshIntegrated(sel.value);
  refreshIntegrated(sel.value || allUsers[0]);
}

function refreshIntegrated(user) {
  renderAlertCards(user);
  drawSleepTimeline(user);
  renderEventList(user);
}

// ---- アラートカード ----
function renderAlertCards(user) {
  const container = document.getElementById('intAlerts');
  container.innerHTML = '';

  const mRows = mamorunoRows.filter(r => r['利用者名'] === user).sort((a,b) => a['日付'] < b['日付'] ? -1 : 1);
  const dateKey  = findKey(['date', '日付', '記録日']);
  const userKey  = findKey(['user_name', '利用者名', '利用者']);
  const sRows = allRows.filter(r => r[userKey] === user).sort((a,b) => a[dateKey] < b[dateKey] ? -1 : 1);

  const cards = [];

  // まもるーの 指標
  if (mRows.length >= 2) {
    cards.push(buildAlertCard('睡眠時間', mRows.map(r => parseFloat(r['睡眠時間'])), true,  '時間'));
    cards.push(buildAlertCard('睡眠効率', mRows.map(r => parseFloat(r['睡眠効率'])), true,  '%'));
    cards.push(buildAlertCard('体動回数', mRows.map(r => parseInt(r['体動回数'])),   false, '回'));
    cards.push(buildAlertCard('離床回数', mRows.map(r => parseInt(r['離床回数'])),   false, '回'));
  }

  // シンプルケース 体温
  const tempKey = findKey(['temperature', '体温']);
  if (tempKey && sRows.length >= 2) {
    cards.push(buildAlertCard('体温', sRows.map(r => parseFloat(r[tempKey])).filter(v => !isNaN(v)), false, '℃', 37.0));
  }

  // Talknote キーワード
  if (talknoteRows.length) {
    cards.push(buildTalknoteAlertCard(user));
  }

  if (!cards.length) {
    container.innerHTML = '<div style="color:#718096;font-size:0.88rem;padding:8px 0;">データが2件以上になるとアラート検知が表示されます</div>';
    return;
  }

  cards.forEach(c => container.appendChild(c));
}

function buildAlertCard(label, values, lowerIsBad, unit, threshold = null) {
  const clean = values.filter(v => !isNaN(v) && v !== null);
  const el = document.createElement('div');

  if (clean.length < 2) {
    el.className = 'alert-card nodata';
    el.innerHTML = `<div class="alert-card-header">― ${label}</div><div class="alert-card-values">データ不足</div>`;
    return el;
  }

  const latest = clean[clean.length - 1];
  const prev   = clean.slice(0, -1);
  const mean   = prev.reduce((s, v) => s + v, 0) / prev.length;
  const diff   = latest - mean;
  const pct    = mean !== 0 ? (diff / mean) * 100 : 0;

  // どちらの変化が悪いか
  let badness;
  if (threshold !== null) {
    // 閾値超え（体温など）
    badness = latest >= threshold ? Math.abs(pct) : 0;
  } else {
    badness = lowerIsBad ? -pct : pct; // 正の値 = 悪化
  }

  let level = 'ok';
  if (badness > 35) level = 'alert';
  else if (badness > 15) level = 'caution';

  const arrow  = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
  const pctStr = (diff >= 0 ? '+' : '') + pct.toFixed(1) + '%';
  const icon   = level === 'ok' ? '✓' : level === 'caution' ? '!' : '!!';

  el.className = `alert-card ${level}`;
  el.innerHTML = `
    <div class="alert-card-header">${icon} ${label}</div>
    <div class="alert-card-metric">${label}</div>
    <div class="alert-card-values">最新: <strong>${latest.toFixed(1)}${unit}</strong> ／ 平均: ${mean.toFixed(1)}${unit}</div>
    <div class="alert-card-pct">${arrow} ${pctStr}</div>
  `;
  return el;
}

function buildTalknoteAlertCard(user) {
  // 直近半分 vs 前半分でキーワード出現率を比較
  const relevant = talknoteRows.filter(r => {
    const content = Object.values(r).join(' ');
    return user ? content.includes(user) : true;
  }).sort((a, b) => {
    const da = Object.values(a).find(v => /\d{4}-\d{2}-\d{2}/.test(v)) || '';
    const db = Object.values(b).find(v => /\d{4}-\d{2}-\d{2}/.test(v)) || '';
    return da < db ? -1 : 1;
  });

  if (relevant.length < 2) {
    const el = document.createElement('div');
    el.className = 'alert-card nodata';
    el.innerHTML = '<div class="alert-card-header">― Talknoteキーワード</div><div class="alert-card-values">データ不足</div>';
    return el;
  }

  const half = Math.floor(relevant.length / 2);
  const older  = relevant.slice(0, half);
  const recent = relevant.slice(half);

  const countKeywords = rows => rows.reduce((n, r) => {
    const text = Object.values(r).join(' ');
    return n + ALERT_KEYWORDS.filter(kw => text.includes(kw)).length;
  }, 0);

  const oldCnt    = countKeywords(older);
  const recentCnt = countKeywords(recent);
  const found     = ALERT_KEYWORDS.filter(kw => recent.some(r => Object.values(r).join(' ').includes(kw)));

  let level = 'ok';
  if (recentCnt > oldCnt * 2 && recentCnt > 0) level = 'alert';
  else if (recentCnt > oldCnt && recentCnt > 0) level = 'caution';

  const icon = level === 'ok' ? '✓' : level === 'caution' ? '!' : '!!';
  const el = document.createElement('div');
  el.className = `alert-card ${level}`;
  el.innerHTML = `
    <div class="alert-card-header">${icon} Talknoteキーワード</div>
    <div class="alert-card-metric">注目ワード検知</div>
    <div class="alert-card-values">直近: <strong>${recentCnt}件</strong> ／ 前回: ${oldCnt}件</div>
    <div class="alert-card-pct" style="font-size:0.78rem;">${found.length ? '検知: ' + found.join('・') : '特記ワードなし'}</div>
  `;
  return el;
}

// ---- 睡眠タイムライン ----
function timeStrToHours(str) {
  if (!str) return null;
  const parts = str.split(':').map(Number);
  return parts[0] + (parts[1] || 0) / 60;
}

function drawSleepTimeline(user) {
  destroyChart('sleepTimeline');

  const rows = mamorunoRows
    .filter(r => r['利用者名'] === user)
    .sort((a, b) => a['日付'] < b['日付'] ? -1 : 1);

  if (!rows.length) {
    document.getElementById('intTimelineWrap').innerHTML =
      '<p style="color:#718096;font-size:0.88rem;padding:12px 0;">まもるーのデータが読み込まれるとタイムラインが表示されます</p>';
    return;
  }

  // canvas が消えていた場合は再生成
  const wrap = document.getElementById('intTimelineWrap');
  if (!wrap.querySelector('canvas')) {
    const c = document.createElement('canvas');
    c.id = 'chartSleepTimeline';
    wrap.innerHTML = '';
    wrap.appendChild(c);
  }

  const labels = rows.map(r => r['日付']);
  const floatData = rows.map(r => {
    let start = timeStrToHours(r['就寝時刻']);
    let end   = timeStrToHours(r['起床時刻']);
    if (start === null || end === null) return null;
    // 午前0時をまたぐ場合（起床時刻 < 就寝時刻）
    if (end < start) end += 24;
    // 18時より前に就寝（例: 17:00は翌18時基準にはしない）
    return [start, end];
  });

  // 睡眠効率で色分け
  const bgColors = rows.map(r => {
    const eff = parseFloat(r['睡眠効率']);
    if (eff < 70) return 'rgba(229, 62, 62, 0.7)';
    if (eff < 85) return 'rgba(214, 158, 46, 0.7)';
    return 'rgba(107, 70, 193, 0.7)';
  });

  const ctx = document.getElementById('chartSleepTimeline').getContext('2d');
  charts.sleepTimeline = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label: '睡眠',
        data: floatData,
        backgroundColor: bgColors,
        borderColor: bgColors.map(c => c.replace('0.7', '1')),
        borderWidth: 1,
        borderRadius: 4,
      }],
    },
    options: {
      indexAxis: 'y',
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label(ctx) {
              const v = ctx.raw;
              if (!Array.isArray(v)) return '';
              const fmt = h => {
                const hh = Math.floor(h % 24);
                const mm = Math.round((h % 1) * 60);
                return `${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}`;
              };
              const row = rows[ctx.dataIndex];
              return `就寝 ${fmt(v[0])} 〜 起床 ${fmt(v[1])}（${row['睡眠時間']}h / 効率 ${row['睡眠効率']}%）`;
            },
          },
        },
      },
      scales: {
        x: {
          min: 18,
          max: 32,
          ticks: {
            stepSize: 1,
            callback: v => `${v % 24}:00`,
          },
          title: { display: true, text: '時刻' },
        },
        y: {
          ticks: { font: { size: 12 } },
        },
      },
    },
  });
}

// ---- イベント一覧 ----
function renderEventList(user) {
  const table = document.getElementById('intEventTable');
  const dateKey  = findKey(['date', '日付', '記録日']);
  const userKey  = findKey(['user_name', '利用者名', '利用者']);
  const notesKey = findKey(['notes', '特記事項', '備考']);
  const tempKey  = findKey(['temperature', '体温']);
  const mealKey  = findKey(['meal_amount', '食事量', '食事']);

  // 対象日付を列挙（まもるーの＋シンプルケース）
  const mRows = mamorunoRows.filter(r => r['利用者名'] === user);
  const sRows = allRows.filter(r => r[userKey] === user);
  const dates = [...new Set([
    ...mRows.map(r => r['日付']),
    ...sRows.map(r => String(r[dateKey] || '').slice(0, 10)),
  ])].filter(Boolean).sort();

  if (!dates.length) { table.innerHTML = ''; return; }

  const rows = dates.map(date => {
    const m = mRows.find(r => r['日付'] === date);
    const s = sRows.find(r => String(r[dateKey] || '').slice(0, 10) === date);

    // 睡眠効率バッジ
    let sleepBadge = '―';
    if (m) {
      const eff = parseFloat(m['睡眠効率']);
      const cls = eff < 70 ? 'alert' : eff < 85 ? 'caution' : 'ok';
      sleepBadge = `<span class="ev-badge ${cls}">${m['就寝時刻']}〜${m['起床時刻']} 効率${m['睡眠効率']}%</span>`;
    }

    // 体動/離床バッジ
    let bodyBadge = '―';
    if (m) {
      const bm = parseInt(m['体動回数']);
      const ob = parseInt(m['離床回数']);
      const bmCls = bm >= 30 ? 'alert' : bm >= 15 ? 'caution' : 'ok';
      const obCls = ob >= 2 ? 'alert' : ob >= 1 ? 'caution' : 'ok';
      bodyBadge = `<span class="ev-badge ${bmCls}">体動${bm}回</span> <span class="ev-badge ${obCls}">離床${ob}回</span>`;
    }

    // 特記事項バッジ
    let notesBadge = '―';
    if (s && notesKey && s[notesKey] && s[notesKey] !== '特になし') {
      const text = s[notesKey];
      const isAlert = ALERT_KEYWORDS.some(kw => text.includes(kw));
      const cls = isAlert ? 'alert' : 'caution';
      notesBadge = `<span class="ev-badge ${cls}" title="${text}">${text.slice(0, 20)}${text.length > 20 ? '…' : ''}</span>`;
    } else if (s && notesKey && s[notesKey] === '特になし') {
      notesBadge = '<span class="ev-badge ok">特になし</span>';
    }

    // 体温
    let tempBadge = '―';
    if (s && tempKey && s[tempKey]) {
      const t = parseFloat(s[tempKey]);
      const cls = t >= 37.5 ? 'alert' : t >= 37.0 ? 'caution' : 'ok';
      tempBadge = `<span class="ev-badge ${cls}">${t.toFixed(1)}℃</span>`;
    }

    // 食事
    let mealBadge = '―';
    if (s && mealKey && s[mealKey]) {
      const v = s[mealKey];
      const cls = v === '少なめ' ? 'caution' : v === '良好' ? 'ok' : 'info';
      mealBadge = `<span class="ev-badge ${cls}">${v}</span>`;
    }

    // Talknoteキーワード
    let talkBadge = '―';
    if (talknoteRows.length) {
      const posts = talknoteRows.filter(r => {
        const text = Object.values(r).join(' ');
        const dateVal = Object.values(r).find(v => v && v.toString().startsWith(date));
        return !!dateVal && (user ? text.includes(user) : true);
      });
      if (posts.length) {
        const kws = ALERT_KEYWORDS.filter(kw => posts.some(p => Object.values(p).join(' ').includes(kw)));
        const cls = kws.length ? 'alert' : 'info';
        talkBadge = `<span class="ev-badge ${cls}">${kws.length ? kws.join('・') : posts.length + '件の投稿'}</span>`;
      }
    }

    return `<tr>
      <td><strong>${date}</strong></td>
      <td>${sleepBadge}</td>
      <td>${bodyBadge}</td>
      <td>${tempBadge}</td>
      <td>${mealBadge}</td>
      <td>${notesBadge}</td>
      <td>${talkBadge}</td>
    </tr>`;
  });

  table.innerHTML = `
    <thead><tr>
      <th>日付</th>
      <th>睡眠（まもるーの）</th>
      <th>体動・離床</th>
      <th>体温</th>
      <th>食事</th>
      <th>特記事項</th>
      <th>Talknote</th>
    </tr></thead>
    <tbody>${rows.join('')}</tbody>
  `;
}

// ===== AI分析タブ =====
function populateUserSelect() {
  const sel = document.getElementById('userSelect');
  sel.innerHTML = '<option value="__all__">全員</option>';
  summary.users.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u;
    opt.textContent = u;
    sel.appendChild(opt);
  });
}

function setupAnalysis() {
  document.getElementById('runAnalysisBtn').addEventListener('click', runAnalysis);
  document.getElementById('downloadBtn').addEventListener('click', downloadResult);
}

async function runAnalysis() {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) { showToast('APIキーを入力してください（Anthropic: sk-ant-... または GitHub: ghp_...）'); return; }
  if (!allRows.length && !talknoteRows.length) {
    showToast('シンプルケースまたはTalknoteのデータをアップロードしてください');
    return;
  }

  const analysisType = document.getElementById('analysisType').value;
  const userName = document.getElementById('userSelect').value;

  const btn = document.getElementById('runAnalysisBtn');
  btn.disabled = true;
  document.getElementById('analysisLoading').hidden = false;
  document.getElementById('analysisResult').hidden = true;

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: allRows, talknoteRows, analysisType, userName, apiKey }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const typeLabels = {
      total: '総合分析', sleep: '睡眠・生活リズム',
      health: '健康・バイタル', behavior: '行動・活動',
      care_plan: '個別支援計画',
    };

    document.getElementById('resultLabel').textContent =
      `${typeLabels[analysisType]} ／ ${userName === '__all__' ? '全員' : userName}`;

    // マークダウン風の太字変換
    const html = data.result
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    document.getElementById('resultText').innerHTML = html;
    document.getElementById('analysisResult').hidden = false;

  } catch (e) {
    showToast(e.message);
  } finally {
    btn.disabled = false;
    document.getElementById('analysisLoading').hidden = true;
  }
}

function downloadResult() {
  const text = document.getElementById('resultText').innerText;
  const label = document.getElementById('resultLabel').textContent;
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `AI分析_${label.replace(/\s*[／/]\s*/g, '_')}.txt`;
  a.click();
}

// ===== リスク一覧タブ =====

let riskResults = [];
let riskFilter  = 'all';

function setupRiskTab() {
  document.getElementById('riskScanBtn').addEventListener('click', runRiskScan);
  document.getElementById('riskAnalysisCloseBtn').addEventListener('click', () => {
    document.getElementById('riskAnalysisPanel').hidden = true;
  });
  document.getElementById('riskAnalysisDownloadBtn').addEventListener('click', () => {
    const text  = document.getElementById('riskAnalysisText').innerText;
    const label = document.getElementById('riskAnalysisLabel').textContent;
    const blob  = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const a     = document.createElement('a');
    a.href      = URL.createObjectURL(blob);
    a.download  = `リスク分析_${label.replace(/\s*[／/]\s*/g, '_')}.txt`;
    a.click();
  });

  document.getElementById('riskFilterGroup').addEventListener('click', e => {
    const btn = e.target.closest('.risk-filter-btn');
    if (!btn) return;
    document.querySelectorAll('.risk-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    riskFilter = btn.dataset.filter;
    renderRiskTable();
  });
}

function showRiskTab() {
  const hasData = allRows.length || mamorunoRows.length;
  document.getElementById('riskEmpty').hidden  = !!hasData;
  document.getElementById('riskLoaded').hidden = !hasData;
}

function runRiskScan() {
  const btn = document.getElementById('riskScanBtn');
  const status = document.getElementById('riskScanStatus');
  btn.disabled = true;
  status.textContent = 'スキャン中...';

  // 非同期にして UI を更新させる
  setTimeout(() => {
    try {
      riskResults = window.RiskScanner.scanAll(allRows, mamorunoRows);
      renderRiskSummary();
      renderRiskTable();

      document.getElementById('riskSummaryRow').style.display   = 'flex';
      document.getElementById('riskTableWrap').style.display    = 'block';
      document.getElementById('riskAnalysisPanel').hidden       = true;

      const high = riskResults.filter(r => r.totalRisk >= 60).length;
      const mid  = riskResults.filter(r => r.totalRisk >= 30 && r.totalRisk < 60).length;
      status.textContent = `スキャン完了: 高リスク ${high}名 / 要注意 ${mid}名`;
    } catch (e) {
      showToast('スキャンエラー: ' + e.message);
      status.textContent = '';
    } finally {
      btn.disabled = false;
    }
  }, 20);
}

function renderRiskSummary() {
  const total = riskResults.length;
  const high  = riskResults.filter(r => r.totalRisk >= 60).length;
  const mid   = riskResults.filter(r => r.totalRisk >= 30 && r.totalRisk < 60).length;
  const low   = total - high - mid;

  const mr = document.getElementById('riskSummaryRow');
  mr.innerHTML = '';
  [
    { label: '対象利用者', value: total + ' 名' },
    { label: '高リスク',   value: high  + ' 名', cls: 'metric-card-danger'  },
    { label: '要注意',     value: mid   + ' 名', cls: 'metric-card-caution' },
    { label: '低リスク',   value: low   + ' 名', cls: 'metric-card-safe'    },
  ].forEach(m => {
    const card = document.createElement('div');
    card.className = 'metric-card' + (m.cls ? ' ' + m.cls : '');
    card.innerHTML = `<div class="metric-label">${m.label}</div><div class="metric-value">${m.value}</div>`;
    mr.appendChild(card);
  });
}

function riskLevel(score) {
  if (score >= 60) return 'high';
  if (score >= 30) return 'mid';
  return 'low';
}

function riskBar(score) {
  const level = riskLevel(score);
  const color = level === 'high' ? '#e53e3e' : level === 'mid' ? '#d69e2e' : '#38a169';
  const label = level === 'high' ? '高' : level === 'mid' ? '中' : '低';
  return `<div class="risk-bar-wrap">
    <div class="risk-bar-bg">
      <div class="risk-bar-fill" style="width:${score}%;background:${color};"></div>
    </div>
    <span class="risk-score-num" style="color:${color};">${score}<span class="risk-score-label">${label}</span></span>
  </div>`;
}

function renderRiskTable() {
  const tbody = document.getElementById('riskTableBody');
  tbody.innerHTML = '';

  const filtered = riskResults.filter(r => {
    if (riskFilter === 'high') return r.totalRisk >= 60;
    if (riskFilter === 'mid')  return r.totalRisk >= 30 && r.totalRisk < 60;
    if (riskFilter === 'low')  return r.totalRisk < 30;
    return true;
  });

  if (!filtered.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#718096;padding:24px;">該当なし</td></tr>`;
    return;
  }

  filtered.forEach((r, idx) => {
    const level = riskLevel(r.totalRisk);
    const levelCls = level === 'high' ? 'risk-row-high' : level === 'mid' ? 'risk-row-mid' : '';
    const hReasons = r.hospitalReasons.length ? r.hospitalReasons.join('・') : '―';
    const cReasons = r.changeReasons.length   ? r.changeReasons.join('・')   : '―';

    const tr = document.createElement('tr');
    tr.className = levelCls;
    tr.dataset.user = r.user;
    tr.innerHTML = `
      <td class="risk-rank-col">${idx + 1}</td>
      <td><strong>${r.user}</strong></td>
      <td class="risk-score-col">${riskBar(r.hospitalRisk)}</td>
      <td class="risk-score-col">${riskBar(r.changeRisk)}</td>
      <td class="risk-reason-cell" title="${hReasons}">${hReasons}</td>
      <td class="risk-reason-cell" title="${cReasons}">${cReasons}</td>
      <td class="risk-action-col">
        <button class="btn-ai-risk" data-user="${r.user}">AI分析</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  // AI分析ボタン
  tbody.querySelectorAll('.btn-ai-risk').forEach(btn => {
    btn.addEventListener('click', () => runRiskAnalysis(btn.dataset.user));
  });
}

async function runRiskAnalysis(userName) {
  const apiKey = document.getElementById('apiKey').value.trim();
  if (!apiKey) {
    showToast('サイドバーにAPIキーを入力してください（Anthropic: sk-ant-... または GitHub: ghp_...）');
    return;
  }

  const panel   = document.getElementById('riskAnalysisPanel');
  const loading = document.getElementById('riskAnalysisLoading');
  const textDiv = document.getElementById('riskAnalysisText');
  const label   = document.getElementById('riskAnalysisLabel');

  panel.hidden      = false;
  loading.hidden    = false;
  textDiv.innerHTML = '';
  label.textContent = `リスク詳細分析 ／ ${userName}`;

  // スクロール
  panel.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    const targetRows = allRows.filter(r => {
      const u = r.user_name || r['利用者名'] || r['利用者'] || r['氏名'] || '';
      return u === userName;
    });

    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        rows: targetRows,
        talknoteRows: [],
        analysisType: 'total',
        userName,
        apiKey,
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error);

    const riskInfo = riskResults.find(r => r.user === userName);
    const prefix = riskInfo
      ? `【リスクスコア】入院リスク: ${riskInfo.hospitalRisk}点 ／ 急変リスク: ${riskInfo.changeRisk}点\n` +
        (riskInfo.hospitalReasons.length ? `【入院リスク根拠】${riskInfo.hospitalReasons.join('・')}\n` : '') +
        (riskInfo.changeReasons.length   ? `【急変リスク根拠】${riskInfo.changeReasons.join('・')}\n`   : '') +
        '\n'
      : '';

    const html = (prefix + data.result)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\n/g, '<br>');
    textDiv.innerHTML = html;

  } catch (e) {
    showToast(e.message);
    textDiv.innerHTML = `<span style="color:#e53e3e;">${e.message}</span>`;
  } finally {
    loading.hidden = true;
  }
}

// ===== ユーティリティ =====
function findKey(candidates) {
  if (!summary) return null;
  return summary.columns.find(c => candidates.includes(c)) || null;
}

function showToast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
